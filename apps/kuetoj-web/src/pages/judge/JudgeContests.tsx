import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Plus, GripVertical, X } from 'lucide-react';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';

type ProblemItem = {
  id: string;
  title: string;
  timeLimitMs?: number;
  memoryLimitKb?: number;
};

type SelectedProblem = {
  problemId: string;
  title: string;
  score?: number;
};

const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  scheduled: 'bg-blue-100 text-blue-700',
  running: 'bg-green-100 text-green-700',
  frozen: 'bg-indigo-100 text-indigo-700',
  ended: 'bg-slate-100 text-slate-500',
};

export function JudgeContests() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'icpc' | 'score_based'>('icpc');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [freezeTime, setFreezeTime] = useState('');
  const [selected, setSelected] = useState<SelectedProblem[]>([]);

  const { data: contests = [] } = useQuery({
    queryKey: ['judge-contests'],
    queryFn: () => api.get('/contests/mine').then((r) => r.data),
  });

  const { data: myProblems = [] } = useQuery({
    queryKey: ['judge-problems'],
    queryFn: () => api.get('/contests/problems/mine').then((r) => r.data),
  });

  const availableProblems = useMemo(
    () => (myProblems as ProblemItem[]).filter((p) => !selected.some((s) => s.problemId === p.id)),
    [myProblems, selected],
  );

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!title.trim() || !startTime || !endTime || selected.length === 0) {
        throw new Error('Please fill title, time range, and select at least one problem');
      }

      const problems = selected.map((p, idx) => ({
        problemId: p.problemId,
        label: String.fromCharCode(65 + idx),
        orderIndex: idx,
        score: type === 'score_based' ? (p.score ?? 100) : undefined,
      }));

      return api.post('/contests', {
        title,
        description: description || 'Contest created by judge',
        type,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        freezeTime: freezeTime ? new Date(freezeTime).toISOString() : undefined,
        problems,
      });
    },
    onSuccess: (res) => {
      toast.success('Contest created');
      qc.invalidateQueries({ queryKey: ['judge-contests'] });
      setShowCreate(false);
      setTitle('');
      setDescription('');
      setType('icpc');
      setStartTime('');
      setEndTime('');
      setFreezeTime('');
      setSelected([]);
      navigate(`/judge/contests/${res.data.id}`);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message ?? err.message ?? 'Failed to create contest');
    },
  });

  const addProblem = (problem: ProblemItem) => {
    setSelected((prev) => [...prev, { problemId: problem.id, title: problem.title, score: 100 }]);
  };

  const removeProblem = (problemId: string) => {
    setSelected((prev) => prev.filter((p) => p.problemId !== problemId));
  };

  const onDropAt = (dropIndex: number) => {
    if (dragIndex == null || dragIndex === dropIndex) return;
    setSelected((prev) => {
      const next = [...prev];
      const [item] = next.splice(dragIndex, 1);
      next.splice(dropIndex, 0, item);
      return next;
    });
    setDragIndex(null);
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">My Contests</h1>
            <p className="text-sm text-slate-500 mt-1">Manage your contests and build new ones from your own problem set.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/judge/problems')}
              className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium"
            >
              <Plus size={16} /> Create New Problem
            </button>
            <button
              onClick={() => setShowCreate((v) => !v)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium"
            >
              <Plus size={16} /> Create New Contest
            </button>
          </div>
        </section>

        {showCreate && (
          <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Create Contest</h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-600">Title</label>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Description</label>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm resize-none" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-600">Type</label>
                    <select value={type} onChange={(e) => setType(e.target.value as 'icpc' | 'score_based')} className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm">
                      <option value="icpc">ICPC</option>
                      <option value="score_based">Score Based</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">Freeze Time (optional)</label>
                    <input type="datetime-local" value={freezeTime} onChange={(e) => setFreezeTime(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-600">Start</label>
                    <input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">End</label>
                    <input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-800">Available My Problems</h3>
                <div className="border border-slate-200 rounded-md max-h-60 overflow-auto">
                  {availableProblems.map((problem) => (
                    <button
                      key={problem.id}
                      type="button"
                      onClick={() => addProblem(problem)}
                      className="w-full text-left px-3 py-2 border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                    >
                      <p className="text-sm font-medium text-slate-800">{problem.title}</p>
                      <p className="text-xs text-slate-500">TL {problem.timeLimitMs ?? '—'} · ML {problem.memoryLimitKb ?? '—'}</p>
                    </button>
                  ))}
                  {!availableProblems.length && <p className="text-xs text-slate-500 p-3">No more problems to add.</p>}
                </div>
              </div>
            </div>

            <div className="mt-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-2">Selected Problems (Drag to reorder)</h3>
              <div className="border border-slate-200 rounded-md overflow-hidden">
                {selected.map((item, index) => (
                  <div
                    key={item.problemId}
                    draggable
                    onDragStart={() => setDragIndex(index)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => onDropAt(index)}
                    className="grid grid-cols-12 items-center gap-2 px-3 py-2 border-b border-slate-100 last:border-b-0 bg-white"
                  >
                    <div className="col-span-1 text-slate-400 cursor-grab">
                      <GripVertical size={16} />
                    </div>
                    <div className="col-span-1 text-xs font-semibold text-indigo-700">
                      {String.fromCharCode(65 + index)}
                    </div>
                    <div className="col-span-7 text-sm text-slate-800">{item.title}</div>
                    {type === 'score_based' && (
                      <div className="col-span-2">
                        <input
                          type="number"
                          value={item.score ?? 100}
                          onChange={(e) => {
                            const value = Number(e.target.value || 0);
                            setSelected((prev) => prev.map((p) => (p.problemId === item.problemId ? { ...p, score: value } : p)));
                          }}
                          className="w-full border border-slate-300 rounded-md px-2 py-1 text-xs"
                        />
                      </div>
                    )}
                    {type !== 'score_based' && <div className="col-span-2" />}
                    <div className="col-span-1 text-right">
                      <button type="button" onClick={() => removeProblem(item.problemId)} className="text-red-500 hover:text-red-700">
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ))}
                {!selected.length && <p className="text-sm text-slate-500 p-4">Select at least one problem from your list.</p>}
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 border border-slate-300 rounded-md text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-md text-sm font-medium"
              >
                {createMutation.isPending ? 'Creating…' : 'Create Contest'}
              </button>
            </div>
          </section>
        )}

        <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="space-y-3">
            {(contests as any[]).map((contest: any) => (
              <article key={contest.id} className="border border-slate-200 rounded-lg p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-slate-900">{contest.title}</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      {contest.type} · {contest.startTime?.slice(0, 16).replace('T', ' ')}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${STATUS_COLOR[contest.status] ?? 'bg-slate-100 text-slate-700'}`}>
                    {contest.status}
                  </span>
                </div>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => navigate(`/judge/contests/${contest.id}`)} className="px-3 py-1.5 text-xs border border-slate-300 rounded-md hover:bg-slate-50">Manage</button>
                  <button onClick={() => navigate(`/judge/contests/${contest.id}/participants`)} className="px-3 py-1.5 text-xs border border-slate-300 rounded-md hover:bg-slate-50">Participants</button>
                  <button onClick={() => navigate(`/judge/contests/${contest.id}/standings`)} className="px-3 py-1.5 text-xs border border-slate-300 rounded-md hover:bg-slate-50">Standings</button>
                </div>
              </article>
            ))}
            {!(contests as any[]).length && (
              <p className="text-sm text-slate-500 text-center py-8">No contests yet. Create your first contest.</p>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
