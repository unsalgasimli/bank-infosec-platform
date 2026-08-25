import React from 'react';
import { TechnicalSeverity, BusinessPriority } from '../../../shared/types/ticket.js';
import { ConfidentialityTier } from '../../../shared/types/auth.js';

interface BadgeProps {
  type: 'SEVERITY' | 'PRIORITY' | 'STATUS' | 'SLA' | 'CONFIDENTIALITY' | 'DOMAIN' | 'PROJECT';
  value: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const Badge: React.FC<BadgeProps> = ({ type, value, className = '', size = 'sm' }) => {
  const sizeClasses = size === 'sm' ? 'px-2.5 py-0.5 text-xs' : size === 'md' ? 'px-3 py-1 text-xs' : 'px-3.5 py-1.5 text-sm';

  const getColorClasses = () => {
    switch (type) {
      case 'SEVERITY':
        switch (value as TechnicalSeverity) {
          case 'CRITICAL':
            return 'bg-semantic-danger-surface text-semantic-danger border-semantic-danger-border font-bold';
          case 'HIGH':
            return 'bg-semantic-warning-surface text-semantic-warning border-semantic-warning-border font-semibold';
          case 'MEDIUM':
            return 'bg-semantic-warning-legacy text-semantic-warning-legacy-text border-semantic-warning-legacy-border font-semibold';
          case 'LOW':
            return 'bg-semantic-info-surface text-semantic-info border-semantic-info-border font-semibold';
          case 'INFORMATIONAL':
          default:
            return 'bg-semantic-neutral-surface text-semantic-secondary border-semantic-border font-medium';
        }

      case 'PRIORITY':
        switch (value as BusinessPriority) {
          case 'P1_URGENT':
            return 'bg-semantic-danger-surface text-semantic-danger border-semantic-danger-border font-bold';
          case 'P2_HIGH':
            return 'bg-semantic-warning-surface text-semantic-warning border-semantic-warning-border font-semibold';
          case 'P3_MEDIUM':
            return 'bg-semantic-info-surface text-semantic-info border-semantic-info-border font-semibold';
          case 'P4_LOW':
          default:
            return 'bg-semantic-neutral-surface text-semantic-secondary border-semantic-border font-medium';
        }

      case 'SLA':
        switch (value) {
          case 'SAFE':
          case 'MET':
            return 'bg-semantic-success-surface text-semantic-success border-semantic-success-border font-bold';
          case 'AT_RISK':
            return 'bg-semantic-warning-surface text-semantic-warning border-semantic-warning-border font-bold';
          case 'BREACHED':
            return 'bg-semantic-danger-surface text-semantic-danger border-semantic-danger-border font-bold';
          case 'PAUSED':
            return 'bg-semantic-info-surface text-semantic-info border-semantic-info-border font-semibold';
          default:
            return 'bg-semantic-neutral-surface text-semantic-secondary border-semantic-border font-medium';
        }

      case 'CONFIDENTIALITY':
        switch (value as ConfidentialityTier) {
          case 'HIGHLY_RESTRICTED_HR_LEGAL':
            return 'bg-semantic-purple-soft text-semantic-purple-strong border-semantic-purple-border font-bold';
          case 'CONFIDENTIAL_SECURITY_ONLY':
            return 'bg-semantic-danger-surface text-semantic-danger border-semantic-danger-border font-bold';
          case 'RESTRICTED':
            return 'bg-semantic-warning-surface text-semantic-warning border-semantic-warning-border font-semibold';
          case 'INTERNAL':
            return 'bg-semantic-neutral-surface text-semantic-secondary border-semantic-border font-medium';
          case 'PUBLIC':
          default:
            return 'bg-semantic-neutral-surface text-semantic-secondary border-semantic-border font-medium';
        }

      case 'PROJECT':
        return 'bg-semantic-info-surface text-semantic-info border-semantic-info-border font-mono font-bold';

      default:
        return 'bg-semantic-neutral-surface text-semantic-secondary border-semantic-border font-medium';
    }
  };

  const formatLabel = () => {
    return value.replace(/_/g, ' ');
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border leading-none tracking-normal uppercase ${sizeClasses} ${getColorClasses()} ${className}`}
    >
      {type === 'SEVERITY' && (
        <span
          className={`h-2 w-2 rounded-full ${
            value === 'CRITICAL'
              ? 'bg-semantic-brand-danger'
              : value === 'HIGH'
              ? 'bg-semantic-warning-bright'
              : value === 'MEDIUM'
              ? 'bg-semantic-warning-accent'
              : 'bg-semantic-info'
          }`}
        />
      )}
      {formatLabel()}
    </span>
  );
};
