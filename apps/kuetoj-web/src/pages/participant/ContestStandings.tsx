import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { CheckCircle2, RefreshCw, Trophy } from 'lucide-react';
import { ParticipantContestNav } from '../../components/ParticipantContestNav';
import { ParticipantContestHeader } from '../../components/ParticipantContestHeader';

export function ParticipantStandings() {
  const { id } = useParams<{ id: string }>();

  const { data: contest } = useQuery({
    queryKey: ['contest', id],
    queryFn: () => api.get(`/contests/${id}`).then(r => r.data),
  });

  const { data: standings, refetch, isFetching } = useQuery({
    queryKey: ['contest-standings', id],
    queryFn: () => api.get(`/contests/${id}/standings`).then(r => r.data),
    refetchInterval: 60000,
  });

  const isIcpc = contest?.type === 'icpc';
  const rows: any[] = standings?.rows ?? standings ?? [];
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
      <div className="oj-page">
        {id && <ParticipantContestHeader contestId={id} />}
        {id && <ParticipantContestNav contestId={id} />}
        <div className="oj-panel mb-5 flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <p className="oj-kicker"><Trophy size={14} /> Leaderboard</p>
            <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-slate-950">Standings</h1>
            <p className="mt-1 text-sm font-semibold text-slate-500">Contest ranks update automatically during the round.</p>
          </div>
          <div className="flex items-center gap-2">
            {standings?.isFrozen && (
              <div className="rounded-2xl bg-sky-100 px-3 py-2 text-sm font-extrabold text-sky-700">Frozen</div>
            )}
            <button onClick={() => refetch()} disabled={isFetching}
              className="oj-btn-secondary cursor-pointer disabled:opacity-50">
              <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </div>

        <div className="oj-panel overflow-hidden">
          <div className="overflow-x-auto oj-scrollbar">
          <table className="min-w-max border-separate border-spacing-0 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="sticky left-0 z-20 w-20 border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs font-extrabold uppercase tracking-wide text-slate-500">Rank</th>
                <th className="sticky left-20 z-20 w-72 border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs font-extrabold uppercase tracking-wide text-slate-500">Participant</th>
                <th className="w-28 border-b border-slate-200 px-4 py-3 text-center text-xs font-extrabold uppercase tracking-wide text-slate-500">{isIcpc ? 'Solved' : 'Score'}</th>
                {isIcpc && (
                  <th className="w-28 border-b border-slate-200 px-4 py-3 text-center text-xs font-extrabold uppercase tracking-wide text-slate-500">Penalty</th>
                )}
                {problems.map((p: any) => (
                  <th key={p.label} className="w-28 border-b border-slate-200 px-3 py-3 text-center">
                    <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950 text-sm font-extrabold text-white">{p.label}</div>
                    <div className="mt-1 text-[11px] font-bold text-slate-500">{p.solvedCount ?? 0}/{p.attemptsCount ?? 0}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row: any, idx: number) => (
                <tr key={row.participantId ?? idx} className="group">
                  <td className="sticky left-0 z-10 border-b border-slate-100 bg-white px-4 py-3 font-extrabold text-slate-700 group-hover:bg-slate-50">{row.rank ?? idx + 1}</td>
                  <td className="sticky left-20 z-10 border-b border-slate-100 bg-white px-4 py-3 group-hover:bg-slate-50">
                    <div className="max-w-64 truncate font-extrabold text-slate-900">{row.participantName ?? row.participantId}</div>
                    <div className="mt-0.5 text-[11px] font-semibold text-slate-400">{row.participantId}</div>
                  </td>
                  {isIcpc ? (
                    <>
                      <td className="border-b border-slate-100 px-4 py-3 text-center font-extrabold text-teal-700 tabular-nums">{row.solved ?? 0}</td>
                      <td className="border-b border-slate-100 px-4 py-3 text-center font-bold text-slate-600 tabular-nums">{row.totalPenalty ?? row.penalty ?? 0}</td>
                      {problems.map((problem: any) => {
                        const problemCell = getProblemCell(row, problem.label);
                        return (
                          <td key={problem.label} className="border-b border-slate-100 px-3 py-3 text-center align-middle tabular-nums">
                            {problemCell.accepted ? (
                              <div className={`mx-auto inline-flex min-w-16 flex-col items-center rounded-xl px-2 py-1.5 text-xs font-extrabold ${problemCell.isFirstSolve ? 'bg-amber-50 text-amber-700' : 'bg-teal-50 text-teal-700'}`}>
                                <CheckCircle2 size={14} />
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
                      {problems.map((problem: any) => {
                        const problemCell = getProblemCell(row, problem.label);
                        return (
                          <td key={problem.label} className="border-b border-slate-100 px-3 py-3 text-center text-xs tabular-nums">
                            {problemCell.score != null ? <span className="inline-flex min-w-12 justify-center rounded-full bg-teal-50 px-2 py-1 font-extrabold text-teal-700">{problemCell.score}</span> : <span className="text-slate-300">—</span>}
                          </td>
                        );
                      })}
                    </>
                  )}
                </tr>
              ))}
              {!rows.length && (
                <tr><td colSpan={3 + (isIcpc ? 1 : 0) + problems.length} className="px-4 py-10 text-center text-sm font-semibold text-slate-400">No entries yet</td></tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
