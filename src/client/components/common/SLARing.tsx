import React from 'react';
import { Clock, Pause, AlertTriangle, CheckCircle, AlertOctagon } from 'lucide-react';

interface SLARingProps {
  remainingMinutes?: number;
  state: 'SAFE' | 'AT_RISK' | 'BREACHED' | 'PAUSED' | 'MET';
  deadline?: string;
  pausedReason?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const SLARing: React.FC<SLARingProps> = ({
  remainingMinutes = 0,
  state,
  deadline,
  pausedReason,
  size = 'md',
}) => {
  const formatTime = (minutes: number) => {
    if (minutes <= 0 && state === 'BREACHED') return 'Breached';
    if (state === 'MET') return 'SLA Met';
    if (state === 'PAUSED') return 'Paused';

    const d = Math.floor(minutes / 1440);
    const h = Math.floor((minutes % 1440) / 60);
    const m = minutes % 60;

    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const getTheme = () => {
    switch (state) {
      case 'BREACHED':
        return {
          color: 'text-red-300',
          bg: 'bg-red-950/60 border-red-800',
          icon: AlertOctagon,
          label: 'SLA BREACHED',
        };
      case 'AT_RISK':
        return {
          color: 'text-amber-300',
          bg: 'bg-amber-950/60 border-amber-700',
          icon: AlertTriangle,
          label: 'SLA AT RISK',
        };
      case 'PAUSED':
        return {
          color: 'text-blue-300',
          bg: 'bg-blue-950/60 border-blue-800',
          icon: Pause,
          label: 'SLA PAUSED',
        };
      case 'MET':
        return {
          color: 'text-slate-400',
          bg: 'bg-slate-800/80 border-slate-700',
          icon: CheckCircle,
          label: 'COMPLETED',
        };
      case 'SAFE':
      default:
        return {
          color: 'text-emerald-300',
          bg: 'bg-emerald-950/50 border-emerald-800',
          icon: Clock,
          label: 'SLA SAFE',
        };
    }
  };

  const theme = getTheme();
  const Icon = theme.icon;

  if (size === 'sm') {
    return (
      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] border ${theme.bg} ${theme.color} font-mono font-medium`}>
        <Icon className="w-3 h-3" />
        {formatTime(remainingMinutes)}
      </span>
    );
  }

  return (
    <div className={`p-3.5 rounded-lg border flex items-center justify-between ${theme.bg}`}>
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-md bg-bank-950 border border-slate-700/80 ${theme.color}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className={`text-[11px] font-bold tracking-wider ${theme.color}`}>
              {theme.label}
            </span>
            {pausedReason && (
              <span className="text-[10px] text-blue-300 bg-blue-950 px-1.5 py-0.5 rounded border border-blue-800">
                {pausedReason}
              </span>
            )}
          </div>
          <div className="text-base font-mono font-bold text-white mt-0.5">
            {formatTime(remainingMinutes)}
          </div>
        </div>
      </div>
      {deadline && (
        <div className="text-right text-xs text-slate-400">
          <div className="text-[11px]">Deadline</div>
          <div className="font-mono text-slate-200 text-xs font-semibold">{new Date(deadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}</div>
        </div>
      )}
    </div>
  );
};

