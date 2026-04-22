import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock3, LockKeyhole, RefreshCw, Snowflake, Star, Trophy } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuthStore } from '../../store/auth.store';
import { ContestManage } from './ContestManage';

type PublicStandingsResponse = {
  contest?: {
    id: string;
    contestNumber?: number | null;
    title: string;
    type: string;
    startTime: string;
    endTime: string;
  };
  type?: string;
  isFrozen?: boolean;
  problems?: Array<{ label: string; solvedCount?: number; attemptsCount?: number }>;
  rows?: any[];
};

function formatHms(totalSeconds: number) {
  const clamped = Math.max(0, totalSeconds);
  const hrs = Math.floor(clamped / 3600).toString().padStart(2, '0');
  const mins = Math.floor((clamped % 3600) / 60).toString().padStart(2, '0');
  const secs = Math.floor(clamped % 60).toString().padStart(2, '0');
  return `${hrs}:${mins}:${secs}`;
}

function PublicStandingsState({ icon, title, tone = 'slate' }: { icon: ReactNode; title: string; tone?: 'slate' | 'red' }) {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="oj-page flex min-h-[70vh] items-center justify-center">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-xl ${tone === 'red' ? 'bg-rose-50 text-rose-700' : 'bg-teal-50 text-teal-700'}`}>
            {icon}
          </div>
          <p className={`mt-4 text-sm font-extrabold ${tone === 'red' ? 'text-rose-700' : 'text-slate-700'}`}>{title}</p>
        </div>
      </div>
    </div>
  );
}

export function JudgeStandingsEntry() {
  const { token, user } = useAuthStore();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isJudge = Boolean(token && user?.role === 'temp_judge');

  const publicCheck = useQuery({
    queryKey: ['public-standings-check', id],
    queryFn: () => api.get(`/contests/public/${id}/standings`).then((response) => response.data),
    enabled: Boolean(id) && !isJudge,
    retry: false,
  });

  useEffect(() => {
    if (!isJudge && publicCheck.isSuccess) {
      navigate(`/contests/${id}/standings/public`, { replace: true });
    }
  }, [id, isJudge, navigate, publicCheck.isSuccess]);

  if (isJudge) {
    return <ContestManage />;
  }

  if (publicCheck.isLoading) {
    return (
      <PublicStandingsState icon={<Clock3 size={22} className="animate-spin" />} title="Checking standings visibility..." />
    );
  }

  return (
    <PublicStandingsState icon={<LockKeyhole size={22} />} title="Unauthorized" tone="red" />
  );
}

export function PublicContestStandings() {
  const { id } = useParams<{ id: string }>();
  const [nowMs, setNowMs] = useState<number>(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const { data, isLoading, isError, refetch, isFetching } = useQuery<PublicStandingsResponse>({
    queryKey: ['public-standings', id],
    queryFn: () => api.get(`/contests/public/${id}/standings`).then((response) => response.data),
    enabled: Boolean(id),
    retry: false,
    refetchInterval: 30000,
  });

  const remainingLabel = useMemo(() => {
    if (!data?.contest?.startTime || !data?.contest?.endTime) return 'Ended';
    const start = new Date(data.contest.startTime).getTime();
    const end = new Date(data.contest.endTime).getTime();
    if (nowMs < start) return `Starts In: ${formatHms(Math.floor((start - nowMs) / 1000))}`;
    if (nowMs > end) return 'Ended';
    return `Remaining: ${formatHms(Math.floor((end - nowMs) / 1000))}`;
  }, [data?.contest?.startTime, data?.contest?.endTime, nowMs]);

  if (isLoading) {
    return (
      <PublicStandingsState icon={<Clock3 size={22} className="animate-spin" />} title="Loading public standings..." />
    );
  }

  if (isError || !data?.contest) {
    return (
      <PublicStandingsState icon={<LockKeyhole size={22} />} title="Unauthorized" tone="red" />
    );
  }

  const rows = data.rows ?? [];
  const problems = data.problems ?? [];
  const isIcpc = data?.type === 'icpc' || data?.contest?.type === 'icpc';
  const isFreezeActive = Boolean(data.isFrozen);
  const standingTableMinWidth = Math.max(
    980,
    80 + 288 + 112 + (isIcpc ? 112 : 0) + problems.length * 112,
  );

  const getProblemCell = (row: any, label: string) => {
    const fromList = (row?.problems ?? []).find((problem: any) => problem?.label === label);
    if (fromList) {
      return {
        ...fromList,
        hiddenAttempts: Number(fromList.hiddenAttempts ?? 0),
        isFrozenPending: Boolean(fromList.isFrozenPending),
      };
    }

    const fromStatus = row?.problemStatus?.[label];
    if (!fromStatus) {
      return { accepted: false, wrongAttempts: 0, attempts: 0, hiddenAttempts: 0, isFrozenPending: false, acceptedAtMinute: null, isFirstSolve: false };
    }

    return {
      accepted: Boolean(fromStatus.accepted),
      wrongAttempts: Number(fromStatus.tries ?? 0),
      attempts: Number(fromStatus.attempts ?? fromStatus.tries ?? 0),
      hiddenAttempts: Number(fromStatus.hiddenAttempts ?? 0),
      isFrozenPending: Boolean(fromStatus.isFrozenPending),
      acceptedAtMinute: fromStatus.acceptedAtMinute ?? null,
      isFirstSolve: Boolean(fromStatus.isFirstSolve),
      score: fromStatus.score ?? null,
    };
  };

  const formatAcceptedText = (minute: number | null | undefined, wrongAttempts: number) => {
    const safeMinute = Math.max(0, Number(minute ?? 0));
    if ((wrongAttempts ?? 0) <= 0) return `${safeMinute}`;
    return `${safeMinute}(+${wrongAttempts})`;
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="oj-page space-y-5">
        <section className="oj-panel p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">{data.contest.title}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isFreezeActive && (
                <span className="oj-chip bg-sky-50 px-3 py-2 text-sky-700">
                  <Snowflake size={14} />
                  Frozen
                </span>
              )}
              <span className="oj-chip bg-slate-950 px-3 py-2 text-white">
                <Clock3 size={14} />
                {remainingLabel}
              </span>
              <button
                type="button"
                onClick={() => refetch()}
                disabled={isFetching}
                className="oj-btn-secondary cursor-pointer px-3 py-2 text-sm disabled:opacity-50"
              >
                <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>
          </div>
        </section>

        <section className="oj-panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <p className="oj-kicker"><Trophy size={14} /> Leaderboard</p>
              <h2 className="mt-3 text-xl font-extrabold text-slate-950">Contest Ranking</h2>
            </div>
          </div>

          <div className="overflow-x-auto oj-scrollbar">
          <table className="w-full border-separate border-spacing-0 text-sm" style={{ minWidth: standingTableMinWidth }}>
            <thead className="bg-slate-50">
              <tr>
                <th className="sticky left-0 z-20 w-20 border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs font-extrabold uppercase tracking-wide text-slate-500">Rank</th>
                <th className="sticky left-20 z-20 w-72 border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs font-extrabold uppercase tracking-wide text-slate-500">Participant</th>
                <th className="w-28 border-b border-slate-200 px-4 py-3 text-center text-xs font-extrabold uppercase tracking-wide text-slate-500">{isIcpc ? 'Solved' : 'Score'}</th>
                {isIcpc && (
                  <th className="w-28 border-b border-slate-200 px-4 py-3 text-center text-xs font-extrabold uppercase tracking-wide text-slate-500">Penalty</th>
                )}
                {problems.map((problem) => (
                  <th key={problem.label} className="w-28 border-b border-slate-200 px-3 py-3 text-center">
                    <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950 text-sm font-extrabold text-white">{problem.label}</div>
                    <div className="mt-1 text-[11px] font-bold text-slate-500">{problem.solvedCount ?? 0}/{problem.attemptsCount ?? 0}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row: any, index: number) => (
                <tr key={row.participantId ?? index} className="group">
                  <td className="sticky left-0 z-10 border-b border-slate-100 bg-white px-4 py-3 font-extrabold text-slate-700 group-hover:bg-slate-50">{row.rank ?? index + 1}</td>
                  <td className="sticky left-20 z-10 border-b border-slate-100 bg-white px-4 py-3 group-hover:bg-slate-50">
                    <div className="max-w-64 truncate font-extrabold text-slate-900">{row.participantName ?? row.participantId}</div>
                    <div className="mt-0.5 max-w-64 truncate text-[11px] font-semibold text-slate-400">{row.universityName ?? 'University not set'}</div>
                  </td>
                  {isIcpc ? (
                    <>
                      <td className="border-b border-slate-100 px-4 py-3 text-center font-extrabold text-teal-700 tabular-nums">{row.solved ?? 0}</td>
                      <td className="border-b border-slate-100 px-4 py-3 text-center font-bold text-slate-600 tabular-nums">{row.totalPenalty ?? row.penalty ?? 0}</td>
                      {problems.map((problem) => {
                        const problemCell = getProblemCell(row, problem.label);
                        return (
                          <td key={problem.label} className="border-b border-slate-100 px-3 py-3 text-center align-middle tabular-nums">
                            {problemCell.isFrozenPending ? (
                              <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-sky-50 px-2 text-sm font-extrabold text-sky-700 ring-1 ring-sky-100">?</span>
                            ) : problemCell.accepted ? (
                              <div className={`mx-auto inline-flex min-w-16 flex-col items-center rounded-xl px-2 py-1.5 text-xs font-extrabold ${problemCell.isFirstSolve ? 'bg-amber-50 text-amber-700' : 'bg-teal-50 text-teal-700'}`}>
                                {problemCell.isFirstSolve ? <Star size={14} fill="currentColor" /> : <CheckCircle2 size={14} />}
                                <span className="mt-1">
                                  {formatAcceptedText(problemCell.acceptedAtMinute, problemCell.wrongAttempts ?? 0)}
                                </span>
                              </div>
                            ) : (problemCell.wrongAttempts ?? 0) > 0 ? (
                              <span className="inline-flex min-w-10 justify-center rounded-full bg-rose-50 px-2 py-1 text-xs font-extrabold text-rose-700">-{problemCell.wrongAttempts}</span>
                            ) : <span className="text-slate-300">—</span>}
                          </td>
                        );
                      })}
                    </>
                  ) : (
                    <>
                      <td className="border-b border-slate-100 px-4 py-3 text-center font-extrabold text-teal-700 tabular-nums">{row.totalScore ?? row.scores ?? 0}</td>
                      {problems.map((problem) => {
                        const problemCell = getProblemCell(row, problem.label);
                        return (
                          <td key={problem.label} className="border-b border-slate-100 px-3 py-3 text-center text-xs tabular-nums">
                            {problemCell.isFrozenPending ? (
                              <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-sky-50 px-2 text-sm font-extrabold text-sky-700 ring-1 ring-sky-100">?</span>
                            ) : problemCell.score != null ? <span className="inline-flex min-w-12 justify-center rounded-full bg-teal-50 px-2 py-1 font-extrabold text-teal-700">{problemCell.score}</span> : <span className="text-slate-300">—</span>}
                          </td>
                        );
                      })}
                    </>
                  )}
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={3 + (isIcpc ? 1 : 0) + problems.length} className="px-4 py-10 text-center text-sm font-semibold text-slate-400">No standings yet</td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </section>
      </div>
    </div>
  );
}
