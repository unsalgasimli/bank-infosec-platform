import React from 'react';
import { TechnicalSeverity, BusinessPriority, ConfidentialityTier } from '../../shared/types/ticket.js';

interface BadgeProps {
  type: 'SEVERITY' | 'PRIORITY' | 'STATUS' | 'SLA' | 'CONFIDENTIALITY' | 'DOMAIN' | 'PROJECT';
  value: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const Badge: React.FC<BadgeProps> = ({ type, value, className = '', size = 'sm' }) => {
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm';

  const getColorClasses = () => {
    switch (type) {
      case 'SEVERITY':
        switch (value as TechnicalSeverity) {
          case 'CRITICAL':
            return 'bg-red-950/80 text-red-400 border-red-800/60 font-semibold';
          case 'HIGH':
            return 'bg-orange-950/80 text-orange-400 border-orange-800/60 font-medium';
          case 'MEDIUM':
            return 'bg-amber-950/80 text-amber-400 border-amber-800/60 font-medium';
          case 'LOW':
            return 'bg-blue-950/80 text-blue-400 border-blue-800/60';
          case 'INFORMATIONAL':
          default:
            return 'bg-slate-800 text-slate-300 border-slate-700';
        }

      case 'PRIORITY':
        switch (value as BusinessPriority) {
          case 'P1_URGENT':
            return 'bg-crimson/20 text-red-400 border-red-500/50 font-bold';
          case 'P2_HIGH':
            return 'bg-orange-500/20 text-orange-400 border-orange-500/40 font-semibold';
          case 'P3_MEDIUM':
            return 'bg-blue-500/20 text-blue-400 border-blue-500/40';
          case 'P4_LOW':
          default:
            return 'bg-slate-800 text-slate-400 border-slate-700';
        }

      case 'SLA':
        switch (value) {
          case 'SAFE':
            return 'bg-emerald-950/80 text-emerald-400 border-emerald-800/60';
          case 'AT_RISK':
            return 'bg-amber-950/90 text-amber-300 border-amber-600 animate-pulse-subtle font-semibold';
          case 'BREACHED':
            return 'bg-red-950 text-red-400 border-red-600 font-bold animate-pulse';
          case 'PAUSED':
            return 'bg-blue-950/80 text-blue-400 border-blue-700/60';
          case 'MET':
          default:
            return 'bg-slate-800 text-slate-400 border-slate-700';
        }

      case 'CONFIDENTIALITY':
        switch (value as ConfidentialityTier) {
          case 'HIGHLY_RESTRICTED_HR_LEGAL':
            return 'bg-purple-950/80 text-purple-300 border-purple-800/60 font-bold';
          case 'CONFIDENTIAL_SECURITY_ONLY':
            return 'bg-rose-950/80 text-rose-300 border-rose-800/60 font-semibold';
          case 'RESTRICTED':
            return 'bg-amber-950/60 text-amber-300 border-amber-800/50';
          case 'INTERNAL':
            return 'bg-slate-800 text-slate-300 border-slate-700';
          case 'PUBLIC':
          default:
            return 'bg-emerald-950/50 text-emerald-300 border-emerald-800/40';
        }

      case 'PROJECT':
        return 'bg-navy-900 text-navy-300 border-navy-700 font-mono font-semibold';

      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  const formatLabel = () => {
    return value.replace(/_/g, ' ');
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border leading-none tracking-wide uppercase ${sizeClasses} ${getColorClasses()} ${className}`}
    >
      {type === 'SEVERITY' && (
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            value === 'CRITICAL'
              ? 'bg-red-500 shadow-[0_0_6px_#ef4444]'
              : value === 'HIGH'
              ? 'bg-orange-500'
              : value === 'MEDIUM'
              ? 'bg-amber-500'
              : 'bg-blue-500'
          }`}
        />
      )}
      {formatLabel()}
    </span>
  );
};
