import { LDAPSyncService, LDAPSyncReport } from './ldap-sync.service.js';
import { logger } from './logger.service.js';
import { config } from '../config/index.js';
import { db } from '../db/database.js';
import { BankUser } from '../../shared/types/auth.js';

export interface LDAPSchedulerStatus {
  isSchedulerActive: boolean;
  schedule: string;
  targetTimeGMT4: string;
  timezone: string;
  nextRunAt: string;
  nextRunFormattedGMT4: string;
  nextRunInSeconds: number;
  lastRunAt: string | null;
  lastRunFormattedGMT4: string | null;
  lastSyncReport: LDAPSyncReport | null;
  isLiveLdapConfigured: boolean;
  departmentOverview: Array<{
    id: string;
    code: string;
    name: string;
    totalMembers: number;
    activeMembers: number;
    disabledMembers: number;
  }>;
}

export class LDAPSchedulerService {
  private static timerHandle: NodeJS.Timeout | null = null;
  private static tickerHandle: NodeJS.Timeout | null = null;
  private static startupTimerHandle: NodeJS.Timeout | null = null;
  private static isRunning = false;
  private static lastRunAt: Date | null = null;
  private static nextRunAt: Date | null = null;
  private static lastExecutedDateKey = ''; // format: "YYYY-MM-DD" in GMT+4

  /**
   * Computes exact next Date and millisecond delay for 13:30 GMT+4
   * Timezone: GMT+4 (Azerbaijan / Asia/Baku, UTC+4 hours, no daylight saving)
   */
  public static calculateNextRunGMT4(targetHour = 13, targetMinute = 30): {
    nextRunDate: Date;
    delayMs: number;
    gmt4Formatted: string;
  } {
    const nowMs = Date.now();
    const gmt4OffsetMs = 4 * 3600 * 1000;
    const nowGmt4 = new Date(nowMs + gmt4OffsetMs);

    const year = nowGmt4.getUTCFullYear();
    const month = nowGmt4.getUTCMonth();
    const day = nowGmt4.getUTCDate();
    const curHour = nowGmt4.getUTCHours();
    const curMinute = nowGmt4.getUTCMinutes();
    const curSecond = nowGmt4.getUTCSeconds();

    let targetDay = day;
    // If current GMT+4 time is at or after targetHour:targetMinute, schedule for tomorrow
    if (curHour > targetHour || (curHour === targetHour && (curMinute > targetMinute || (curMinute === targetMinute && curSecond >= 0)))) {
      targetDay = day + 1;
    }

    // 13:30 GMT+4 = (13 - 4):30 = 09:30 UTC
    const targetUtcHour = targetHour - 4;
    const nextRunUtcMs = Date.UTC(year, month, targetDay, targetUtcHour, targetMinute, 0, 0);
    const delayMs = Math.max(1000, nextRunUtcMs - nowMs);
    const nextRunDate = new Date(nextRunUtcMs);

    const targetGmt4Date = new Date(nextRunUtcMs + gmt4OffsetMs);
    const gmt4Formatted = `${targetGmt4Date.getUTCFullYear()}-${String(targetGmt4Date.getUTCMonth() + 1).padStart(2, '0')}-${String(targetGmt4Date.getUTCDate()).padStart(2, '0')} ${String(targetHour).padStart(2, '0')}:${String(targetMinute).padStart(2, '0')}:00 GMT+4 (Asia/Baku)`;

    return {
      nextRunDate,
      delayMs,
      gmt4Formatted,
    };
  }

  /**
   * Initializes and starts the background daily scheduler at 13:30 GMT+4
   */
  public static startScheduler(): void {
    if (this.isRunning) {
      logger.info('LDAP Daily Scheduler is already active');
      return;
    }

    this.isRunning = true;
    const [tHourStr, tMinStr] = (config.LDAP_SYNC_TIME_GMT4 || '13:30').split(':');
    const targetHour = parseInt(tHourStr, 10) || 13;
    const targetMinute = parseInt(tMinStr, 10) || 30;

    const { nextRunDate, delayMs, gmt4Formatted } = this.calculateNextRunGMT4(targetHour, targetMinute);
    this.nextRunAt = nextRunDate;

    logger.info(
      {
        schedule: `Daily at ${targetHour}:${String(targetMinute).padStart(2, '0')} GMT+4`,
        timezone: config.LDAP_SYNC_TIMEZONE || 'Asia/Baku (GMT+4)',
        nextRunAt: gmt4Formatted,
        delaySeconds: Math.round(delayMs / 1000),
      },
      '⏰ LDAP Daily Synchronization Scheduler initialized & active at 13:30 GMT+4'
    );

    // 1. Arm the main precision timer
    this.scheduleNextRun(targetHour, targetMinute);

    // 2. Arm the 60-second heartbeat ticker for clock drift / wake-up protection
    this.startHeartbeatTicker(targetHour, targetMinute);

    // 3. Execute startup verification check if DB has not been synchronized
    this.runStartupCheck();
  }

