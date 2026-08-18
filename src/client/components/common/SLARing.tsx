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
          color: 'text-[#DE350B]',
          bg: 'bg-[#FFEBE6] border-[#FFBDAD]',
          icon: AlertOctagon,
          label: 'SLA BREACHED',
        };
      case 'AT_RISK':
        return {
          color: 'text-[#FF8B00]',
          bg: 'bg-[#FFFAE6] border-[#FFE380]',
          icon: AlertTriangle,
          label: 'SLA AT RISK',
        };
      case 'PAUSED':
        return {
          color: 'text-[#0052CC]',
          bg: 'bg-[#DEEBFF] border-[#B3D4FF]',
          icon: Pause,
          label: 'SLA PAUSED',
        };
      case 'MET':
        return {
          color: 'text-[#5E6C84]',
          bg: 'bg-[#FFFFFF] border-[#DFE1E6]',
          icon: CheckCircle,
          label: 'COMPLETED',
        };
      case 'SAFE':
      default:
        return {
          color: 'text-[#006644]',
          bg: 'bg-[#E3FCEF] border-[#ABF5D1]',
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
    <div className={`p-3.5 rounded-md border flex items-center justify-between shadow-sm ${theme.bg}`}>
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded bg-[#FFFFFF] border border-[#DFE1E6] ${theme.color}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className={`text-[11px] font-bold tracking-wider ${theme.color}`}>
              {theme.label}
            </span>
            {pausedReason && (
              <span className="text-[10px] text-[#0052CC] bg-[#DEEBFF] px-1.5 py-0.5 rounded border border-[#B3D4FF]">
                {pausedReason}
              </span>
            )}
          </div>
          <div className="text-base font-mono font-bold text-[#172B4D] mt-0.5">
            {formatTime(remainingMinutes)}
          </div>
        </div>
      </div>
      {deadline && (
        <div className="text-right text-xs text-[#5E6C84]">
          <div className="text-[11px]">Deadline</div>
          <div className="font-mono text-[#172B4D] text-xs font-semibold">{new Date(deadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}</div>
        </div>
      )}
    </div>
  );
};

