import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { BookOpenCheck, Pencil, Plus, Search, Trash2 } from 'lucide-react';
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
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProblemId, setEditingProblemId] = useState<string | null>(null);
  const [isViewOnly, setIsViewOnly] = useState(false);
  const [searchText, setSearchText] = useState('');

  const { data: problems = [] } = useQuery({
    queryKey: ['judge-problems'],
    queryFn: () => api.get('/contests/problems/mine').then((r) => r.data),
  });

  const filteredProblems = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return problems as any[];
    return (problems as any[]).filter((problem) => {
      const title = String(problem.title ?? '').toLowerCase();
      const code = String(problem.problemCode ?? problem.id ?? '').toLowerCase();
      return title.includes(query) || code.includes(query);
    });
  }, [problems, searchText]);

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
    navigate('/problems/new');
  };

  const openEdit = (problem: any) => {
    navigate(`/problems/${problem.problemCode ?? problem.id}/edit`);
  };

  const handleDelete = (problem: any) => {
    const confirmed = window.confirm(`Delete problem ${problem.problemCode ?? problem.id}?`);
    if (!confirmed) return;
    deleteMutation.mutate(problem.id);
  };

  return (
    <AppShell>
      <div className="oj-page space-y-6">
        <section className="oj-hero p-6 sm:p-7">
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-5">
          <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.18em] text-teal-50 ring-1 ring-white/20">
                <BookOpenCheck size={14} />
                Problem Bank
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight">My Problems</h1>
              <p className="mt-2 text-sm font-semibold text-teal-50/85">Create, maintain, and reuse problems across temporary contests.</p>
          </div>
          <button
            type="button"
            onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-extrabold text-teal-800 shadow-xl shadow-slate-950/10 transition-transform hover:-translate-y-0.5"
          >
            <Plus size={16} /> Create New Problem
          </button>
          </div>
        </section>

        <section className="oj-panel p-5">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-slate-950">Problem List</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">{(problems as any[]).length} total problems</p>
            </div>
            <label className="relative w-full sm:w-80">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search title or code"
                className="oj-input !pl-10"
              />
            </label>
          </div>
          <div className="grid max-h-[70vh] gap-4 overflow-auto pr-1 oj-scrollbar lg:grid-cols-2">
            {filteredProblems.map((problem: any) => (
              <article key={problem.id} className="oj-panel-strong oj-card-hover p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-extrabold text-slate-950">{problem.title}</h3>
                    <p className="mt-1 text-xs font-extrabold uppercase tracking-wide text-teal-700">{problem.problemCode ?? problem.id}</p>
                    <p className="mt-2 text-xs font-semibold text-slate-500">
                      TL: {problem.timeLimitMs ?? '—'} ms · ML: {problem.memoryLimitKb ?? '—'} KB
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className="oj-chip bg-slate-100 text-slate-600">
                      {problem.sampleTestCases?.length ?? 0} samples
                    </span>
                    <button
                      type="button"
                      onClick={() => openEdit(problem)}
                      className="oj-btn-secondary px-3 py-2 text-xs"
                    >
                      <Pencil size={12} /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(problem)}
                      disabled={deleteMutation.isPending}
                      className="oj-btn-danger px-3 py-2 text-xs disabled:opacity-60"
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                </div>
              </article>
            ))}
            {!filteredProblems.length && (
              <p className="col-span-full rounded-3xl border border-dashed border-slate-200 bg-white/70 py-10 text-center text-sm font-semibold text-slate-500">
                {(problems as any[]).length ? 'No problems match your search.' : 'No problems yet. Create your first one.'}
              </p>
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
