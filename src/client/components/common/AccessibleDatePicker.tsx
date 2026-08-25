import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useI18n } from '../../context/I18nContext.js';

interface AccessibleDatePickerProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  min?: string;
  max?: string;
  placeholder?: string;
  ariaLabelledBy?: string;
  locale?: string;
}

const parseIsoDate = (value: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, month, day);
  return parsed.getFullYear() === year && parsed.getMonth() === month && parsed.getDate() === day
    ? parsed
    : null;
};

const toIsoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const addDays = (date: Date, amount: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);

const addMonths = (date: Date, amount: number) =>
  new Date(date.getFullYear(), date.getMonth() + amount, 1);

const addCalendarMonths = (date: Date, amount: number) => {
  const lastDay = new Date(date.getFullYear(), date.getMonth() + amount + 1, 0).getDate();
  return new Date(
    date.getFullYear(),
    date.getMonth() + amount,
    Math.min(date.getDate(), lastDay),
  );
};

export const AccessibleDatePicker: React.FC<AccessibleDatePickerProps> = ({
  id,
  value,
  onChange,
  disabled = false,
  required = false,
  min,
  max,
  placeholder = 'YYYY-MM-DD',
  ariaLabelledBy,
  locale: customLocale,
}) => {
  const { locale: i18nLocale, t } = useI18n();
  const locale = customLocale || i18nLocale || 'az-AZ';
  const generatedId = useId().replaceAll(':', '');
  const inputId = id || `date-picker-${generatedId}`;
  const dialogId = `${inputId}-calendar`;
  const helpId = `${inputId}-help`;
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const selectedDate = parseIsoDate(value);
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date((selectedDate || new Date()).getFullYear(), (selectedDate || new Date()).getMonth(), 1),
  );
  const [activeDate, setActiveDate] = useState(selectedDate || new Date());
  const [focusCalendar, setFocusCalendar] = useState(false);

  const [placement, setPlacement] = useState<'bottom' | 'top'>('bottom');

  useEffect(() => setDraft(value || ''), [value]);

  useEffect(() => {
    if (!isOpen) return;
    const close = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const windowHeight = window.innerHeight;
    const spaceBelow = windowHeight - rect.bottom;
    const spaceAbove = rect.top;

    if (spaceBelow < 330 && spaceAbove > spaceBelow) {
      setPlacement('top');
    } else {
      setPlacement('bottom');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !focusCalendar) return;
    requestAnimationFrame(() => {
      containerRef.current
        ?.querySelector<HTMLButtonElement>(`[data-calendar-date="${toIsoDate(activeDate)}"]`)
        ?.focus();
      setFocusCalendar(false);
    });
  }, [activeDate, focusCalendar, isOpen, visibleMonth]);

  const isAllowed = (isoValue: string) => (!min || isoValue >= min) && (!max || isoValue <= max);
  const draftDate = parseIsoDate(draft);
  const invalidDraft = Boolean(draft && (!draftDate || !isAllowed(draft)));

  const calendarDays = useMemo(() => {
    const mondayOffset = (visibleMonth.getDay() + 6) % 7;
    const firstCell = addDays(visibleMonth, -mondayOffset);
    return Array.from({ length: 42 }, (_, index) => addDays(firstCell, index));
  }, [visibleMonth]);

  const weekdayLabels = useMemo(() => {
    const monday = new Date(2024, 0, 1);
    return Array.from({ length: 7 }, (_, index) =>
      new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(addDays(monday, index)),
    );
  }, [locale]);

  const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(visibleMonth);
  const fullDateFormatter = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const openCalendar = (moveFocus = false) => {
    if (disabled) return;
    const initial = selectedDate || parseIsoDate(draft) || new Date();
    setActiveDate(initial);
    setVisibleMonth(new Date(initial.getFullYear(), initial.getMonth(), 1));
    setFocusCalendar(moveFocus);
    setIsOpen(true);
  };

  const chooseDate = (date: Date) => {
    const nextValue = toIsoDate(date);
    if (!isAllowed(nextValue)) return;
    setDraft(nextValue);
    onChange(nextValue);
    setIsOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const moveActiveDate = (nextDate: Date) => {
    setActiveDate(nextDate);
    setVisibleMonth(new Date(nextDate.getFullYear(), nextDate.getMonth(), 1));
    setFocusCalendar(true);
  };

  const handleDayKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, date: Date) => {
    let nextDate: Date | null = null;
    if (event.key === 'ArrowLeft') nextDate = addDays(date, -1);
    if (event.key === 'ArrowRight') nextDate = addDays(date, 1);
    if (event.key === 'ArrowUp') nextDate = addDays(date, -7);
    if (event.key === 'ArrowDown') nextDate = addDays(date, 7);
    if (event.key === 'Home') nextDate = addDays(date, -((date.getDay() + 6) % 7));
    if (event.key === 'End') nextDate = addDays(date, 6 - ((date.getDay() + 6) % 7));
    if (event.key === 'PageUp') nextDate = addCalendarMonths(date, -1);
    if (event.key === 'PageDown') nextDate = addCalendarMonths(date, 1);
    if (event.key === 'Escape') {
      event.preventDefault();
      setIsOpen(false);
      inputRef.current?.focus();
      return;
    }
    if (nextDate) {
      event.preventDefault();
      moveActiveDate(nextDate);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div
        className={`flex min-h-10 w-full items-center rounded-lg border bg-white transition-all ${
          isOpen ? 'border-semantic-brand ring-2 ring-semantic-brand/15' : 'border-semantic-border-strong hover:border-semantic-placeholder'
        } ${disabled ? 'cursor-not-allowed bg-slate-100 opacity-60' : ''}`}
        onClick={() => openCalendar(false)}
      >
        <input
          ref={inputRef}
          id={inputId}
          value={draft}
          disabled={disabled}
          required={required}
          inputMode="numeric"
          autoComplete="off"
          placeholder={placeholder}
          aria-labelledby={ariaLabelledBy}
          aria-describedby={helpId}
          aria-invalid={invalidDraft}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          aria-controls={isOpen ? dialogId : undefined}
          onFocus={() => openCalendar(false)}
          onClick={(event) => {
            event.stopPropagation();
            openCalendar(false);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' && event.altKey) {
              event.preventDefault();
              openCalendar(true);
            } else if (event.key === 'Escape' && isOpen) {
              event.preventDefault();
              setIsOpen(false);
            }
          }}
          onChange={(event) => {
            const next = event.target.value;
            setDraft(next);
            if (!next) onChange('');
            else if (parseIsoDate(next) && isAllowed(next)) onChange(next);
          }}
          onBlur={() => {
            if (draft && invalidDraft) setDraft(value || '');
          }}
          className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm font-medium text-semantic-primary outline-none placeholder:text-slate-400"
        />
        {draft && !disabled && (
          <button
            type="button"
            aria-label={t('Clear date')}
            onClick={(event) => {
              event.stopPropagation();
              setDraft('');
              onChange('');
              inputRef.current?.focus();
            }}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          disabled={disabled}
          aria-label={t('Open calendar')}
          aria-expanded={isOpen}
          aria-controls={isOpen ? dialogId : undefined}
          onClick={(event) => {
            event.stopPropagation();
            openCalendar(true);
          }}
          className="m-1.5 rounded-lg p-1.5 text-slate-500 hover:bg-emerald-50 hover:text-semantic-success focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-semantic-brand"
        >
          <CalendarDays className="h-4 w-4" />
        </button>
      </div>
      <span id={helpId} className="sr-only">
        {t('Enter date in YYYY-MM-DD format or press Alt and down arrow to open calendar')}
      </span>

      {isOpen && (
        <div
          id={dialogId}
          role="dialog"
          aria-label={t('Choose date')}
          className={`absolute left-0 z-dsDialog w-[312px] rounded-xl border border-semantic-border-strong bg-white p-3 shadow-2xl transition-all duration-150 animate-in fade-in ring-1 ring-black/5 ${
            placement === 'top' ? 'bottom-full mb-1.5 origin-bottom' : 'top-full mt-1.5 origin-top'
          }`}
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label={t('Previous month')}
              onClick={() => {
                const previousMonth = addMonths(visibleMonth, -1);
                setVisibleMonth(previousMonth);
                setActiveDate(previousMonth);
              }}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-semantic-brand"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div aria-live="polite" className="text-sm font-bold capitalize text-slate-800">
              {monthLabel}
            </div>
            <button
              type="button"
              aria-label={t('Next month')}
              onClick={() => {
                const nextMonth = addMonths(visibleMonth, 1);
                setVisibleMonth(nextMonth);
                setActiveDate(nextMonth);
              }}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-semantic-brand"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1" aria-hidden="true">
            {weekdayLabels.map((label) => (
              <div key={label} className="py-1 text-center text-caption font-bold uppercase text-slate-400">
                {label}
              </div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1" role="grid" aria-label={monthLabel}>
            {calendarDays.map((date) => {
              const isoDate = toIsoDate(date);
              const selected = isoDate === value;
              const today = isoDate === toIsoDate(new Date());
              const outside = date.getMonth() !== visibleMonth.getMonth();
              const unavailable = !isAllowed(isoDate);
              return (
                <button
                  key={isoDate}
                  type="button"
                  role="gridcell"
                  data-calendar-date={isoDate}
                  disabled={unavailable}
                  aria-label={fullDateFormatter.format(date)}
                  aria-selected={selected}
                  aria-current={today ? 'date' : undefined}
                  tabIndex={isoDate === toIsoDate(activeDate) ? 0 : -1}
                  onFocus={() => setActiveDate(date)}
                  onKeyDown={(event) => handleDayKeyDown(event, date)}
                  onClick={() => chooseDate(date)}
                  className={`flex h-9 w-9 items-center justify-center rounded-lg text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-semantic-brand ${
                    selected
                      ? 'bg-semantic-brand text-white shadow-sm'
                      : today
                        ? 'bg-emerald-50 text-semantic-success ring-1 ring-emerald-200'
                        : outside
                          ? 'text-slate-300 hover:bg-slate-50'
                          : 'text-slate-700 hover:bg-slate-100'
                  } disabled:cursor-not-allowed disabled:opacity-25`}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2">
            <button
              type="button"
              onClick={() => chooseDate(new Date())}
              disabled={!isAllowed(toIsoDate(new Date()))}
              className="rounded-md px-2 py-1 text-xs font-bold text-semantic-success hover:bg-emerald-50 disabled:opacity-40"
            >
              {t('Today')}
            </button>
            <span className="text-caption font-medium text-slate-400">{t('Open with Alt + ↓')}</span>
          </div>
        </div>
      )}
    </div>
  );
};
