import React from 'react';

export const getUserInitials = (name?: string | null): string => {
  if (!name) return '--';
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || '')
    .join('')
    .toUpperCase();
  return initials || '--';
};

type UserAvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
type UserAvatarVariant = 'solid' | 'ghost';

const sizeClasses: Record<UserAvatarSize, string> = {
  xs: 'w-7 h-7 rounded-lg text-[11px]',
  sm: 'w-8.5 h-8.5 rounded-xl text-xs',
  md: 'w-11 h-11 rounded-xl text-sm',
  lg: 'w-12 h-12 rounded-xl text-base',
  xl: 'w-13 h-13 rounded-2xl text-lg',
};

interface UserAvatarProps {
  name?: string | null;
  size?: UserAvatarSize;
  variant?: UserAvatarVariant;
  showStatus?: boolean;
  className?: string;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  name,
  size = 'sm',
  variant = 'solid',
  showStatus = false,
  className = '',
}) => (
  <div className={`relative shrink-0 ${className}`}>
    <div
      className={`${sizeClasses[size]} flex items-center justify-center font-bold select-none ${
        variant === 'solid'
          ? 'bg-semantic-brand text-white'
          : 'bg-semantic-brand/10 text-semantic-brand'
      }`}
    >
      {getUserInitials(name)}
    </div>
    {showStatus && (
      <span
        className={`absolute -bottom-0.5 -right-0.5 rounded-full bg-semantic-brand border-2 border-semantic-panel ${
          size === 'xs' || size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'
        }`}
      />
    )}
  </div>
);
