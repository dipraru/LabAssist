import { useEffect, useMemo, useRef, useState } from 'react';

type WheelDateInputProps = {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  minYear?: number;
  maxYear?: number;
};

const ITEM_HEIGHT = 36;
const REPEAT_COUNT = 7;

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function parseValue(value: string) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

function clampDay(year: number, month: number, day: number) {
  const daysInMonth = new Date(year, month, 0).getDate();
  return Math.min(day, daysInMonth);
}

function getCenterIndex(length: number) {
  return Math.floor(REPEAT_COUNT / 2) * length;
}

function WheelPicker({
  values,
  selected,
  onSelect,
  widthClass,
  formatter = (current: number) => String(current),
}: {
  values: number[];
  selected: number;
  onSelect: (value: number) => void;
  widthClass: string;
  formatter?: (value: number) => string;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const isAdjustingRef = useRef(false);
  const repeatedValues = useMemo(
    () =>
      Array.from({ length: values.length * REPEAT_COUNT }, (_, index) => ({
        key: `wheel-${index}`,
        value: values[index % values.length],
      })),
    [values],
  );

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || !values.length) return;

    const selectedIndex = values.indexOf(selected);
    const safeIndex = selectedIndex >= 0 ? selectedIndex : 0;
    node.scrollTop = (getCenterIndex(values.length) + safeIndex) * ITEM_HEIGHT;
  }, [selected, values]);

  const handleScroll = () => {
    const node = scrollRef.current;
    if (!node || !values.length || isAdjustingRef.current) return;

    const rawIndex = Math.round(node.scrollTop / ITEM_HEIGHT);
    const normalizedIndex =
      ((rawIndex % values.length) + values.length) % values.length;
    const nextValue = values[normalizedIndex];

    if (nextValue !== selected) {
      onSelect(nextValue);
    }

    const minIndex = values.length;
    const maxIndex = values.length * (REPEAT_COUNT - 1);
    if (rawIndex <= minIndex || rawIndex >= maxIndex) {
      isAdjustingRef.current = true;
      node.scrollTop =
        (getCenterIndex(values.length) + normalizedIndex) * ITEM_HEIGHT;
      requestAnimationFrame(() => {
        isAdjustingRef.current = false;
      });
    }
  };

  return (
    <div className={`relative h-40 overflow-hidden ${widthClass}`}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-9 bg-gradient-to-b from-white to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-9 bg-gradient-to-t from-white to-transparent" />
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto py-[52px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ scrollSnapType: 'y mandatory' }}
      >
        {repeatedValues.map((item) => (
          <div
            key={item.key}
            className={`flex items-center justify-center text-sm font-semibold transition-colors ${
              item.value === selected ? 'text-slate-900' : 'text-slate-400'
            }`}
            style={{ height: ITEM_HEIGHT, scrollSnapAlign: 'center' }}
          >
            {formatter(item.value)}
          </div>
        ))}
      </div>
    </div>
  );
}

type DatePart = 'day' | 'month' | 'year';

function DateField({
  value,
  widthClass,
  active,
  disabled,
  interactive = true,
  onClick,
}: {
  value: string;
  widthClass: string;
  active: boolean;
  disabled?: boolean;
  interactive?: boolean;
  onClick: () => void;
}) {
  const className = `${widthClass} rounded-xl border px-3 py-2 text-center text-sm font-semibold transition-all ${
    active
      ? 'border-slate-400 bg-white text-slate-900 shadow-sm shadow-slate-200/80'
      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
  } ${interactive ? 'cursor-pointer' : 'pointer-events-none'} disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400`;

  if (!interactive) {
    return <div className={className}>{value}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={className}
    >
      {value}
    </button>
  );
}

