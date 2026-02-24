import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { Plus, Trash2 } from 'lucide-react';

const problemSchema = z.object({
  title: z.string().min(2),
  statement: z.string().min(10),
  timeLimitMs: z.coerce.number().positive().default(2000),
  memoryLimitKb: z.coerce.number().positive().default(256000),
  sampleTestCases: z.array(z.object({ input: z.string(), output: z.string() })).optional(),
});
type ProblemData = z.infer<typeof problemSchema>;

const contestSchema = z.object({
  title: z.string().min(2),
  type: z.enum(['icpc', 'score_based']),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  freezeTime: z.string().optional(),
  problemIds: z.array(z.string()).min(1, 'Add at least one problem'),
});
type ContestData = z.infer<typeof contestSchema>;

export function ContestCreate() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [step, setStep] = useState<'problems' | 'contest'>('problems');
  const [createdProblems, setCreatedProblems] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { data: myProblems = [] } = useQuery({
    queryKey: ['my-problems'],
    queryFn: () => api.get('/contests/problems/mine').then(r => r.data),
    onSuccess: (data: any[]) => setCreatedProblems(data),
  } as any);

  const problemForm = useForm<ProblemData>({ resolver: zodResolver(problemSchema), defaultValues: { timeLimitMs: 2000, memoryLimitKb: 256000, sampleTestCases: [{ input: '', output: '' }] } });
  const { fields: tcFields, append: appendTc, remove: removeTc } = useFieldArray({ control: problemForm.control, name: 'sampleTestCases' });

  const contestForm = useForm<ContestData>({ resolver: zodResolver(contestSchema), defaultValues: { type: 'icpc', problemIds: [] } });

  const createProblemMutation = useMutation({
    mutationFn: (d: ProblemData) => api.post('/contests/problems', d),
    onSuccess: (res) => {
      toast.success('Problem created!');
      setCreatedProblems(prev => [...prev, res.data]);
      problemForm.reset({ timeLimitMs: 2000, memoryLimitKb: 256000, sampleTestCases: [{ input: '', output: '' }] });
      qc.invalidateQueries({ queryKey: ['my-problems'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed'),
  });

  const createContestMutation = useMutation({
    mutationFn: (d: ContestData) => api.post('/contests', {
      ...d,
      startTime: new Date(d.startTime).toISOString(),
      endTime: new Date(d.endTime).toISOString(),
      freezeTime: d.freezeTime ? new Date(d.freezeTime).toISOString() : undefined,
      problemIds: selectedIds,
    }),
    onSuccess: (res) => {
      toast.success('Contest created!');
      qc.invalidateQueries({ queryKey: ['my-contests'] });
      navigate(`/judge/contests/${res.data.id}`);
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed'),
  });

  const toggleProblem = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  return (
    <AppShell>
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold text-slate-900 mb-6">Create Contest</h1>

        {/* Step tabs */}
        <div className="flex gap-2 mb-6">
          {(['problems', 'contest'] as const).map(s => (
            <button key={s} onClick={() => setStep(s)}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${step === s ? 'bg-indigo-600 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
              {s === 'problems' ? '1. Add Problems' : '2. Contest Details'}
            </button>
          ))}
        </div>

        {step === 'problems' && (
          <div className="space-y-6">
            {/* Existing problems */}
            {createdProblems.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                <h2 className="font-semibold mb-3">Problem Bank — select for contest</h2>
                <div className="space-y-2">
                  {createdProblems.map((p: any) => (
                    <label key={p.id} className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 cursor-pointer hover:bg-slate-50">
                      <input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => toggleProblem(p.id)} className="rounded" />
                      <div>
                        <p className="font-medium text-sm">{p.title}</p>
                        <p className="text-xs text-slate-500">{p.timeLimitMs}ms · {p.memoryLimitKb}KB</p>
                      </div>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mt-2">{selectedIds.length} selected</p>
              </div>
            )}

            {/* Create new problem */}
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
              <h2 className="font-semibold mb-4">Create New Problem</h2>
              <form onSubmit={problemForm.handleSubmit(d => createProblemMutation.mutate(d))} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
                  <input {...problemForm.register('title')} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Problem Statement</label>
                  <textarea {...problemForm.register('statement')} rows={6}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Time Limit (ms)</label>
                    <input type="number" {...problemForm.register('timeLimitMs')} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Memory Limit (KB)</label>
                    <input type="number" {...problemForm.register('memoryLimitKb')} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-slate-700">Sample Test Cases</label>
                    <button type="button" onClick={() => appendTc({ input: '', output: '' })}
                      className="flex items-center gap-1 text-xs text-indigo-600">
                      <Plus size={12} /> Add case
                    </button>
                  </div>
                  {tcFields.map((f, i) => (
                    <div key={f.id} className="grid grid-cols-2 gap-2 mb-2">
                      <textarea {...problemForm.register(`sampleTestCases.${i}.input`)} placeholder="Input" rows={2}
                        className="px-3 py-2 border border-slate-300 rounded font-mono text-xs resize-none" />
                      <div className="relative">
                        <textarea {...problemForm.register(`sampleTestCases.${i}.output`)} placeholder="Output" rows={2}
                          className="w-full px-3 py-2 border border-slate-300 rounded font-mono text-xs resize-none" />
                        {tcFields.length > 1 && (
                          <button type="button" onClick={() => removeTc(i)}
                            className="absolute top-1 right-1 text-red-400 hover:text-red-600"><Trash2 size={12} /></button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <button type="submit" disabled={createProblemMutation.isPending}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                  Save Problem to Bank
                </button>
              </form>
            </div>

            <button onClick={() => setStep('contest')} disabled={selectedIds.length === 0}
              className="w-full py-2.5 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50">
              Continue → Contest Details ({selectedIds.length} problems selected)
            </button>
          </div>
        )}

        {step === 'contest' && (
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
            <h2 className="font-semibold mb-4">Contest Details</h2>
            <form onSubmit={contestForm.handleSubmit(d => createContestMutation.mutate(d))} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Contest Title</label>
                <input {...contestForm.register('title')} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                <select {...contestForm.register('type')} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
                  <option value="icpc">ICPC (penalty-based)</option>
                  <option value="score_based">Score Based</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Start Time</label>
                  <input type="datetime-local" {...contestForm.register('startTime')} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">End Time</label>
                  <input type="datetime-local" {...contestForm.register('endTime')} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Freeze Time (optional)</label>
                  <input type="datetime-local" {...contestForm.register('freezeTime')} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                </div>
              </div>
              <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3">
                <strong>{selectedIds.length} problems</strong> selected. Each will receive a label (A, B, C…).
              </p>
              <div className="flex gap-3">
                <button type="submit" disabled={createContestMutation.isPending}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                  Create Contest
                </button>
                <button type="button" onClick={() => setStep('problems')}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">
                  Back
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </AppShell>
  );
}
