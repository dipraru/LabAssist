import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { Modal } from '../../components/Modal';

const problemSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters'),
  statement: z.string().min(10, 'Statement must be at least 10 characters'),
  timeLimitMs: z.coerce.number().positive(),
  memoryLimitKb: z.coerce.number().positive(),
  sampleTestCases: z.array(z.object({ input: z.string(), output: z.string() })).optional(),
});

type ProblemInput = z.input<typeof problemSchema>;
type ProblemData = z.output<typeof problemSchema>;

export function JudgeProblems() {
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProblemId, setEditingProblemId] = useState<string | null>(null);
  const [isViewOnly, setIsViewOnly] = useState(false);

  const { data: problems = [] } = useQuery({
    queryKey: ['judge-problems'],
    queryFn: () => api.get('/contests/problems/mine').then((r) => r.data),
  });

  const form = useForm<ProblemInput, unknown, ProblemData>({
    resolver: zodResolver(problemSchema),
    defaultValues: {
      timeLimitMs: 2000,
      memoryLimitKb: 262144,
      sampleTestCases: [{ input: '', output: '' }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'sampleTestCases',
  });

  const saveMutation = useMutation({
    mutationFn: (payload: ProblemData) => {
      if (editingProblemId) {
        return api.patch(`/contests/problems/${editingProblemId}`, payload);
      }
      return api.post('/contests/problems', payload);
    },
    onSuccess: () => {
      toast.success(editingProblemId ? 'Problem updated' : 'Problem created');
      setShowCreateModal(false);
      setEditingProblemId(null);
      form.reset({
        title: '',
        statement: '',
        timeLimitMs: 2000,
        memoryLimitKb: 262144,
        sampleTestCases: [{ input: '', output: '' }],
      });
      qc.invalidateQueries({ queryKey: ['judge-problems'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message ?? 'Failed to save problem');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (problemId: string) => api.delete(`/contests/problems/${problemId}`),
    onSuccess: () => {
      toast.success('Problem deleted');
      qc.invalidateQueries({ queryKey: ['judge-problems'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message ?? 'Failed to delete problem');
    },
  });

  const openCreate = () => {
    setIsViewOnly(false);
    setEditingProblemId(null);
    form.reset({
      title: '',
      statement: '',
      timeLimitMs: 2000,
      memoryLimitKb: 262144,
      sampleTestCases: [{ input: '', output: '' }],
    });
    setShowCreateModal(true);
  };

  const openEdit = (problem: any) => {
    setIsViewOnly(false);
    setEditingProblemId(problem.id);
    form.reset({
      title: problem.title ?? '',
      statement: problem.statement ?? '',
      timeLimitMs: problem.timeLimitMs ?? 2000,
      memoryLimitKb: problem.memoryLimitKb ?? 262144,
      sampleTestCases: problem.sampleTestCases?.length ? problem.sampleTestCases : [{ input: '', output: '' }],
    });
    setShowCreateModal(true);
  };

  const openView = (problem: any) => {
    setIsViewOnly(true);
    setEditingProblemId(problem.id);
    form.reset({
      title: problem.title ?? '',
      statement: problem.statement ?? '',
      timeLimitMs: problem.timeLimitMs ?? 2000,
      memoryLimitKb: problem.memoryLimitKb ?? 262144,
      sampleTestCases: problem.sampleTestCases?.length ? problem.sampleTestCases : [{ input: '', output: '' }],
    });
    setShowCreateModal(true);
  };

  useEffect(() => {
    const editProblemId = searchParams.get('editProblemId');
    const viewProblemId = searchParams.get('viewProblemId');
    if (!editProblemId && !viewProblemId) return;

    const targetId = editProblemId ?? viewProblemId;
    const target = (problems as any[]).find((problem: any) => problem.id === targetId);
    if (!target) return;

    if (editProblemId) openEdit(target);
    if (viewProblemId) openView(target);

    const next = new URLSearchParams(searchParams);
    next.delete('editProblemId');
    next.delete('viewProblemId');
    setSearchParams(next, { replace: true });
  }, [problems, searchParams, setSearchParams]);

  const handleDelete = (problem: any) => {
    const confirmed = window.confirm(`Delete problem ${problem.problemCode ?? problem.id}?`);
    if (!confirmed) return;
    deleteMutation.mutate(problem.id);
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">My Problems</h1>
            <p className="text-sm text-slate-500 mt-1">Maintain your own problem bank for contests.</p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium"
          >
            <Plus size={16} /> Create New Problem
          </button>
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Problem List</h2>
            <span className="text-sm text-slate-500">{(problems as any[]).length} total</span>
          </div>
          <div className="space-y-3 max-h-[70vh] overflow-auto pr-1">
            {(problems as any[]).map((problem: any) => (
              <article key={problem.id} className="border border-slate-200 rounded-lg p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-medium text-slate-900">{problem.title}</h3>
                    <p className="text-xs text-indigo-700 font-medium mt-1">{problem.problemCode ?? problem.id}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      TL: {problem.timeLimitMs ?? '—'} ms · ML: {problem.memoryLimitKb ?? '—'} KB
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-600">
                      {problem.sampleTestCases?.length ?? 0} samples
                    </span>
                    <button
                      type="button"
                      onClick={() => openEdit(problem)}
                      className="inline-flex items-center gap-1 px-2 py-1 border border-slate-300 rounded-md text-xs hover:bg-slate-50"
                    >
                      <Pencil size={12} /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(problem)}
                      disabled={deleteMutation.isPending}
                      className="inline-flex items-center gap-1 px-2 py-1 border border-red-300 text-red-700 rounded-md text-xs hover:bg-red-50 disabled:opacity-60"
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                </div>
              </article>
            ))}
            {!(problems as any[]).length && (
              <p className="text-sm text-slate-500 text-center py-8">No problems yet. Create your first one.</p>
            )}
          </div>
        </section>
      </div>

      <Modal
        open={showCreateModal}
        title={isViewOnly ? 'Problem Statement' : editingProblemId ? 'Edit Problem' : 'Create New Problem'}
        onClose={() => {
          setShowCreateModal(false);
          setEditingProblemId(null);
          setIsViewOnly(false);
        }}
        maxWidthClass="max-w-3xl"
      >
        <form onSubmit={form.handleSubmit((d) => saveMutation.mutate(d))} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-600">Title</label>
            <input
              {...form.register('title')}
              readOnly={isViewOnly}
              className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600">Statement</label>
            <textarea
              {...form.register('statement')}
              readOnly={isViewOnly}
              rows={6}
              className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600">Time (ms)</label>
              <input
                type="number"
                {...form.register('timeLimitMs')}
                readOnly={isViewOnly}
                className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Memory (KB)</label>
              <input
                type="number"
                {...form.register('memoryLimitKb')}
                readOnly={isViewOnly}
                className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-slate-600">Sample Test Cases</label>
              <button
                type="button"
                onClick={() => append({ input: '', output: '' })}
                disabled={isViewOnly}
                className="text-xs inline-flex items-center gap-1 text-indigo-600"
              >
                <Plus size={12} /> Add
              </button>
            </div>
            <div className="space-y-2 max-h-56 overflow-auto pr-1">
              {fields.map((field, index) => (
                <div key={field.id} className="grid grid-cols-2 gap-2">
                  <textarea
                    rows={2}
                    placeholder="Input"
                    {...form.register(`sampleTestCases.${index}.input`)}
                    readOnly={isViewOnly}
                    className="border border-slate-300 rounded-md px-2 py-1 text-xs font-mono resize-none"
                  />
                  <div className="relative">
                    <textarea
                      rows={2}
                      placeholder="Output"
                      {...form.register(`sampleTestCases.${index}.output`)}
                      readOnly={isViewOnly}
                      className="w-full border border-slate-300 rounded-md px-2 py-1 text-xs font-mono resize-none"
                    />
                    {fields.length > 1 && !isViewOnly && (
                      <button
                        type="button"
                        onClick={() => remove(index)}
                        className="absolute top-1 right-1 text-red-500"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setShowCreateModal(false);
                setEditingProblemId(null);
                setIsViewOnly(false);
              }}
              className="px-4 py-2 border border-slate-300 rounded-md text-sm"
            >
              Close
            </button>
            {!isViewOnly && (
              <button
                type="submit"
                disabled={saveMutation.isPending}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-md text-sm font-medium"
              >
                {saveMutation.isPending ? 'Saving…' : editingProblemId ? 'Save Changes' : 'Create Problem'}
              </button>
            )}
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
