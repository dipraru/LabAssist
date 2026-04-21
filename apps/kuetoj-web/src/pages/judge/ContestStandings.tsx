import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { Snowflake, RefreshCw } from 'lucide-react';

export function ContestStandings() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const { data: contest } = useQuery({
    queryKey: ['contest', id],
    queryFn: () => api.get(`/contests/${id}`).then((response) => response.data),
  });

  const { data: standings, refetch, isFetching } = useQuery({
    queryKey: ['contest-standings', id],
    queryFn: () => api.get(`/contests/${id}/standings`).then((response) => response.data),
    refetchInterval: 30000,
  });

  const freezeMutation = useMutation({
    mutationFn: (frozen: boolean) => api.patch(`/contests/${id}/freeze`, { frozen }),
    onSuccess: () => {
      toast.success(contest?.isStandingFrozen ? 'Standings unfrozen' : 'Standings frozen');
      qc.invalidateQueries({ queryKey: ['contest', id] });
      qc.invalidateQueries({ queryKey: ['contest-standings', id] });
    },
    onError: (error: any) => toast.error(error.response?.data?.message ?? 'Failed'),
  });

  const isIcpc = contest?.type === 'icpc';
  const rows: any[] = standings?.rows ?? [];
  const problems: any[] = standings?.problems ?? [];

  const getProblemCell = (row: any, label: string) => {
    const fromList = (row?.problems ?? []).find((problem: any) => problem?.label === label);
    if (fromList) return fromList;

    const fromStatus = row?.problemStatus?.[label];
    if (!fromStatus) {
      return { accepted: false, wrongAttempts: 0, attempts: 0, acceptedAtMinute: null };
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
    <AppShell>
      <div className="w-full">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Standings — {contest?.title}</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              {contest?.type} · {contest?.status}
              {standings?.isFrozen && <span className="ml-2 font-medium text-blue-600">❄ Frozen</span>}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => freezeMutation.mutate(!Boolean(contest?.isStandingFrozen))}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ${
                contest?.isStandingFrozen
                  ? 'bg-orange-500 text-white hover:bg-orange-600'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              <Snowflake size={14} />
              {contest?.isStandingFrozen ? 'Unfreeze' : 'Freeze'}
            </button>
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="cursor-pointer flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white shadow-sm">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="w-12 px-4 py-3 text-left font-semibold text-slate-700">Rank</th>
                <th className="min-w-[240px] px-4 py-3 text-left font-semibold text-slate-700">Participant</th>
                {isIcpc ? (
                  <>
                    <th className="w-24 px-4 py-3 text-center font-semibold text-slate-700">Solved</th>
                    {problems.map((problem: any) => (
                      <th key={problem.label} className="min-w-[92px] px-3 py-3 text-center font-semibold text-slate-700">
                        <div>{problem.label}</div>
                        <div className="text-[11px] font-medium text-slate-500">{problem.solvedCount ?? 0}/{problem.attemptsCount ?? 0}</div>
                      </th>
                    ))}
                  </>
                ) : (
                  <>
                    <th className="px-4 py-3 text-center font-semibold text-slate-700">Score</th>
                    {problems.map((problem: any) => (
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
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{row.participantName ?? row.participantId}</div>
                    <div className="mt-0.5 max-w-64 truncate text-[11px] font-semibold text-slate-400">{row.universityName ?? 'University not set'}</div>
                  </td>
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
                      {problems.map((problem: any) => {
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
                      {problems.map((problem: any) => {
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
                  <td colSpan={4 + problems.length} className="px-4 py-8 text-center text-slate-400">
                    No standings yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
