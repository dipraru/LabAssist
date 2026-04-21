import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { AppShell } from './AppShell';
import { getContestPhase } from './ContestCountdownBar';

function formatDuration(totalSeconds: number) {
  const positive = Math.max(0, totalSeconds);
  const hours = Math.floor(positive / 3600);
  const minutes = Math.floor((positive % 3600) / 60);
  const seconds = positive % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function ParticipantContestAccessGate({ children }: { children?: ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const { data: contest, isLoading, isError } = useQuery({
    queryKey: ['contest', id],
    queryFn: () => api.get(`/contests/${id}`).then((response) => response.data),
    enabled: !!id,
    retry: false,
  });

  const secondsToStart = useMemo(() => {
    if (!contest?.startTime) return 0;
    return Math.floor((new Date(contest.startTime).getTime() - now) / 1000);
  }, [contest?.startTime, now]);

  if (!id) {
    return <Navigate to="/contests" replace />;
  }

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex min-h-[70vh] items-center justify-center text-sm text-slate-500">Loading contest…</div>
      </AppShell>
    );
  }

  if (isError || !contest) {
    return (
      <AppShell>
        <div className="flex min-h-[70vh] items-center justify-center px-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Contest unavailable</h2>
            <p className="mt-2 text-sm text-slate-500">This contest link is no longer valid for your participant account.</p>
          </div>
        </div>
      </AppShell>
    );
  }

  const canonicalContestPathId = contest.contestNumber != null
    ? String(contest.contestNumber)
    : id;

  if (id !== canonicalContestPathId) {
    const contestPrefix = `/contests/${id}`;
    const suffix = location.pathname.startsWith(contestPrefix)
      ? location.pathname.slice(contestPrefix.length)
      : '';
    const search = location.search ?? '';
    const hash = location.hash ?? '';
    return <Navigate to={`/contests/${canonicalContestPathId}${suffix}${search}${hash}`} replace />;
  }

  const phase = contest.startTime && contest.endTime
    ? getContestPhase(contest.startTime, contest.endTime)
    : 'upcoming';

  if (phase === 'upcoming') {
    return (
      <AppShell>
        <div className="flex min-h-[70vh] items-center justify-center px-4">
          <div className="w-full max-w-xl rounded-2xl border border-blue-200 bg-white p-10 text-center shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Contest starts in</p>
            <p className="mt-4 font-mono text-5xl font-bold text-slate-900 sm:text-6xl">{formatDuration(secondsToStart)}</p>
          </div>
        </div>
      </AppShell>
    );
  }

  return children ?? <Outlet />;
}