export function WheelDateInput({
  value,
  onChange,
  disabled = false,
  minYear,
  maxYear,
}: WheelDateInputProps) {
  const [activePart, setActivePart] = useState<DatePart | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const today = new Date();
  const parsed = parseValue(value) ?? {
    day: today.getDate(),
    month: today.getMonth() + 1,
    year: today.getFullYear(),
  };

  useEffect(() => {
    if (disabled) {
      setActivePart(null);
    }
  }, [disabled]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setActivePart(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const minAllowedYear = minYear ?? today.getFullYear() - 100;
  const maxAllowedYear = maxYear ?? today.getFullYear() + 100;
  const years = useMemo(
    () =>
      Array.from(
        { length: maxAllowedYear - minAllowedYear + 1 },
        (_, index) => minAllowedYear + index,
      ),
    [maxAllowedYear, minAllowedYear],
  );
  const months = useMemo(
    () => Array.from({ length: 12 }, (_, index) => index + 1),
    [],
  );
  const days = useMemo(
    () =>
      Array.from(
        { length: new Date(parsed.year, parsed.month, 0).getDate() },
        (_, index) => index + 1,
      ),
    [parsed.month, parsed.year],
  );

  const update = (next: Partial<typeof parsed>) => {
    const year = next.year ?? parsed.year;
    const month = next.month ?? parsed.month;
    const day = clampDay(year, month, next.day ?? parsed.day);
    onChange(`${year}-${pad(month)}-${pad(day)}`);
  };

  const activeValues =
    activePart === 'day' ? days : activePart === 'month' ? months : years;
  const activeSelected =
    activePart === 'day'
      ? clampDay(parsed.year, parsed.month, parsed.day)
      : activePart === 'month'
        ? parsed.month
        : parsed.year;

  const expanded = Boolean(activePart);

  return (
    <div
      ref={containerRef}
      className={`inline-flex items-center gap-2 transition-all ${
        expanded ? 'min-h-40' : 'min-h-10'
      }`}
    >
      <div
        className={`relative flex w-14 flex-shrink-0 items-center justify-center ${
          expanded ? 'h-40' : 'h-10'
        }`}
      >
        {activePart === 'day' && !disabled && (
          <WheelPicker
            values={activeValues}
            selected={activeSelected}
            onSelect={(nextValue) => update({ day: nextValue })}
            widthClass="w-14"
            formatter={pad}
          />
        )}
        <div
          className={`absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 ${
            activePart === 'day' ? 'pointer-events-none' : ''
          }`}
        >
          <DateField
            value={pad(parsed.day)}
            widthClass="w-14"
            active={activePart === 'day'}
            disabled={disabled}
            interactive={activePart !== 'day'}
            onClick={() =>
              setActivePart((current) => (current === 'day' ? null : 'day'))
            }
          />
        </div>
      </div>

      <span className="text-sm font-semibold text-slate-300">/</span>

      <div
        className={`relative flex w-14 flex-shrink-0 items-center justify-center ${
          expanded ? 'h-40' : 'h-10'
        }`}
      >
        {activePart === 'month' && !disabled && (
          <WheelPicker
            values={activeValues}
            selected={activeSelected}
            onSelect={(nextValue) => update({ month: nextValue })}
            widthClass="w-14"
            formatter={pad}
          />
        )}
        <div
          className={`absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 ${
            activePart === 'month' ? 'pointer-events-none' : ''
          }`}
        >
          <DateField
            value={pad(parsed.month)}
            widthClass="w-14"
            active={activePart === 'month'}
            disabled={disabled}
            interactive={activePart !== 'month'}
            onClick={() =>
              setActivePart((current) => (current === 'month' ? null : 'month'))
            }
          />
        </div>
      </div>

      <span className="text-sm font-semibold text-slate-300">/</span>

      <div
        className={`relative flex w-20 flex-shrink-0 items-center justify-center ${
          expanded ? 'h-40' : 'h-10'
        }`}
      >
        {activePart === 'year' && !disabled && (
          <WheelPicker
            values={activeValues}
            selected={activeSelected}
            onSelect={(nextValue) => update({ year: nextValue })}
            widthClass="w-20"
            formatter={String}
          />
        )}
        <div
          className={`absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 ${
            activePart === 'year' ? 'pointer-events-none' : ''
          }`}
        >
          <DateField
            value={String(parsed.year)}
            widthClass="w-20"
            active={activePart === 'year'}
            disabled={disabled}
            interactive={activePart !== 'year'}
            onClick={() =>
              setActivePart((current) => (current === 'year' ? null : 'year'))
            }
          />
        </div>
      </div>
    </div>
  );
}
