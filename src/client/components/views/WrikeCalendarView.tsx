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
    <div className="flex-1 flex flex-col h-full bg-[#FFFFFF] overflow-hidden select-none">
      {/* Calendar Month Navigation Sub-bar */}
      <div className="bg-[#F8FAFC] border-b border-[#E2E8F0] px-6 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="p-1 rounded-md hover:bg-[#E2E8F0] text-[#475569] transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-bold text-sm text-[#162136] min-w-[150px] text-center">
            {monthNames[month]} {year}
          </span>
          <button
            onClick={nextMonth}
            className="p-1 rounded-md hover:bg-[#E2E8F0] text-[#475569] transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={todayMonth}
            className="ml-2 px-2.5 py-1 text-xs font-semibold rounded-md border border-[#CBD5E1] bg-[#FFFFFF] hover:bg-[#F1F5F9] text-[#162136]"
          >
            Today
          </button>
        </div>

        <div className="flex items-center gap-4 text-xs font-medium text-[#64748B]">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#E51739]" /> Critical SLA
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#0073D3]" /> Active Task
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#00B259]" /> Completed
          </span>
        </div>
      </div>

      {/* Weekday Headers */}
      <div className="grid grid-cols-7 border-b border-[#E2E8F0] bg-[#F8FAFC] text-center text-xs font-bold text-[#475569] uppercase tracking-wider py-2">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 grid grid-cols-7 grid-rows-5 overflow-y-auto custom-scrollbar divide-x divide-y divide-[#E2E8F0]">
        {calendarCells.map((cell, idx) => {
          if (!cell.isCurrentMonth || !cell.dayNumber) {
            return (
              <div key={idx} className="bg-[#F8FAFC]/50 p-2 min-h-[110px] text-xs text-[#94A3B8]" />
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
              className={`p-2 min-h-[110px] flex flex-col justify-between transition-colors overflow-hidden ${
                isToday ? 'bg-[#E6F7EF]/30 ring-1 ring-inset ring-[#00B259]' : 'bg-[#FFFFFF] hover:bg-[#F8FAFC]'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`text-xs font-bold font-mono ${
                    isToday
                      ? 'w-6 h-6 rounded-full bg-[#00B259] text-white flex items-center justify-center text-[11px]'
                      : 'text-[#475569]'
                  }`}
                >
                  {cell.dayNumber}
                </span>

                {dayTickets.length > 0 && (
                  <span className="text-[10px] font-mono font-bold text-[#64748B] bg-[#F1F5F9] px-1.5 py-0.2 rounded border border-[#E2E8F0]">
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
                      className={`p-1.5 rounded text-[11px] border cursor-pointer truncate transition-all ${
                        isDone
                          ? 'bg-[#E6F7EF] border-[#B8EAD1] text-[#007860] hover:border-[#00B259]'
                          : isCrit
                          ? 'bg-[#FDE8EB] border-[#FFA39E] text-[#CF1322] font-bold hover:border-[#E51739]'
                          : 'bg-[#EBF4FD] border-[#BAE0FD] text-[#0073D3] hover:border-[#0073D3]'
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
