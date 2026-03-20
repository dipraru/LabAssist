import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { RefreshCw } from 'lucide-react';
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
        {id && <ParticipantContestHeader contestId={id} />}
        {id && <ParticipantContestNav contestId={id} />}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Standings</h1>
          </div>
          <div className="flex items-center gap-2">
            {standings?.isFrozen && (
              <div className="px-3 py-2 rounded-lg bg-blue-100 text-blue-700 text-sm font-semibold">Frozen</div>
            )}
            <button onClick={() => refetch()} disabled={isFetching}
              className="cursor-pointer flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50 disabled:opacity-50">
              <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-700 w-12">Rank</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700 min-w-[220px]">Participant</th>
                {isIcpc ? (
                  <>
                    <th className="px-4 py-3 text-center font-semibold text-slate-700 w-24">Solved</th>
                    {problems.map((p: any) => (
                      <th key={p.label} className="px-3 py-3 text-center font-semibold text-slate-700 min-w-[92px]">
                        <div>{p.label}</div>
                        <div className="text-[11px] font-medium text-slate-500">{p.solvedCount ?? 0}/{p.attemptsCount ?? 0}</div>
                      </th>
                    ))}
                  </>
                ) : (
                  <>
                    <th className="px-4 py-3 text-center font-semibold text-slate-700">Score</th>
                    {problems.map((p: any) => (
                      <th key={p.label} className="px-3 py-3 text-center font-semibold text-slate-700 min-w-[92px]">
                        <div>{p.label}</div>
                        <div className="text-[11px] font-medium text-slate-500">{p.solvedCount ?? 0}/{p.attemptsCount ?? 0}</div>
                      </th>
                    ))}
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row: any, idx: number) => (
                <tr key={row.participantId ?? idx} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-slate-600">{row.rank ?? idx + 1}</td>
                  <td className="px-4 py-3">{row.participantName ?? row.participantId}</td>
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
                            {problemCell.score != null ? <span className="text-green-600 font-medium">{problemCell.score}</span> : <span className="text-slate-300">—</span>}
                          </td>
                        );
                      })}
                    </>
                  )}
                </tr>
              ))}
              {!rows.length && (
                <tr><td colSpan={4 + problems.length} className="px-4 py-8 text-center text-slate-400">No entries yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
