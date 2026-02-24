import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { useNavigate } from 'react-router-dom';
import { Trophy, Code2, Plus } from 'lucide-react';

const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  scheduled: 'bg-blue-100 text-blue-700',
  running: 'bg-green-100 text-green-700',
  frozen: 'bg-indigo-100 text-indigo-700',
  ended: 'bg-slate-100 text-slate-500',
};

export function JudgeDashboard() {
  const navigate = useNavigate();

  const { data: contests = [] } = useQuery({
    queryKey: ['my-contests'],
    queryFn: () => api.get('/contests').then(r => r.data),
  });

  const { data: problems = [] } = useQuery({
    queryKey: ['my-problems'],
    queryFn: () => api.get('/contests/problems/mine').then(r => r.data),
  });

  return (
    <AppShell>
      <div className="max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Judge Dashboard</h1>
          <button onClick={() => navigate('/judge/contests/create')}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
            <Plus size={16} /> New Contest
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center">
              <Trophy className="text-indigo-500" size={22} />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{(contests as any[]).length}</p>
              <p className="text-sm text-slate-500">My Contests</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center">
              <Code2 className="text-green-500" size={22} />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{(problems as any[]).length}</p>
              <p className="text-sm text-slate-500">Problem Bank</p>
            </div>
          </div>
        </div>

        <h2 className="text-lg font-semibold text-slate-800 mb-3">My Contests</h2>
        <div className="space-y-3">
          {(contests as any[]).map((c: any) => (
            <div key={c.id}
              className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-center justify-between cursor-pointer hover:border-indigo-300 transition-colors"
              onClick={() => navigate(`/judge/contests/${c.id}`)}>
              <div>
                <p className="font-semibold text-slate-800">{c.title}</p>
                <p className="text-xs text-slate-500 mt-0.5">{c.type} · {c.startTime?.slice(0,16).replace('T',' ')}</p>
              </div>
              <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${STATUS_COLOR[c.status] ?? 'bg-slate-100 text-slate-600'}`}>{c.status}</span>
            </div>
          ))}
          {!(contests as any[]).length && <p className="text-center text-slate-400 py-6">No contests yet — create one!</p>}
        </div>
      </div>
    </AppShell>
  );
}
