import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Search, X } from 'lucide-react';

const normalizeSearchText = (value: string) =>
  value
    .toLocaleLowerCase('az')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[əә]/g, 'e')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u');

export interface SelectOption {
  value: string;
  label: string;
  sublabel?: string;
  icon?: React.ReactNode;
  badge?: string;
  badgeColor?: string;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: (SelectOption | string)[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  searchable?: boolean;
  searchPlaceholder?: string;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  value,
  onChange,
  options,
  placeholder = 'Select option...',
  disabled = false,
  className = '',
  size = 'md',
  searchable = true,
  searchPlaceholder = 'Search options...',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [placement, setPlacement] = useState<'bottom' | 'top'>('bottom');
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Normalize options to SelectOption format
  const normalizedOptions: SelectOption[] = options.map((opt) => {
    if (typeof opt === 'string') {
      return { value: opt, label: opt };
    }
    return opt;
  });

  const selectedOption = normalizedOptions.find((opt) => opt.value === value);
  const normalizedQuery = normalizeSearchText(searchQuery.trim());
  const filteredOptions = normalizedQuery
    ? normalizedOptions.filter((opt) =>
        [opt.label, opt.sublabel, opt.badge, opt.value]
          .filter(Boolean)
          .some((candidate) => normalizeSearchText(candidate!).includes(normalizedQuery))
      )
    : normalizedOptions;

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      return;
    }
    if (searchable) requestAnimationFrame(() => searchInputRef.current?.focus());
  }, [isOpen, searchable]);

  // Dynamic placement & smooth auto-view adjustment
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const windowHeight = window.innerHeight;
    const spaceBelow = windowHeight - rect.bottom;
    const spaceAbove = rect.top;

    // If less than 240px below and more room above, flip upwards
    if (spaceBelow < 240 && spaceAbove > spaceBelow) {
      setPlacement('top');
    } else {
      setPlacement('bottom');
      // If opening downwards near boundary, gently ensure visibility without jarring jumps
      const timer = setTimeout(() => {
        if (containerRef.current) {
          const updatedRect = containerRef.current.getBoundingClientRect();
          if (windowHeight - updatedRect.bottom < 200) {
            containerRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const sizeClasses = {
    sm: 'py-1.5 px-3 text-xs',
    md: 'py-2 px-3.5 text-sm',
    lg: 'py-2.5 px-4 text-sm font-semibold',
  };

  const handleSelect = (optValue: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(false);
    onChange(optValue);
  };

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setIsOpen(true);
    }
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`w-full flex items-center justify-between gap-2 bg-[#FFFFFF] border rounded-lg font-medium text-[#162136] transition-all text-left shadow-xs ${
          isOpen
            ? 'border-[#00B259] ring-2 ring-[#00B259]/15'
            : 'border-[#CBD5E1] hover:border-[#94A3B8] hover:bg-[#F8FAFC]'
        } ${disabled ? 'opacity-50 cursor-not-allowed bg-[#F1F5F9]' : 'cursor-pointer'} ${
          sizeClasses[size]
        }`}
      >
        <div className="flex items-center gap-2 truncate">
          {selectedOption?.icon && <span className="shrink-0">{selectedOption.icon}</span>}
          <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
        </div>

        <ChevronDown
          className={`w-4 h-4 text-[#64748B] shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-[#00B259]' : ''
          }`}
        />
      </button>

      {/* Floating Dropdown Menu */}
      {isOpen && (
        <div
          ref={menuRef}
          className={`absolute z-[70] left-0 right-0 max-h-72 overflow-hidden bg-[#FFFFFF] border border-[#CBD5E1] rounded-xl shadow-2xl p-1.5 text-sm min-w-[220px] transition-all duration-150 ease-out animate-in fade-in ${
            placement === 'top'
              ? 'bottom-full mb-1.5 origin-bottom'
              : 'top-full mt-1.5 origin-top'
          }`}
        >
          {searchable && (
            <div className="sticky top-0 z-10 bg-white p-1 pb-2 border-b border-[#E2E8F0] mb-1.5">
              <div className="flex items-center gap-2 px-2.5 h-9 rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] focus-within:border-[#00B259] focus-within:ring-2 focus-within:ring-[#00B259]/10">
                <Search className="w-3.5 h-3.5 text-[#64748B] shrink-0" />
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      setIsOpen(false);
                    } else if (event.key === 'Enter' && filteredOptions.length === 1) {
                      event.preventDefault();
                      setIsOpen(false);
                      onChange(filteredOptions[0].value);
                    }
                  }}
                  placeholder={searchPlaceholder}
                  className="w-full min-w-0 bg-transparent outline-none text-sm text-[#162136] placeholder:text-[#94A3B8]"
                  aria-label={searchPlaceholder}
                  autoComplete="off"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="p-0.5 rounded text-[#64748B] hover:text-[#162136] hover:bg-[#E2E8F0]"
                    aria-label="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="max-h-56 overflow-y-auto space-y-0.5 custom-scrollbar" role="listbox">
          {filteredOptions.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                type="button"
                key={opt.value}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => handleSelect(opt.value, e)}
                role="option"
                aria-selected={isSelected}
                className={`w-full text-left flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-[#E6F7EF] text-[#007860] font-bold'
                    : 'text-[#162136] hover:bg-[#F8FAFC] hover:text-[#00B259]'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  {opt.icon && <span className="shrink-0">{opt.icon}</span>}
                  <div className="truncate">
                    <div className="font-semibold text-sm leading-tight">{opt.label}</div>
                    {opt.sublabel && (
                      <div className="text-xs text-[#64748B] font-medium leading-tight mt-0.5">{opt.sublabel}</div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 ml-2">
                  {opt.badge && (
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${
                        opt.badgeColor || 'bg-[#F1F5F9] text-[#475569]'
                      }`}
                    >
                      {opt.badge}
                    </span>
                  )}
                  {isSelected && <Check className="w-4 h-4 text-[#00B259]" />}
                </div>
              </button>
            );
          })}
          {filteredOptions.length === 0 && (
            <div className="px-3 py-6 text-center text-xs font-medium text-[#64748B]">
              No matching options
            </div>
          )}
          </div>
        </div>
      )}
    </div>
  );
};