  /**
   * Schedules the next run using precise setTimeout
   */
  private static scheduleNextRun(targetHour: number, targetMinute: number): void {
    if (this.timerHandle) {
      clearTimeout(this.timerHandle);
      this.timerHandle = null;
    }

    const { nextRunDate, delayMs, gmt4Formatted } = this.calculateNextRunGMT4(targetHour, targetMinute);
    this.nextRunAt = nextRunDate;

    this.timerHandle = setTimeout(async () => {
      try {
        await this.executeScheduledSync('SCHEDULED_DAILY_CHECK');
      } catch (err: any) {
        logger.error({ err: err.message }, 'Scheduled LDAP Daily Sync check failed');
      } finally {
        // Reschedule for next day at 13:30 GMT+4
        this.scheduleNextRun(targetHour, targetMinute);
      }
    }, delayMs);

    // Unref timer so it doesn't block process exit if needed
    if (this.timerHandle && typeof this.timerHandle.unref === 'function') {
      this.timerHandle.unref();
    }
  }

  /**
   * Heartbeat ticker checking every 60 seconds to ensure 13:30 GMT+4 is never missed
   */
  private static startHeartbeatTicker(targetHour: number, targetMinute: number): void {
    if (this.tickerHandle) {
      clearInterval(this.tickerHandle);
      this.tickerHandle = null;
    }

    this.tickerHandle = setInterval(async () => {
      try {
        const gmt4OffsetMs = 4 * 3600 * 1000;
        const nowGmt4 = new Date(Date.now() + gmt4OffsetMs);
        const curHour = nowGmt4.getUTCHours();
        const curMinute = nowGmt4.getUTCMinutes();
        const dateKey = `${nowGmt4.getUTCFullYear()}-${String(nowGmt4.getUTCMonth() + 1).padStart(2, '0')}-${String(nowGmt4.getUTCDate()).padStart(2, '0')}`;

        if (curHour === targetHour && curMinute === targetMinute) {
          if (this.lastExecutedDateKey !== dateKey) {
            logger.info({ dateKey, time: `${curHour}:${curMinute} GMT+4` }, '⏰ Heartbeat ticker detected exact 13:30 GMT+4 daily check window!');
            await this.executeScheduledSync('SCHEDULED_DAILY_CHECK');
          }
        }
      } catch (tickerErr: any) {
        logger.warn({ err: tickerErr.message }, 'LDAP Scheduler heartbeat ticker warning');
      }
    }, 60000);

    if (this.tickerHandle && typeof this.tickerHandle.unref === 'function') {
      this.tickerHandle.unref();
    }
  }

  /**
   * Executes the daily synchronization pipeline and updates scheduler metadata
   */
  public static async executeScheduledSync(
    trigger: 'SCHEDULED_DAILY_CHECK' | 'MANUAL_TRIGGER' | 'STARTUP_CHECK' = 'SCHEDULED_DAILY_CHECK',
    actor?: BankUser
  ): Promise<LDAPSyncReport> {
    const report = await LDAPSyncService.syncAllUsers({ trigger, actor });
    this.lastRunAt = new Date();

    const gmt4OffsetMs = 4 * 3600 * 1000;
    const nowGmt4 = new Date(Date.now() + gmt4OffsetMs);
    this.lastExecutedDateKey = `${nowGmt4.getUTCFullYear()}-${String(nowGmt4.getUTCMonth() + 1).padStart(2, '0')}-${String(nowGmt4.getUTCDate()).padStart(2, '0')}`;

    return report;
  }

