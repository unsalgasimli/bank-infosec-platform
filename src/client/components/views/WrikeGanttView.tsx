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
}

export const WrikeGanttView: React.FC<WrikeGanttViewProps> = ({
  tickets,
  onSelectTicket,
  onOpenCreate,
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
      const res = await fetchWithAuth('/api/gantt');
      const data = await res.json();
      if (data.success) {
        setGanttTasks(data.tasks || []);
        setDependencies(data.dependencies || []);
        setCriticalPathIds(data.criticalPathTaskIds || []);
      }
    } catch (err) {
      console.error('Failed to load gantt data', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadGanttData();
  }, [tickets]);

  // Generate timeline days for the current sprint
  const timelineDays = Array.from({ length: 28 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 7 + i);
    return d;
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-[#FFFFFF] overflow-hidden select-none">
      {/* Wrike Gantt Header */}
      <div className="bg-[#FFFFFF] border-b border-[#DCE1EB] px-5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 shadow-wrike-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#EBF4FD] text-[#0073D3] border border-[#BAE0FD] flex items-center justify-center font-bold text-xs">
            <Calendar className="w-4 h-4 text-[#0073D3]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-[#162136]">
                Wrike Interactive Gantt Chart & Schedule
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-[#EBF4FD] text-[#0073D3] text-[10px] font-bold border border-[#BAE0FD]">
                Real-Time Backend Synced
              </span>
            </div>
            <p className="text-[11px] text-[#657694]">
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
                ? 'bg-[#FDE8EB] text-[#CF1322] border-[#FFA39E]'
                : 'bg-[#F8FAFC] text-[#657694] border-[#DCE1EB]'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>Critical Path ({criticalPathIds.length})</span>
          </button>

          {/* Zoom controls */}
          <div className="flex items-center bg-[#F8FAFC] border border-[#DCE1EB] rounded-md p-0.5 text-xs">
            {(['DAYS', 'WEEKS', 'MONTHS'] as const).map((z) => (
              <button
                key={z}
                onClick={() => setTimeZoom(z)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                  timeZoom === z ? 'bg-[#0073D3] text-white font-semibold shadow-sm' : 'text-[#657694] hover:text-[#162136]'
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
        <div className="w-72 bg-[#FFFFFF] border-r border-[#DCE1EB] flex flex-col shrink-0 overflow-y-auto custom-scrollbar">
          <div className="p-2.5 bg-[#F8FAFC] border-b border-[#DCE1EB] font-bold text-[11px] uppercase tracking-wider text-[#657694] sticky top-0 z-10">
            Work Breakdown / Task ({ganttTasks.length})
          </div>
          <div className="divide-y divide-[#EBF0F7]">
            {ganttTasks.map((task) => {
              const matchedTicket = tickets.find((t) => t.id === task.id);
              const isCrit = criticalPathIds.includes(task.id);

              return (
                <div
                  key={task.id}
                  onClick={() => matchedTicket && onSelectTicket(matchedTicket)}
                  className="p-2.5 hover:bg-[#F8FAFC] cursor-pointer transition-colors flex items-center justify-between gap-2 h-14"
                >
                  <div className="truncate">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-[11px] text-[#0073D3]">{task.ticketKey}</span>
                      {isCrit && (
                        <span className="w-2 h-2 rounded-full bg-[#E51739]" title="Critical Path" />
                      )}
                    </div>
                    <div className="text-xs font-semibold text-[#162136] truncate">{task.title}</div>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-[#BFC7D9] shrink-0" />
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Timeline Canvas Pane */}
        <div className="flex-1 flex flex-col overflow-x-auto overflow-y-auto custom-scrollbar relative bg-[#FFFFFF]">
          {/* Calendar Header Row */}
          <div className="flex border-b border-[#DCE1EB] bg-[#F8FAFC] sticky top-0 z-10 min-w-[1120px]">
            {timelineDays.map((day, idx) => {
              const isToday = day.toDateString() === new Date().toDateString();
              const isWeekend = day.getDay() === 0 || day.getDay() === 6;

              return (
                <div
                  key={idx}
                  className={`w-10 text-center py-2 border-r border-[#EBF0F7] shrink-0 text-[10px] ${
                    isToday
                      ? 'bg-[#E6F7EF] font-bold text-[#007860]'
                      : isWeekend
                      ? 'bg-[#F2F5FA] text-[#8F9CAE]'
                      : 'text-[#657694]'
                  }`}
                >
                  <div>{day.toLocaleDateString('en-US', { weekday: 'narrow' })}</div>
                  <div className="font-mono font-semibold">{day.getDate()}</div>
                </div>
              );
            })}
          </div>

          {/* Timeline Grid & Task Bars */}
          <div className="wrike-gantt-grid min-w-[1120px] flex-1 divide-y divide-[#EBF0F7] relative">
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
                        ? 'bg-gradient-to-r from-[#E51739] to-[#FA8C16] border border-[#CF1322]'
                        : task.statusCategory === 'DONE'
                        ? 'bg-[#00B259] border border-[#00964B]'
                        : 'bg-[#0073D3] border border-[#005CAD]'
                    }`}
                  >
                    <span className="truncate max-w-[140px] text-[11px]">{task.ticketKey}: {task.title}</span>
                    <span className="font-mono text-[10px] opacity-90">{task.progressPercent}%</span>
                  </div>

                  {/* Milestone Diamond on Critical items */}
                  {task.isMilestone && (
                    <div
                      style={{ left: `${(startOffset + durationWidth) * 40 - 12}px` }}
                      className="absolute w-6 h-6 rotate-45 bg-[#FA8C16] border-2 border-white shadow-sm flex items-center justify-center z-10"
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
