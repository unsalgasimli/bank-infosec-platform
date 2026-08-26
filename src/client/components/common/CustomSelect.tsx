import React, { useState, useRef, useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
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
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: (SelectOption | string)[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  searchable?: boolean;
  searchPlaceholder?: string;
  ariaLabelledBy?: string;
  required?: boolean;
  placement?: 'bottom' | 'top' | 'auto';
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  onOpenChange?: (isOpen: boolean) => void;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  id,
  value,
  onChange,
  options,
  placeholder = 'Select option...',
  disabled = false,
  className = '',
  size = 'md',
  searchable = true,
  searchPlaceholder = 'Search options...',
  ariaLabelledBy,
  required = false,
  placement: placementProp = 'auto',
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  onOpenChange,
}) => {
  const generatedId = useId().replaceAll(':', '');
  const triggerId = id || `custom-select-${generatedId}`;
  const listboxId = `${triggerId}-listbox`;
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [placement, setPlacement] = useState<'bottom' | 'top'>(
    placementProp === 'top' ? 'top' : 'bottom'
  );
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, width: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // A body portal is hidden behind the browser's fullscreen top layer. The
  // workflow builder uses fullscreen focus mode, so move the menu into the
  // active fullscreen element while it is open there.
  useEffect(() => {
    const updatePortalTarget = () => {
      setPortalTarget((document.fullscreenElement as HTMLElement | null) || document.body);
    };
    updatePortalTarget();
    document.addEventListener('fullscreenchange', updatePortalTarget);
    return () => document.removeEventListener('fullscreenchange', updatePortalTarget);
  }, []);

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

  const isSearchable = searchable !== undefined ? searchable : normalizedOptions.length > 5;

  const closeMenu = (restoreFocus = false) => {
    setIsOpen(false);
    onOpenChange?.(false);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const selectValue = (optionValue: string) => {
    closeMenu(true);
    onChange(optionValue);
  };

  // Commit pointer selections before the portal/focus teardown can dispatch a
  // click outside the menu. This keeps controlled selects in sync when the
  // dropdown is rendered in a portal or inside fullscreen mode.
  const handleOptionPointerDown = (optionValue: string, event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    selectValue(optionValue);
  };

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      return;
    }
    const selectedIndex = filteredOptions.findIndex((option) => option.value === value);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    if (isSearchable) requestAnimationFrame(() => searchInputRef.current?.focus());
  }, [isOpen, isSearchable, value]);

  useEffect(() => {
    setActiveIndex((current) =>
      filteredOptions.length === 0 ? 0 : Math.min(current, filteredOptions.length - 1),
    );
  }, [searchQuery, filteredOptions.length]);

  useEffect(() => {
    if (!isOpen) return;
    menuRef.current
      ?.querySelector<HTMLElement>(`[data-option-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, isOpen]);

  // The menu is portalled to document.body so it is never clipped by a modal
  // panel or a scroll container. Keep its fixed position in sync with its trigger.
  useEffect(() => {
    if (!isOpen || !triggerRef.current) return;

    const updateMenuPosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewportMargin = 12;
      const estimatedMenuHeight = isSearchable ? 320 : 270;
      const spaceBelow = window.innerHeight - rect.bottom - viewportMargin;
      const spaceAbove = rect.top - viewportMargin;
      const nextPlacement = placementProp === 'auto'
        ? spaceBelow < Math.min(estimatedMenuHeight, 280) && spaceAbove > spaceBelow
          ? 'top'
          : 'bottom'
        : placementProp;
      const menuWidth = Math.min(Math.max(rect.width, 240), window.innerWidth - viewportMargin * 2);
      const left = Math.max(viewportMargin, Math.min(rect.left, window.innerWidth - menuWidth - viewportMargin));

      setPlacement(nextPlacement);
      setMenuPosition({
        top: nextPlacement === 'top' ? Math.max(viewportMargin, rect.top - 6) : rect.bottom + 6,
        left,
        width: menuWidth,
      });
    };

    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [isOpen, placementProp]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        closeMenu();
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
    sm: 'py-1.5 px-3 text-xs min-h-[34px]',
    md: 'py-2 px-3.5 text-sm min-h-[42px]',
    lg: 'py-2.5 px-4 text-sm font-semibold min-h-[46px]',
  };

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setIsOpen(true);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex(Math.max(0, filteredOptions.length - 1));
    } else if (event.key === 'Escape') {
      closeMenu(true);
    }
  };

  const handleListNavigation = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (filteredOptions.length > 0) {
        setActiveIndex((current) => Math.min(current + 1, filteredOptions.length - 1));
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(Math.max(0, filteredOptions.length - 1));
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setIsOpen(false);
      requestAnimationFrame(() => triggerRef.current?.focus());
    } else if (event.key === 'Enter' && filteredOptions[activeIndex]) {
      event.preventDefault();
      selectValue(filteredOptions[activeIndex].value);
    }
  };

  const selectedTooltip = selectedOption
    ? `${selectedOption.label}${selectedOption.sublabel ? ` — ${selectedOption.sublabel}` : ''}`
    : undefined;

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* Trigger Button */}
      <button
        id={triggerId}
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          const nextOpen = !isOpen;
          setIsOpen(nextOpen);
          onOpenChange?.(nextOpen);
        }}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-labelledby={
          ariaLabelledBy ? `${ariaLabelledBy} ${triggerId}-value` : undefined
        }
        aria-required={required}
        title={selectedTooltip}
        className={`w-full flex items-center justify-between gap-2 bg-semantic-panel border rounded-lg font-medium text-semantic-primary transition-all text-left shadow-xs ${
          isOpen
            ? 'border-semantic-brand ring-2 ring-semantic-brand/15'
            : 'border-semantic-border-strong hover:border-semantic-placeholder hover:bg-semantic-subtle'
        } ${disabled ? 'opacity-50 cursor-not-allowed bg-semantic-neutral-surface' : 'cursor-pointer'} ${
          sizeClasses[size]
        }`}
      >
        <div className="flex items-center gap-2 truncate min-w-0 flex-1">
          {selectedOption?.icon && <span className="shrink-0">{selectedOption.icon}</span>}
          <span id={`${triggerId}-value`} className="truncate font-semibold text-semantic-primary">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          {selectedOption?.badge && (
            <span
              className={`px-1.5 py-0.5 rounded text-caption font-bold tracking-wider shrink-0 ml-auto mr-0.5 ${
                selectedOption.badgeColor || 'bg-semantic-neutral-surface text-semantic-secondary'
              }`}
            >
              {selectedOption.badge}
            </span>
          )}
        </div>

        <ChevronDown
          className={`w-4 h-4 text-semantic-muted shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-semantic-brand' : ''
          }`}
        />
      </button>

      {/* Floating Dropdown Menu */}
      {isOpen && portalTarget && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            zIndex: 2147483000,
            left: menuPosition.left,
            width: menuPosition.width,
            ...(placement === 'top' ? { bottom: window.innerHeight - menuPosition.top } : { top: menuPosition.top }),
          }}
          className={`max-h-80 overflow-hidden bg-semantic-panel border border-semantic-border-strong rounded-xl shadow-2xl p-1.5 text-sm transition-all duration-150 ease-out animate-in fade-in ring-1 ring-black/10 ${
            placement === 'top'
              ? 'origin-bottom'
              : 'origin-top'
          }`}
        >
          {isSearchable && (
            <div className="sticky top-0 z-dsContent bg-white p-1 pb-2 border-b border-semantic-border mb-1.5">
              <div className="flex items-center gap-2 px-2.5 h-9 rounded-lg border border-semantic-border-strong bg-semantic-subtle focus-within:border-semantic-brand focus-within:ring-2 focus-within:ring-semantic-brand/10">
                <Search className="w-3.5 h-3.5 text-semantic-muted shrink-0" />
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={handleListNavigation}
                  placeholder={searchPlaceholder}
                  className="w-full min-w-0 bg-transparent outline-none text-sm text-semantic-primary placeholder:text-semantic-placeholder"
                  aria-label={searchPlaceholder}
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={isOpen}
                  aria-controls={listboxId}
                  aria-activedescendant={
                    filteredOptions[activeIndex]
                      ? `${listboxId}-option-${activeIndex}`
                      : undefined
                  }
                  autoComplete="off"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="p-0.5 rounded text-semantic-muted hover:text-semantic-primary hover:bg-semantic-border"
                    aria-label="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          <div id={listboxId} className="max-h-60 overflow-y-auto space-y-1 custom-scrollbar p-0.5" role="listbox" aria-labelledby={ariaLabelledBy || triggerId}>
          {filteredOptions.map((opt, optionIndex) => {
            const isSelected = opt.value === value;
            const isActive = optionIndex === activeIndex;
            const itemTooltip = `${opt.label}${opt.sublabel ? ` — ${opt.sublabel}` : ''}`;
            return (
              <button
                id={`${listboxId}-option-${optionIndex}`}
                type="button"
                key={opt.value}
                data-option-index={optionIndex}
                onPointerDown={(event) => handleOptionPointerDown(opt.value, event)}
                onMouseEnter={() => setActiveIndex(optionIndex)}
                role="option"
                aria-selected={isSelected}
                title={itemTooltip}
                className={`w-full text-left flex items-start justify-between gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-semantic-success-surface text-semantic-success'
                    : isActive
                      ? 'bg-semantic-neutral-surface text-semantic-primary'
                      : 'text-semantic-primary hover:bg-semantic-subtle'
                }`}
              >
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  {opt.icon ? (
                    <span className="shrink-0 mt-0.5">{opt.icon}</span>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-sm leading-snug break-words ${isSelected ? 'font-bold text-semantic-success' : 'font-semibold text-semantic-primary'}`}>
                        {opt.label}
                      </span>
                      {opt.badge && (
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-caption font-bold tracking-wider shrink-0 ${
                            opt.badgeColor || 'bg-semantic-neutral-surface text-semantic-secondary'
                          }`}
                        >
                          {opt.badge}
                        </span>
                      )}
                    </div>
                    {opt.sublabel && (
                      <div className="text-xs text-semantic-muted font-normal leading-relaxed mt-0.5 break-words">
                        {opt.sublabel}
                      </div>
                    )}
                  </div>
                </div>

                {isSelected && (
                  <div className="flex items-center shrink-0 self-center pl-1">
                    <Check className="w-4 h-4 text-semantic-brand shrink-0" />
                  </div>
                )}
              </button>
            );
          })}
          {filteredOptions.length === 0 && (
            <div className="px-3 py-6 text-center text-xs font-medium text-semantic-muted">
              No matching options
            </div>
          )}
          {hasMore && !normalizedQuery && (
            <button
              type="button"
              onClick={onLoadMore}
              disabled={isLoadingMore || !onLoadMore}
              className="w-full rounded-lg px-3 py-2 text-xs font-bold text-semantic-success hover:bg-semantic-success-surface disabled:cursor-wait disabled:opacity-60"
            >
              {isLoadingMore ? 'Loading more…' : 'Load more users'}
            </button>
          )}
          </div>
        </div>
      , portalTarget)}
    </div>
  );
};