  /**
   * Runs an initial startup directory synchronization
   */
  private static async runStartupCheck(): Promise<void> {
    if (process.env.NODE_ENV === 'test') {
      return; // Avoid background startup sync in test runner
    }

    try {
      if (this.startupTimerHandle) {
        clearTimeout(this.startupTimerHandle);
        this.startupTimerHandle = null;
      }
      // Small 1.5s delay to allow server middleware & DB to settle
      this.startupTimerHandle = setTimeout(async () => {
        logger.info('Performing initial Active Directory / LDAP user synchronization on startup...');
        await this.executeScheduledSync('STARTUP_CHECK');
      }, 1500);
      if (this.startupTimerHandle && typeof this.startupTimerHandle.unref === 'function') {
        this.startupTimerHandle.unref();
      }
    } catch (err: any) {
      logger.warn({ err: err.message }, 'Startup LDAP directory check error');
    }
  }

  /**
   * Triggers an immediate on-demand synchronization check
   */
  public static async triggerManualSync(actor?: BankUser): Promise<LDAPSyncReport> {
    logger.info({ actor: actor?.username || 'SYSTEM' }, 'Admin requested manual LDAP Sync check');
    return await this.executeScheduledSync('MANUAL_TRIGGER', actor);
  }

  /**
   * Stops and tears down the scheduler timers gracefully
   */
  public static stopScheduler(): void {
    if (this.timerHandle) {
      clearTimeout(this.timerHandle);
      this.timerHandle = null;
    }
    if (this.tickerHandle) {
      clearInterval(this.tickerHandle);
      this.tickerHandle = null;
    }
    if (this.startupTimerHandle) {
      clearTimeout(this.startupTimerHandle);
      this.startupTimerHandle = null;
    }
    this.isRunning = false;
    logger.info('LDAP Daily Scheduler stopped');
  }

  /**
   * Returns current scheduler health, next 13:30 GMT+4 run, last run stats, and department breakdown
   */
  public static getStatus(): LDAPSchedulerStatus {
    const [tHourStr, tMinStr] = (config.LDAP_SYNC_TIME_GMT4 || '13:30').split(':');
    const targetHour = parseInt(tHourStr, 10) || 13;
    const targetMinute = parseInt(tMinStr, 10) || 30;

    const { nextRunDate, delayMs, gmt4Formatted } = this.calculateNextRunGMT4(targetHour, targetMinute);
    const lastReport = LDAPSyncService.getLastSyncReport();

    const gmt4OffsetMs = 4 * 3600 * 1000;
    let lastRunFormattedGMT4: string | null = null;
    if (this.lastRunAt) {
      const lastGmt4 = new Date(this.lastRunAt.getTime() + gmt4OffsetMs);
      lastRunFormattedGMT4 = `${lastGmt4.getUTCFullYear()}-${String(lastGmt4.getUTCMonth() + 1).padStart(2, '0')}-${String(lastGmt4.getUTCDate()).padStart(2, '0')} ${String(lastGmt4.getUTCHours()).padStart(2, '0')}:${String(lastGmt4.getUTCMinutes()).padStart(2, '0')}:${String(lastGmt4.getUTCSeconds()).padStart(2, '0')} GMT+4`;
    }

    // Department Breakdown
    const departmentOverview = (db.data.departments || []).map((dept) => {
      const usersInDept = (db.data.users || []).filter((u) => u.departmentId === dept.id);
      return {
        id: dept.id,
        code: dept.code,
        name: dept.name,
        totalMembers: usersInDept.length,
        activeMembers: usersInDept.filter((u) => u.isActive).length,
        disabledMembers: usersInDept.filter((u) => !u.isActive).length,
      };
    });

    return {
      isSchedulerActive: this.isRunning,
      schedule: `Daily at ${config.LDAP_SYNC_TIME_GMT4 || '13:30'} GMT+4 (Asia/Baku)`,
      targetTimeGMT4: config.LDAP_SYNC_TIME_GMT4 || '13:30',
      timezone: 'GMT+4 (Asia/Baku)',
      nextRunAt: nextRunDate.toISOString(),
      nextRunFormattedGMT4: gmt4Formatted,
      nextRunInSeconds: Math.round(delayMs / 1000),
      lastRunAt: this.lastRunAt ? this.lastRunAt.toISOString() : null,
      lastRunFormattedGMT4,
      lastSyncReport: lastReport,
      isLiveLdapConfigured: Boolean(config.LDAP_ENABLED),
      departmentOverview,
    };
  }
}
