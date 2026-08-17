import React from 'react';
import { TechnicalSeverity, BusinessPriority } from '../../../shared/types/ticket.js';
import { ConfidentialityTier } from '../../../shared/types/auth.js';
import { Shield, AlertTriangle, AlertCircle, Info, Lock, Clock, CheckCircle2 } from 'lucide-react';

interface BadgeProps {
  type: 'SEVERITY' | 'PRIORITY' | 'STATUS' | 'SLA' | 'CONFIDENTIALITY' | 'DOMAIN' | 'PROJECT';
  value: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const Badge: React.FC<BadgeProps> = ({ type, value, className = '', size = 'sm' }) => {
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-xs';

  const getColorClasses = () => {
    switch (type) {
      case 'SEVERITY':
        switch (value as TechnicalSeverity) {
          case 'CRITICAL':
            return 'bg-red-950/70 text-red-300 border-red-800 font-semibold';
          case 'HIGH':
            return 'bg-orange-950/70 text-orange-300 border-orange-800 font-medium';
          case 'MEDIUM':
            return 'bg-amber-950/70 text-amber-300 border-amber-800 font-medium';
          case 'LOW':
            return 'bg-blue-950/70 text-blue-300 border-blue-800';
          case 'INFORMATIONAL':
          default:
            return 'bg-slate-800/80 text-slate-300 border-slate-700';
        }

      case 'PRIORITY':
        switch (value as BusinessPriority) {
          case 'P1_URGENT':
            return 'bg-red-950/70 text-red-300 border-red-800 font-semibold';
          case 'P2_HIGH':
            return 'bg-orange-950/70 text-orange-300 border-orange-800 font-medium';
          case 'P3_MEDIUM':
            return 'bg-blue-950/70 text-blue-300 border-blue-800';
          case 'P4_LOW':
          default:
            return 'bg-slate-800/80 text-slate-400 border-slate-700';
        }

      case 'SLA':
        switch (value) {
          case 'SAFE':
            return 'bg-emerald-950/60 text-emerald-300 border-emerald-800';
          case 'AT_RISK':
            return 'bg-amber-950/70 text-amber-300 border-amber-700 font-semibold';
          case 'BREACHED':
            return 'bg-red-950/80 text-red-300 border-red-700 font-semibold';
          case 'PAUSED':
            return 'bg-blue-950/60 text-blue-300 border-blue-800';
          case 'MET':
          default:
            return 'bg-slate-800/80 text-slate-400 border-slate-700';
        }

      case 'CONFIDENTIALITY':
        switch (value as ConfidentialityTier) {
          case 'HIGHLY_RESTRICTED_HR_LEGAL':
            return 'bg-purple-950/70 text-purple-300 border-purple-800 font-semibold';
          case 'CONFIDENTIAL_SECURITY_ONLY':
            return 'bg-rose-950/70 text-rose-300 border-rose-800 font-medium';
          case 'RESTRICTED':
            return 'bg-amber-950/60 text-amber-300 border-amber-800/80';
          case 'INTERNAL':
            return 'bg-slate-800/80 text-slate-300 border-slate-700';
          case 'PUBLIC':
          default:
            return 'bg-slate-800 text-slate-300 border-slate-700';
        }

      case 'PROJECT':
        return 'bg-slate-800/90 text-blue-300 border-slate-700 font-mono font-medium';

      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  const formatLabel = () => {
    return value.replace(/_/g, ' ');
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border leading-none tracking-normal uppercase ${sizeClasses} ${getColorClasses()} ${className}`}
    >
      {type === 'SEVERITY' && (
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            value === 'CRITICAL'
              ? 'bg-red-400'
              : value === 'HIGH'
              ? 'bg-orange-400'
              : value === 'MEDIUM'
              ? 'bg-amber-400'
              : 'bg-blue-400'
          }`}
        />
      )}
      {formatLabel()}
    </span>
  );
};

