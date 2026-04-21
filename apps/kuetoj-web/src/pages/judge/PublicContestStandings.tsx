import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
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
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-500 text-sm">Checking standings visibility...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <p className="text-red-600 text-lg font-semibold">Unauthorized</p>
    </div>
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

  const isFreezeActive = useMemo(() => {
    if (!data?.contest?.startTime || !data?.contest?.endTime) return false;
    const anyData = data as any;
    return Boolean(anyData?.isFrozen);
  }, [data]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-500 text-sm">Loading public standings...</p>
      </div>
    );
  }

  if (isError || !data?.contest) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-red-600 text-lg font-semibold">Unauthorized</p>
      </div>
    );
  }

  const rows = data.rows ?? [];
  const problems = data.problems ?? [];
  const isIcpc = data?.type === 'icpc' || data?.contest?.type === 'icpc';
  const standingTableMinWidth = Math.max(
    980,
    64 + 288 + 112 + problems.length * 112,
  );

  const getProblemCell = (row: any, label: string) => {
    const fromList = (row?.problems ?? []).find((problem: any) => problem?.label === label);
    if (fromList) return fromList;

    const fromStatus = row?.problemStatus?.[label];
    if (!fromStatus) {
      return { accepted: false, wrongAttempts: 0, attempts: 0, acceptedAtMinute: null, isFirstSolve: false };
    }

    return {
      accepted: Boolean(fromStatus.accepted),
      wrongAttempts: Number(fromStatus.tries ?? 0),
      attempts: Number(fromStatus.attempts ?? fromStatus.tries ?? 0),
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
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold text-slate-900">{data.contest.title}</h1>
          <p className="text-sm text-slate-500 mt-1">Public Standings</p>
        </div>

        <div className="mb-4 flex items-center justify-end gap-2">
          {isFreezeActive && (
            <div className="px-3 py-1.5 rounded-lg bg-blue-100 text-blue-700 text-sm font-semibold">
              Frozen
            </div>
          )}
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            Refresh
          </button>
          <div className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-sm font-semibold text-slate-700">
            {remainingLabel}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: standingTableMinWidth }}>
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="w-12 px-4 py-3 text-left font-semibold text-slate-700">Rank</th>
                <th className="min-w-[240px] px-4 py-3 text-left font-semibold text-slate-700">Participant</th>
                {isIcpc ? (
                  <>
                    <th className="w-24 px-4 py-3 text-center font-semibold text-slate-700">Solved</th>
                    {problems.map((problem) => (
                      <th key={problem.label} className="min-w-[92px] px-3 py-3 text-center font-semibold text-slate-700">
                        <div>{problem.label}</div>
                        <div className="text-[11px] font-medium text-slate-500">{problem.solvedCount ?? 0}/{problem.attemptsCount ?? 0}</div>
                      </th>
                    ))}
                  </>
                ) : (
                  <>
                    <th className="px-4 py-3 text-center font-semibold text-slate-700">Score</th>
                    {problems.map((problem) => (
                      <th key={problem.label} className="min-w-[92px] px-3 py-3 text-center font-semibold text-slate-700">
                        <div>{problem.label}</div>
                        <div className="text-[11px] font-medium text-slate-500">{problem.solvedCount ?? 0}/{problem.attemptsCount ?? 0}</div>
                      </th>
                    ))}
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row: any, index: number) => (
                <tr key={row.participantId ?? index} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-slate-600">{row.rank ?? index + 1}</td>
                  <td className="px-4 py-3 font-medium">{row.participantName ?? row.participantId}</td>
                  {isIcpc ? (
                    <>
                      <td
                        className="px-4 py-3 text-center"
                        title={(row.solved ?? 0) > 0 ? `Penalty: ${row.totalPenalty ?? row.penalty ?? 0}` : undefined}
                      >
                        <div className="font-bold text-green-600">{row.solved ?? 0}</div>
                        {(row.solved ?? 0) > 0 && (
                          <div className="text-[11px] font-medium text-slate-500">{row.totalPenalty ?? row.penalty ?? 0}</div>
                        )}
                      </td>
                      {problems.map((problem) => {
                        const problemCell = getProblemCell(row, problem.label);
                        return (
                          <td key={problem.label} className="px-3 py-3 text-center align-middle">
                            {problemCell.accepted ? (
                              <div className="text-xs">
                                <div className={`text-base leading-none ${problemCell.isFirstSolve ? 'text-amber-500' : 'text-green-600'}`}>
                                  {problemCell.isFirstSolve ? '★' : '✓'}
                                </div>
                                <div className={`mt-1 text-[11px] ${problemCell.isFirstSolve ? 'text-amber-700' : 'text-green-700'}`}>
                                  {formatAcceptedText(problemCell.acceptedAtMinute, problemCell.wrongAttempts ?? 0)}
                                </div>
                              </div>
                            ) : (problemCell.wrongAttempts ?? 0) > 0 ? (
                              <span className="text-sm font-semibold text-red-600">-{problemCell.wrongAttempts}</span>
                            ) : <span className="text-slate-300">—</span>}
                          </td>
                        );
                      })}
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 text-center font-bold text-indigo-600">{row.totalScore ?? row.scores ?? 0}</td>
                      {problems.map((problem) => {
                        const problemCell = getProblemCell(row, problem.label);
                        return (
                          <td key={problem.label} className="px-3 py-3 text-center text-xs">
                            {problemCell.score != null ? <span className="font-medium text-green-600">{problemCell.score}</span> : <span className="text-slate-300">—</span>}
                          </td>
                        );
                      })}
                    </>
                  )}
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={4 + problems.length} className="px-4 py-8 text-center text-slate-400">No standings yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
