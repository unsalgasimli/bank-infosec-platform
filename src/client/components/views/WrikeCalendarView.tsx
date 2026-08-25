import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Ticket } from '../../../shared/types/ticket.js';
import { Badge } from '../common/Badge.js';

interface WrikeCalendarViewProps {
  tickets: Ticket[];
  onSelectTicket: (ticket: Ticket) => void;
}

export const WrikeCalendarView: React.FC<WrikeCalendarViewProps> = ({ tickets, onSelectTicket }) => {
  const [currentDate, setCurrentDate] = useState(() => new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const todayMonth = () => {
    setCurrentDate(new Date());
  };

  const firstDayOfMonth = new Date(year, month, 1);
  const startingDayOfWeek = firstDayOfMonth.getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Calendar cells (previous month padding + current month days)
  const calendarCells = [];
  for (let i = 0; i < startingDayOfWeek; i++) {
    calendarCells.push({ isCurrentMonth: false, dayNumber: null, dateStr: '' });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    calendarCells.push({ isCurrentMonth: true, dayNumber: d, dateStr: dStr });
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex-1 flex flex-col h-full bg-semantic-panel overflow-hidden select-none">
      {/* Calendar Month Navigation Sub-bar */}
      <div className="bg-semantic-subtle border-b border-semantic-border px-6 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="p-1 rounded-md hover:bg-semantic-border text-semantic-secondary transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-bold text-sm text-semantic-primary min-w-[150px] text-center">
            {monthNames[month]} {year}
          </span>
          <button
            onClick={nextMonth}
            className="p-1 rounded-md hover:bg-semantic-border text-semantic-secondary transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={todayMonth}
            className="ml-2 px-2.5 py-1 text-xs font-semibold rounded-md border border-semantic-border-strong bg-semantic-panel hover:bg-semantic-neutral-surface text-semantic-primary"
          >
            Today
          </button>
        </div>

        <div className="flex items-center gap-4 text-xs font-medium text-semantic-muted">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-semantic-brand-danger" /> Critical SLA
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-semantic-info" /> Active Task
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-semantic-brand" /> Completed
          </span>
        </div>
      </div>

      {/* Weekday Headers */}
      <div className="grid grid-cols-7 border-b border-semantic-border bg-semantic-subtle text-center text-xs font-bold text-semantic-secondary uppercase tracking-wider py-2">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 grid grid-cols-7 grid-rows-5 overflow-y-auto custom-scrollbar divide-x divide-y divide-semantic-border">
        {calendarCells.map((cell, idx) => {
          if (!cell.isCurrentMonth || !cell.dayNumber) {
            return (
              <div key={idx} className="bg-semantic-subtle/50 p-2 min-h-dsCalendarCell text-xs text-semantic-placeholder" />
            );
          }

          const isToday = cell.dateStr === todayStr;

          // Find tickets with due date or created date matching this day
          const dayTickets = tickets.filter((t) => {
            const ticketDate = (t.dueDate || t.remediationDeadline || t.createdAt || '').slice(0, 10);
            return ticketDate === cell.dateStr;
          });

          return (
            <div
              key={idx}
              className={`p-2 min-h-dsCalendarCell flex flex-col justify-between transition-colors overflow-hidden ${
                isToday ? 'bg-semantic-success-surface/30 ring-1 ring-inset ring-semantic-brand' : 'bg-semantic-panel hover:bg-semantic-subtle'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`text-xs font-bold font-mono ${
                    isToday
                      ? 'w-6 h-6 rounded-full bg-semantic-brand text-white flex items-center justify-center text-label'
                      : 'text-semantic-secondary'
                  }`}
                >
                  {cell.dayNumber}
                </span>

                {dayTickets.length > 0 && (
                  <span className="text-caption font-mono font-bold text-semantic-muted bg-semantic-neutral-surface px-1.5 py-0.2 rounded border border-semantic-border">
                    {dayTickets.length}
                  </span>
                )}
              </div>

              {/* Day Tickets Stack */}
              <div className="space-y-1 flex-1 overflow-y-auto custom-scrollbar max-h-24">
                {dayTickets.map((t) => {
                  const isDone = t.statusCategory === 'DONE';
                  const isCrit = t.technicalSeverity === 'CRITICAL';

                  return (
                    <div
                      key={t.id}
                      onClick={() => onSelectTicket(t)}
                      className={`p-1.5 rounded text-label border cursor-pointer truncate transition-all ${
                        isDone
                          ? 'bg-semantic-success-surface border-semantic-success-border text-semantic-success hover:border-semantic-brand'
                          : isCrit
                          ? 'bg-semantic-danger-surface border-semantic-danger-border text-semantic-danger font-bold hover:border-semantic-brand-danger'
                          : 'bg-semantic-info-surface border-semantic-info-border text-semantic-info hover:border-semantic-info'
                      }`}
                      title={`${t.key}: ${t.title} (${t.statusName})`}
                    >
                      <div className="flex items-center gap-1">
                        <span className="font-mono font-bold">{t.key}</span>
                        <span className="truncate">{t.title}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
