import { useEffect, useMemo, useRef, useState } from 'react';

type WheelTimeInputProps = {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
};

const ITEM_HEIGHT = 36;
const REPEAT_COUNT = 7;

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function parseValue(value: string) {
  if (!value) return null;
  const [hour, minute] = value.split(':').map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return { hour, minute };
}

function getCenterIndex(length: number) {
  return Math.floor(REPEAT_COUNT / 2) * length;
}

function WheelPicker({
  values,
  selected,
  onSelect,
  widthClass,
}: {
  values: number[];
  selected: number;
  onSelect: (value: number) => void;
  widthClass: string;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const isAdjustingRef = useRef(false);
  const repeatedValues = useMemo(
    () =>
      Array.from({ length: values.length * REPEAT_COUNT }, (_, index) => ({
        key: `time-wheel-${index}`,
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
            {pad(item.value)}
          </div>
        ))}
      </div>
    </div>
  );
}

type TimePart = 'hour' | 'minute';

function TimeField({
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

  if (!interactive) return <div className={className}>{value}</div>;

  return (
    <button type="button" onClick={onClick} disabled={disabled} className={className}>
      {value}
    </button>
  );
}

export function WheelTimeInput({
  value,
  onChange,
  disabled = false,
}: WheelTimeInputProps) {
  const [activePart, setActivePart] = useState<TimePart | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const parsed = parseValue(value) ?? { hour: 8, minute: 0 };

  useEffect(() => {
    if (disabled) setActivePart(null);
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

  const hours = useMemo(() => Array.from({ length: 24 }, (_, index) => index), []);
  const minutes = useMemo(() => Array.from({ length: 60 }, (_, index) => index), []);

  const update = (next: Partial<typeof parsed>) => {
    const hour = next.hour ?? parsed.hour;
    const minute = next.minute ?? parsed.minute;
    onChange(`${pad(hour)}:${pad(minute)}`);
  };

  const activeValues = activePart === 'hour' ? hours : minutes;
  const activeSelected = activePart === 'hour' ? parsed.hour : parsed.minute;
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
        {activePart === 'hour' && !disabled && (
          <WheelPicker
            values={activeValues}
            selected={activeSelected}
            onSelect={(nextValue) => update({ hour: nextValue })}
            widthClass="w-14"
          />
        )}
        <div
          className={`absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 ${
            activePart === 'hour' ? 'pointer-events-none' : ''
          }`}
        >
          <TimeField
            value={pad(parsed.hour)}
            widthClass="w-14"
            active={activePart === 'hour'}
            disabled={disabled}
            interactive={activePart !== 'hour'}
            onClick={() =>
              setActivePart((current) => (current === 'hour' ? null : 'hour'))
            }
          />
        </div>
      </div>

      <span className="text-sm font-semibold text-slate-300">:</span>

      <div
        className={`relative flex w-14 flex-shrink-0 items-center justify-center ${
          expanded ? 'h-40' : 'h-10'
        }`}
      >
        {activePart === 'minute' && !disabled && (
          <WheelPicker
            values={activeValues}
            selected={activeSelected}
            onSelect={(nextValue) => update({ minute: nextValue })}
            widthClass="w-14"
          />
        )}
        <div
          className={`absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 ${
            activePart === 'minute' ? 'pointer-events-none' : ''
          }`}
        >
          <TimeField
            value={pad(parsed.minute)}
            widthClass="w-14"
            active={activePart === 'minute'}
            disabled={disabled}
            interactive={activePart !== 'minute'}
            onClick={() =>
              setActivePart((current) =>
                current === 'minute' ? null : 'minute',
              )
            }
          />
        </div>
      </div>
    </div>
  );
}
