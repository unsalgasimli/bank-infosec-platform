import React, { useState, useEffect } from 'react';
import {
  Users,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Shield,
  Sparkles,
  ChevronRight,
  TrendingUp,
  ArrowRight,
  Plus,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useI18n } from '../../context/I18nContext.js';
import { Ticket } from '../../../shared/types/ticket.js';
import { TeamWorkloadMember } from '../../../shared/types/workload.js';

interface WrikeWorkloadViewProps {
  tickets: Ticket[];
  onSelectTicket: (ticket: Ticket) => void;
  onRefreshTickets?: () => void;
  dataScope?: 'authorized' | 'assigned' | 'reported';
}

export const WrikeWorkloadView: React.FC<WrikeWorkloadViewProps> = ({
  tickets,
  onSelectTicket,
  onRefreshTickets,
  dataScope = 'authorized',
}) => {
  const { fetchWithAuth } = useAuth();
  const { t } = useI18n();
  const [members, setMembers] = useState<TeamWorkloadMember[]>([]);
  const [selectedWeek, setSelectedWeek] = useState('Current Sprint Week (Aug 18 - Aug 24)');
  const [totalCapacity, setTotalCapacity] = useState(160);
  const [totalAllocated, setTotalAllocated] = useState(138);
  const [utilizationPct, setUtilizationPct] = useState(86);
  const [rebalancedMessage, setRebalancedMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadWorkload = async () => {
    try {
      setIsLoading(true);
      const res = await fetchWithAuth(`/api/workload?scope=${dataScope}`);
      const data = await res.json();
      if (data.success) {
        setMembers(data.members || []);
        setSelectedWeek(data.selectedWeek || selectedWeek);
        setTotalCapacity(data.totalTeamCapacityHours || 160);
        setTotalAllocated(data.totalAllocatedHours || 138);
        setUtilizationPct(data.overallUtilizationPercent || 86);
      }
    } catch (err) {
      console.error('Failed to load workload data', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadWorkload();
  }, [tickets, dataScope]);

  const handleAutoBalance = async () => {
    const overAllocatedMember = members.find((m) => m.isOverAllocated);
    const availableMember = members.find((m) => !m.isOverAllocated && m.utilizationPercent < 80);

    if (!overAllocatedMember || !availableMember || overAllocatedMember.assignedTicketIds.length === 0) {
      alert('All team members are already optimally balanced.');
      return;
    }

    const ticketToMove = overAllocatedMember.assignedTicketIds[0];

    try {
      const res = await fetchWithAuth('/api/workload/rebalance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromUserId: overAllocatedMember.userId,
          toUserId: availableMember.userId,
          ticketId: ticketToMove,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setRebalancedMessage(`⚡ Auto-balanced: Reassigned task ${data.ticket?.key || ''} from ${overAllocatedMember.name} to ${availableMember.name}!`);
        loadWorkload();
        if (onRefreshTickets) onRefreshTickets();
      }
    } catch (err) {
      console.error('Failed to rebalance workload', err);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-semantic-panel overflow-hidden select-none">
      {/* Wrike Workload Header */}
      <div className="bg-semantic-panel border-b border-semantic-surface-alt px-5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 shadow-wrike-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-semantic-purple-surface text-semantic-purple border border-semantic-purple-border flex items-center justify-center font-bold text-xs">
            <Users className="w-4 h-4 text-semantic-purple" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-semantic-primary">
                {t('Wrike Workload & Resource Capacity')}
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-semantic-purple-surface text-semantic-purple text-caption font-bold border border-semantic-purple-border">
                {t('Real-Time Backend Synced')} ({utilizationPct}%)
              </span>
            </div>
            <p className="text-label text-semantic-jira-muted-alt">
              {t('Monitor team capacity, prevent analyst burnout, and balance emergency security workload.')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-semantic-jira-muted-alt font-medium hidden md:inline">{selectedWeek}</span>
          <button
            onClick={handleAutoBalance}
            className="wrike-btn-primary text-xs py-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t('Auto-Balance Capacity')}</span>
          </button>
        </div>
      </div>

      {/* Main Workload Capacity Rows */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar bg-semantic-page-muted">
        <div className="max-w-5xl space-y-4">
          {rebalancedMessage && (
            <div className="p-3 rounded-lg bg-semantic-success-surface border border-semantic-success-border text-xs font-semibold text-semantic-success flex items-center gap-2 shadow-sm">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{rebalancedMessage}</span>
            </div>
          )}

          {members.map((member) => {
            const memberTickets = tickets.filter((t) => member.assignedTicketIds.includes(t.id));

            return (
              <div
                key={member.userId}
                className="wrike-card p-4 flex flex-col justify-between space-y-3 shadow-wrike-sm hover:border-semantic-brand transition-colors"
              >
                {/* Member Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-semantic-brand text-white flex items-center justify-center font-bold text-xs shadow-sm">
                      {member.avatar}
                    </div>
                    <div>
                      <div className="font-bold text-semantic-primary text-sm flex items-center gap-2">
                        <span>{member.name}</span>
                        <span className="text-label font-normal text-semantic-jira-muted-alt">• {member.role}</span>
                      </div>
                      <div className="text-label text-semantic-jira-muted-alt">{member.title}</div>
                    </div>
                  </div>

                  {/* Allocation Status Badge */}
                  <div className="text-right">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs font-bold font-mono ${member.isOverAllocated ? 'text-semantic-brand-danger' : 'text-semantic-success'}`}>
                        {member.allocatedWeeklyHours}h / {member.maxWeeklyHours}h ({member.utilizationPercent}%)
                      </span>
                      {member.isOverAllocated ? (
                        <span className="px-2 py-0.5 rounded-full bg-semantic-danger-surface text-semantic-danger border border-semantic-danger-border text-caption font-bold flex items-center gap-1">
                          <AlertTriangle className="w-2.5 h-2.5" /> {t('Over Capacity')}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-semantic-success-surface text-semantic-success border border-semantic-success-border text-caption font-bold">
                          {t('Optimal')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Capacity Progress Meter */}
                <div>
                  <div className="w-full h-2 rounded-full bg-semantic-table overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        member.isOverAllocated ? 'bg-semantic-brand-danger' : member.utilizationPercent > 75 ? 'bg-semantic-brand' : 'bg-semantic-info'
                      }`}
                      style={{ width: `${Math.min(100, member.utilizationPercent)}%` }}
                    />
                  </div>
                </div>

                {/* Assigned Tasks Strip */}
                <div className="pt-2 border-t border-semantic-table">
                  <div className="text-caption font-bold uppercase tracking-wider text-semantic-jira-muted-alt mb-1.5">
                    {t('Active Assigned Work')} ({memberTickets.length} {t('items')})
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {memberTickets.length === 0 ? (
                      <span className="text-xs text-semantic-muted-alt italic">{t('No active high-priority tasks assigned.')}</span>
                    ) : (
                      memberTickets.map((t) => (
                        <div
                          key={t.id}
                          onClick={() => onSelectTicket(t)}
                          className="px-2.5 py-1.5 bg-semantic-subtle border border-semantic-surface-alt hover:border-semantic-brand rounded-md text-xs cursor-pointer flex items-center gap-2 transition-colors"
                        >
                          <span className="font-mono font-bold text-semantic-info text-label">{t.key}</span>
                          <span className="font-medium text-semantic-primary truncate max-w-dsTruncateWide">{t.title}</span>
                          <span className="wrike-pill wrike-pill-gray text-micro">{t.statusName}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
