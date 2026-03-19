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
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50 disabled:opacity-50">
              <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-600 w-10">#</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Participant</th>
                {isIcpc ? (
                  <>
                    <th className="px-4 py-3 text-center font-medium text-slate-600">Solved</th>
                    <th className="px-4 py-3 text-center font-medium text-slate-600">Penalty</th>
                    {(standings?.problems ?? []).map((p: any) => (
                      <th key={p.label} className="px-3 py-3 text-center font-medium text-slate-600 w-12">{p.label}</th>
                    ))}
                  </>
                ) : (
                  <>
                    <th className="px-4 py-3 text-center font-medium text-slate-600">Score</th>
                    {(standings?.problems ?? []).map((p: any) => (
                      <th key={p.label} className="px-3 py-3 text-center font-medium text-slate-600 w-12">{p.label}</th>
                    ))}
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row: any, idx: number) => (
                <tr key={row.participantId ?? idx} className={`hover:bg-slate-50 ${idx < 3 ? 'font-semibold' : ''}`}>
                  <td className="px-4 py-3 text-slate-500">{idx + 1}</td>
                  <td className="px-4 py-3">{row.participantName ?? row.participantId}</td>
                  {isIcpc ? (
                    <>
                      <td className="px-4 py-3 text-center font-bold text-green-600">{row.solved ?? 0}</td>
                      <td className="px-4 py-3 text-center text-slate-600">{row.totalPenalty ?? 0}</td>
                      {(row.problems ?? []).map((p: any) => (
                        <td key={p.label} className="px-3 py-3 text-center">
                          {p.accepted ? (
                            <div className="text-green-600 font-medium text-xs">
                              <div>+{p.attempts > 1 ? p.attempts - 1 : ''}</div>
                              <div>{p.penalty}m</div>
                            </div>
                          ) : p.attempts > 0 ? (
                            <span className="text-red-500 text-xs">-{p.attempts}</span>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                      ))}
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 text-center font-bold text-indigo-600">{row.totalScore ?? 0}</td>
                      {(row.problems ?? []).map((p: any) => (
                        <td key={p.label} className="px-3 py-3 text-center text-xs">
                          {p.score != null ? <span className="text-green-600 font-medium">{p.score}</span> : <span className="text-slate-300">—</span>}
                        </td>
                      ))}
                    </>
                  )}
                </tr>
              ))}
              {!rows.length && (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-400">No entries yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
