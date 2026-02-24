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
    queryFn: () => api.get(`/contests/${id}`).then(r => r.data),
  });

  const { data: standings, refetch } = useQuery({
    queryKey: ['contest-standings', id],
    queryFn: () => api.get(`/contests/${id}/standings`).then(r => r.data),
    refetchInterval: 30000,
  });

  const freezeMutation = useMutation({
    mutationFn: () => api.patch(`/contests/${id}/freeze`),
    onSuccess: () => {
      toast.success(contest?.isStandingFrozen ? 'Standings unfrozen' : 'Standings frozen!');
      qc.invalidateQueries({ queryKey: ['contest', id] });
      qc.invalidateQueries({ queryKey: ['contest-standings', id] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed'),
  });

  const isIcpc = contest?.type === 'icpc';
  const rows: any[] = standings?.rows ?? standings ?? [];

  return (
    <AppShell>
      <div className="max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Standings — {contest?.title}</h1>
            <p className="text-sm text-slate-500 mt-0.5">{contest?.type} · {contest?.status}
              {contest?.isStandingFrozen && <span className="ml-2 text-blue-600 font-medium">❄ Frozen</span>}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => refetch()} className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50">
              <RefreshCw size={14} /> Refresh
            </button>
            <button onClick={() => freezeMutation.mutate()}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium ${
                contest?.isStandingFrozen
                  ? 'bg-orange-500 text-white hover:bg-orange-600'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}>
              <Snowflake size={14} />
              {contest?.isStandingFrozen ? 'Unfreeze' : 'Freeze'}
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
                <tr key={row.participantId ?? idx} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-bold text-slate-500">{idx + 1}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{row.participantName ?? row.participantId}</td>
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
                <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-400">No submissions yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
