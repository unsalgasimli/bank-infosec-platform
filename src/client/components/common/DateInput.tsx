import React, { useRef } from 'react';
import { Calendar } from 'lucide-react';

export interface DateInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
  showIcon?: boolean;
}

export const DateInput: React.FC<DateInputProps> = ({
  value = '',
  onChange,
  className = '',
  showIcon = true,
  disabled = false,
  ...props
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleOpenPicker = () => {
    if (disabled) return;
    try {
      inputRef.current?.showPicker();
    } catch {
      inputRef.current?.focus();
    }
  };

  return (
    <div
      onClick={handleOpenPicker}
      className={`relative w-full flex items-center ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
    >
      <input
        ref={inputRef}
        type="date"
        value={value}
        onChange={onChange}
        onClick={(e) => {
          if (disabled) return;
          try {
            e.currentTarget.showPicker();
          } catch {}
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            try {
              inputRef.current?.showPicker();
            } catch {}
          }
        }}
        disabled={disabled}
        className={`wrike-input w-full cursor-pointer text-sm ${showIcon ? 'pl-9 pr-3' : 'px-3'} ${className}`}
        {...props}
      />
      {showIcon && (
        <Calendar className="w-4 h-4 text-semantic-jira-icon absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      )}
    </div>
  );
};
