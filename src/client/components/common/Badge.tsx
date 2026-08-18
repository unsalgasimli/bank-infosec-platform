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
            return 'bg-[#FDE8EB] text-[#CF1322] border-[#FFA39E] font-bold';
          case 'HIGH':
            return 'bg-[#FFF7E6] text-[#D46B08] border-[#FFE7BA] font-semibold';
          case 'MEDIUM':
            return 'bg-[#FFFBE6] text-[#D48806] border-[#FFE58F] font-semibold';
          case 'LOW':
            return 'bg-[#EBF4FD] text-[#0073D3] border-[#BAE0FD] font-semibold';
          case 'INFORMATIONAL':
          default:
            return 'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0] font-medium';
        }

      case 'PRIORITY':
        switch (value as BusinessPriority) {
          case 'P1_URGENT':
            return 'bg-[#FDE8EB] text-[#CF1322] border-[#FFA39E] font-bold';
          case 'P2_HIGH':
            return 'bg-[#FFF7E6] text-[#D46B08] border-[#FFE7BA] font-semibold';
          case 'P3_MEDIUM':
            return 'bg-[#EBF4FD] text-[#0073D3] border-[#BAE0FD] font-semibold';
          case 'P4_LOW':
          default:
            return 'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0] font-medium';
        }

      case 'SLA':
        switch (value) {
          case 'SAFE':
          case 'MET':
            return 'bg-[#E6F7EF] text-[#007860] border-[#B8EAD1] font-bold';
          case 'AT_RISK':
            return 'bg-[#FFF7E6] text-[#D46B08] border-[#FFE7BA] font-bold';
          case 'BREACHED':
            return 'bg-[#FDE8EB] text-[#CF1322] border-[#FFA39E] font-bold';
          case 'PAUSED':
            return 'bg-[#EBF4FD] text-[#0073D3] border-[#BAE0FD] font-semibold';
          default:
            return 'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0] font-medium';
        }

      case 'CONFIDENTIALITY':
        switch (value as ConfidentialityTier) {
          case 'HIGHLY_RESTRICTED_HR_LEGAL':
            return 'bg-[#F9F0FF] text-[#531DAB] border-[#EFDBFF] font-bold';
          case 'CONFIDENTIAL_SECURITY_ONLY':
            return 'bg-[#FDE8EB] text-[#CF1322] border-[#FFA39E] font-bold';
          case 'RESTRICTED':
            return 'bg-[#FFF7E6] text-[#D46B08] border-[#FFE7BA] font-semibold';
          case 'INTERNAL':
            return 'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0] font-medium';
          case 'PUBLIC':
          default:
            return 'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0] font-medium';
        }

      case 'PROJECT':
        return 'bg-[#EBF4FD] text-[#0073D3] border-[#BAE0FD] font-mono font-bold';

      default:
        return 'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0] font-medium';
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
              ? 'bg-[#E51739]'
              : value === 'HIGH'
              ? 'bg-[#FA8C16]'
              : value === 'MEDIUM'
              ? 'bg-[#FAAD14]'
              : 'bg-[#0073D3]'
          }`}
        />
      )}
      {formatLabel()}
    </span>
  );
};
