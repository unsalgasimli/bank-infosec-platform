import React, { useState, useEffect } from 'react';
import {
  Calendar,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Layers,
  ArrowRight,
  Clock,
  Shield,
  Flame,
  AlertTriangle,
  CheckCircle2,
  Filter,
  Download,
  Plus,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { Ticket } from '../../../shared/types/ticket.js';
import { GanttTaskSchedule, GanttDependency } from '../../../shared/types/gantt.js';

interface WrikeGanttViewProps {
  tickets: Ticket[];
  onSelectTicket: (ticket: Ticket) => void;
  onOpenCreate: () => void;
  dataScope?: 'authorized' | 'assigned' | 'reported';
}

export const WrikeGanttView: React.FC<WrikeGanttViewProps> = ({
  tickets,
  onSelectTicket,
  onOpenCreate,
  dataScope = 'authorized',
}) => {
  const { fetchWithAuth } = useAuth();
  const [timeZoom, setTimeZoom] = useState<'DAYS' | 'WEEKS' | 'MONTHS'>('WEEKS');
  const [highlightCriticalPath, setHighlightCriticalPath] = useState(true);

  const [ganttTasks, setGanttTasks] = useState<GanttTaskSchedule[]>([]);
  const [dependencies, setDependencies] = useState<GanttDependency[]>([]);
  const [criticalPathIds, setCriticalPathIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadGanttData = async () => {
    try {
      setIsLoading(true);
      // The API applies this scope against the authenticated server session.
      // It is not a client-side authorization decision.
      const res = await fetchWithAuth(`/api/gantt?scope=${dataScope}`);
      const data = await res.json();
      if (data.success) {
        // Keep the visualization aligned with the enclosing work view even if a
        // future API regression returns an out-of-scope item.
        const allowedTicketIds = new Set(tickets.map((ticket) => ticket.id));
        const visibleTasks = (data.tasks || []).filter((task: GanttTaskSchedule) => allowedTicketIds.has(task.id));
        setGanttTasks(visibleTasks);
        setDependencies((data.dependencies || []).filter((dependency: GanttDependency) =>
          allowedTicketIds.has(dependency.fromTaskId) && allowedTicketIds.has(dependency.toTaskId)
        ));
        setCriticalPathIds((data.criticalPathTaskIds || []).filter((taskId: string) => allowedTicketIds.has(taskId)));
      } else {
        setGanttTasks([]);
        setDependencies([]);
        setCriticalPathIds([]);
      }
    } catch (err) {
      console.error('Failed to load gantt data', err);
      setGanttTasks([]);
      setDependencies([]);
      setCriticalPathIds([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadGanttData();
  }, [tickets, dataScope]);

  // Generate timeline days for the current sprint
  const timelineDays = Array.from({ length: 28 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 7 + i);
    return d;
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-semantic-panel overflow-hidden select-none">
      {/* Wrike Gantt Header */}
      <div className="bg-semantic-panel border-b border-semantic-surface-alt px-5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 shadow-wrike-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-semantic-info-surface text-semantic-info border border-semantic-info-border flex items-center justify-center font-bold text-xs">
            <Calendar className="w-4 h-4 text-semantic-info" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-semantic-primary">
                Wrike Interactive Gantt Chart & Schedule
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-semantic-info-surface text-semantic-info text-caption font-bold border border-semantic-info-border">
                Real-Time Backend Synced
              </span>
            </div>
            <p className="text-label text-semantic-jira-muted-alt">
              Manage critical paths, SLA milestone deadlines, and task dependency sequences.
            </p>
          </div>
        </div>

        {/* Gantt Controls */}
        <div className="flex items-center gap-2">
          {/* Critical Path Toggle */}
          <button
            onClick={() => setHighlightCriticalPath(!highlightCriticalPath)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors flex items-center gap-1.5 ${
              highlightCriticalPath
                ? 'bg-semantic-danger-surface text-semantic-danger border-semantic-danger-border'
                : 'bg-semantic-subtle text-semantic-jira-muted-alt border-semantic-surface-alt'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>Critical Path ({criticalPathIds.length})</span>
          </button>

          {/* Zoom controls */}
          <div className="flex items-center bg-semantic-subtle border border-semantic-surface-alt rounded-md p-0.5 text-xs">
            {(['DAYS', 'WEEKS', 'MONTHS'] as const).map((z) => (
              <button
                key={z}
                onClick={() => setTimeZoom(z)}
                className={`px-2.5 py-1 rounded text-label font-medium transition-colors ${
                  timeZoom === z ? 'bg-semantic-info text-white font-semibold shadow-sm' : 'text-semantic-jira-muted-alt hover:text-semantic-primary'
                }`}
              >
                {z}
              </button>
            ))}
          </div>

          <button
            onClick={onOpenCreate}
            className="wrike-btn-primary text-xs py-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Milestone</span>
          </button>
        </div>
      </div>

      {/* Main Gantt Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Task List Pane */}
        <div className="w-72 bg-semantic-panel border-r border-semantic-surface-alt flex flex-col shrink-0 overflow-y-auto custom-scrollbar">
          <div className="p-2.5 bg-semantic-subtle border-b border-semantic-surface-alt font-bold text-label uppercase tracking-wider text-semantic-jira-muted-alt sticky top-0 z-dsContent">
            Work Breakdown / Task ({ganttTasks.length})
          </div>
          <div className="divide-y divide-semantic-table">
            {ganttTasks.map((task) => {
              const matchedTicket = tickets.find((t) => t.id === task.id);
              const isCrit = criticalPathIds.includes(task.id);

              return (
                <div
                  key={task.id}
                  onClick={() => matchedTicket && onSelectTicket(matchedTicket)}
                  className="p-2.5 hover:bg-semantic-subtle cursor-pointer transition-colors flex items-center justify-between gap-2 h-14"
                >
                  <div className="truncate">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-label text-semantic-info">{task.ticketKey}</span>
                      {isCrit && (
                        <span className="w-2 h-2 rounded-full bg-semantic-brand-danger" title="Critical Path" />
                      )}
                    </div>
                    <div className="text-xs font-semibold text-semantic-primary truncate">{task.title}</div>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-semantic-dark-muted shrink-0" />
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Timeline Canvas Pane */}
        <div className="flex-1 flex flex-col overflow-x-auto overflow-y-auto custom-scrollbar relative bg-semantic-panel">
          {/* Calendar Header Row */}
          <div className="flex border-b border-semantic-surface-alt bg-semantic-subtle sticky top-0 z-dsContent min-w-dsTimeline">
            {timelineDays.map((day, idx) => {
              const isToday = day.toDateString() === new Date().toDateString();
              const isWeekend = day.getDay() === 0 || day.getDay() === 6;

              return (
                <div
                  key={idx}
                  className={`w-10 text-center py-2 border-r border-semantic-table shrink-0 text-caption ${
                    isToday
                      ? 'bg-semantic-success-surface font-bold text-semantic-success'
                      : isWeekend
                      ? 'bg-semantic-page-muted text-semantic-muted-alt'
                      : 'text-semantic-jira-muted-alt'
                  }`}
                >
                  <div>{day.toLocaleDateString('en-US', { weekday: 'narrow' })}</div>
                  <div className="font-mono font-semibold">{day.getDate()}</div>
                </div>
              );
            })}
          </div>

          {/* Timeline Grid & Task Bars */}
          <div className="wrike-gantt-grid min-w-dsTimeline flex-1 divide-y divide-semantic-table relative">
            {ganttTasks.map((task, index) => {
              const startOffset = Math.min(20, Math.max(2, (index * 3) % 18));
              const durationWidth = Math.min(18, Math.max(4, 6 + (index % 4) * 2));
              const isCritical = criticalPathIds.includes(task.id);
              const matchedTicket = tickets.find((t) => t.id === task.id);

              return (
                <div key={task.id} className="h-14 relative flex items-center">
                  {/* Task Bar */}
                  <div
                    onClick={() => matchedTicket && onSelectTicket(matchedTicket)}
                    style={{
                      left: `${startOffset * 40}px`,
                      width: `${durationWidth * 40}px`,
                    }}
                    className={`absolute h-7 rounded-md shadow-sm flex items-center justify-between px-2.5 text-xs text-white font-semibold cursor-pointer transition-all hover:brightness-105 ${
                      isCritical && highlightCriticalPath
                        ? 'bg-gradient-to-r from-semantic-brand-danger to-semantic-warning-bright border border-semantic-danger'
                        : task.statusCategory === 'DONE'
                        ? 'bg-semantic-brand border border-semantic-brandHover'
                        : 'bg-semantic-info border border-semantic-info-hover'
                    }`}
                  >
                    <span className="truncate max-w-[140px] text-label">{task.ticketKey}: {task.title}</span>
                    <span className="font-mono text-caption opacity-90">{task.progressPercent}%</span>
                  </div>

                  {/* Milestone Diamond on Critical items */}
                  {task.isMilestone && (
                    <div
                      style={{ left: `${(startOffset + durationWidth) * 40 - 12}px` }}
                      className="absolute w-6 h-6 rotate-45 bg-semantic-warning-bright border-2 border-white shadow-sm flex items-center justify-center z-dsContent"
                      title="SLA Milestone Target"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
