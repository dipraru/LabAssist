import { useEffect, useMemo, useState } from 'react';

type ContestPhase = 'upcoming' | 'running' | 'old';

interface ContestCountdownBarProps {
  startTime: string;
  endTime: string;
  compact?: boolean;
}

function formatDuration(totalSeconds: number) {
  const positive = Math.max(0, totalSeconds);
  const hours = Math.floor(positive / 3600);
  const minutes = Math.floor((positive % 3600) / 60);
  const seconds = positive % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function getContestPhase(startTime: string, endTime: string): ContestPhase {
  const now = Date.now();
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();

  if (now < start) return 'upcoming';
  if (now > end) return 'old';
  return 'running';
}

export function ContestCountdownBar({ startTime, endTime, compact = false }: ContestCountdownBarProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const start = useMemo(() => new Date(startTime).getTime(), [startTime]);
  const end = useMemo(() => new Date(endTime).getTime(), [endTime]);

  const phase: ContestPhase = now < start ? 'upcoming' : now > end ? 'old' : 'running';
  const totalSeconds = Math.max(1, Math.floor((end - start) / 1000));
  const elapsedSeconds = Math.floor((now - start) / 1000);
  const remainingToStart = Math.floor((start - now) / 1000);
  const remainingToEnd = Math.floor((end - now) / 1000);

  const progressPercent = phase === 'running'
    ? Math.max(0, Math.min(100, (elapsedSeconds / totalSeconds) * 100))
    : phase === 'old'
      ? 100
      : 0;

  const label = phase === 'running'
    ? `Remaining ${formatDuration(remainingToEnd)}`
    : phase === 'upcoming'
      ? `Starts in ${formatDuration(remainingToStart)}`
      : 'Contest ended';

  const barColor = phase === 'running'
    ? 'bg-emerald-500'
    : phase === 'upcoming'
      ? 'bg-blue-500'
      : 'bg-slate-400';

  return (
    <div className={compact ? 'space-y-1' : 'space-y-2'}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-500">{new Date(startTime).toLocaleString()}</span>
        <span className={`font-semibold ${phase === 'running' ? 'text-emerald-700' : phase === 'upcoming' ? 'text-blue-700' : 'text-slate-600'}`}>
          {label}
        </span>
        <span className="text-slate-500">{new Date(endTime).toLocaleString()}</span>
      </div>
      <div className="h-3 rounded-full bg-slate-200 overflow-hidden">
        <div className={`h-full transition-all duration-1000 ${barColor}`} style={{ width: `${progressPercent}%` }} />
      </div>
    </div>
  );
}
