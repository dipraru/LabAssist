import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, GripVertical, Plus, Search, Shuffle, Snowflake, X } from 'lucide-react';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';

type ProblemItem = {
  id: string;
  problemCode?: string;
  title: string;
  timeLimitMs?: number;
  memoryLimitKb?: number;
};

type SelectedProblem = {
  problemId: string;
  problemCode?: string;
  title: string;
  score?: number;
};

function defaultStartDateTime() {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setSeconds(0, 0);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 16);
}

function problemLabel(index: number) {
  return String.fromCharCode(65 + index);
}

export function JudgeContestCreate() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'icpc' | 'score_based'>('icpc');
  const [standingVisibility, setStandingVisibility] = useState<'private' | 'public'>('private');
  const [startAt, setStartAt] = useState(defaultStartDateTime());
  const [duration, setDuration] = useState('05:00');
  const [freezeEnabled, setFreezeEnabled] = useState(false);
  const [manualUnfreeze, setManualUnfreeze] = useState(true);
  const [freezeBeforeMinutes, setFreezeBeforeMinutes] = useState('60');
  const [freezeAfterMinutes, setFreezeAfterMinutes] = useState('0');
  const [searchText, setSearchText] = useState('');
  const [selected, setSelected] = useState<SelectedProblem[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const { data: problems = [] } = useQuery({
    queryKey: ['judge-problems'],
    queryFn: () => api.get('/contests/problems/mine').then((r) => r.data),
  });

  const filteredProblems = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    const selectedIds = new Set(selected.map((item) => item.problemId));
    return (problems as ProblemItem[]).filter((problem) => {
      if (selectedIds.has(problem.id)) return false;
      if (!query) return true;
      return String(problem.title ?? '').toLowerCase().includes(query) ||
        String(problem.problemCode ?? problem.id).toLowerCase().includes(query);
    });
  }, [problems, searchText, selected]);

  const parseDuration = () => {
    const matched = duration.trim().match(/^(\d{1,3}):(\d{2})$/);
    if (!matched) throw new Error('Duration must use HH:MM format');
    const hours = Number(matched[1]);
    const minutes = Number(matched[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes > 59) {
      throw new Error('Duration must be valid');
    }
    if (hours * 60 + minutes <= 0) throw new Error('Duration must be greater than zero');
    return { hours, minutes };
  };

  const createMutation = useMutation({
    mutationFn: () => {
      if (!title.trim()) throw new Error('Contest title is required');
      if (!selected.length) throw new Error('Select at least one problem');
      const startDate = new Date(startAt);
      if (Number.isNaN(startDate.getTime())) throw new Error('Start time is invalid');
      if (startDate.getTime() < Date.now()) throw new Error('Start time cannot be in the past');
      const parsedDuration = parseDuration();
      const freezeBefore = freezeEnabled ? Number(freezeBeforeMinutes) : 0;
      const freezeAfter = freezeEnabled && !manualUnfreeze ? Number(freezeAfterMinutes) : 0;
      if (!Number.isFinite(freezeBefore) || freezeBefore < 0) throw new Error('Freeze before minutes is invalid');
      if (!Number.isFinite(freezeAfter) || freezeAfter < 0) throw new Error('Auto unfreeze minutes is invalid');

      return api.post('/contests', {
        title: title.trim(),
        description: description.trim() || undefined,
        type,
        standingVisibility,
        startTime: startDate.toISOString(),
        durationHours: parsedDuration.hours,
        durationMinutes: parsedDuration.minutes,
        freezeEnabled,
        manualUnfreeze: freezeEnabled ? manualUnfreeze : false,
        freezeBeforeMinutes: freezeBefore,
        freezeAfterMinutes: freezeAfter,
        problems: selected.map((problem, index) => ({
          problemId: problem.problemId,
          label: problemLabel(index),
          orderIndex: index,
          score: type === 'score_based' ? (problem.score ?? 100) : undefined,
        })),
      });
    },
    onSuccess: (response) => {
      toast.success('Contest created');
      qc.invalidateQueries({ queryKey: ['judge-contests'] });
      const routeId = response.data?.contestNumber ?? response.data?.id;
      navigate(routeId ? `/contests/${routeId}/status` : '/contests');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message ?? error?.message ?? 'Failed to create contest');
    },
  });

  const addProblem = (problem: ProblemItem) => {
    setSelected((prev) => [
      ...prev,
      {
        problemId: problem.id,
        problemCode: problem.problemCode,
        title: problem.title,
        score: 100,
      },
    ]);
  };

  const moveProblem = (dropIndex: number) => {
    if (dragIndex == null || dragIndex === dropIndex) return;
    setSelected((prev) => {
      const next = [...prev];
      const [item] = next.splice(dragIndex, 1);
      next.splice(dropIndex, 0, item);
      return next;
    });
    setDragIndex(null);
  };

  const randomizeSelected = () => {
    setSelected((prev) => {
      const next = [...prev];
      for (let index = next.length - 1; index > 0; index -= 1) {
        const randomIndex = Math.floor(Math.random() * (index + 1));
        [next[index], next[randomIndex]] = [next[randomIndex], next[index]];
      }
      return next;
    });
  };

  return (
    <AppShell>
      <div className="oj-page space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Link to="/contests" className="mb-2 inline-flex items-center gap-1 text-sm font-bold text-slate-500 hover:text-teal-700">
              <ArrowLeft size={15} />
              Back to contests
            </Link>
            <h1 className="text-2xl font-extrabold text-slate-950">Create Contest</h1>
            <p className="text-sm font-semibold text-slate-500">Clean setup, searchable problem bank, and drag-to-order problem list.</p>
          </div>
          <button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            className="oj-btn-primary disabled:opacity-50"
          >
            {createMutation.isPending ? 'Creating...' : 'Create Contest'}
          </button>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-extrabold text-slate-950">Contest Details</h2>
            <div className="mt-4 grid gap-4">
              <label>
                <span className="mb-1 block text-sm font-bold text-slate-700">Title</span>
                <input value={title} onChange={(event) => setTitle(event.target.value)} className="oj-input" />
              </label>

              <label>
                <span className="mb-1 block text-sm font-bold text-slate-700">Description</span>
                <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} className="oj-textarea resize-none" />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="mb-1 block text-sm font-bold text-slate-700">Type</span>
                  <select value={type} onChange={(event) => setType(event.target.value as 'icpc' | 'score_based')} className="oj-select">
                    <option value="icpc">ICPC</option>
                    <option value="score_based">Score Based</option>
                  </select>
                </label>
                <label>
                  <span className="mb-1 block text-sm font-bold text-slate-700">Standing Visibility</span>
                  <select value={standingVisibility} onChange={(event) => setStandingVisibility(event.target.value as 'private' | 'public')} className="oj-select">
                    <option value="private">Private</option>
                    <option value="public">Public</option>
                  </select>
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="mb-1 block text-sm font-bold text-slate-700">Start Time</span>
                  <input type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} className="oj-input" />
                </label>
                <label>
                  <span className="mb-1 block text-sm font-bold text-slate-700">Duration</span>
                  <input value={duration} onChange={(event) => setDuration(event.target.value)} placeholder="05:00" className="oj-input" />
                </label>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-white">
                      <Snowflake size={18} />
                    </span>
                    <div>
                      <p className="text-sm font-extrabold text-slate-900">Standing Freeze</p>
                      <p className="text-xs font-semibold text-slate-500">{freezeEnabled ? 'Freeze window configured' : 'Live standings until contest end'}</p>
                    </div>
                  </div>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-extrabold text-slate-700">
                    <input type="checkbox" checked={freezeEnabled} onChange={(event) => setFreezeEnabled(event.target.checked)} />
                    Enable freeze
                  </label>
                </div>
                {freezeEnabled && (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <span className="mb-1 block text-xs font-extrabold uppercase tracking-wide text-slate-500">Freeze before end</span>
                      <input value={freezeBeforeMinutes} onChange={(event) => setFreezeBeforeMinutes(event.target.value)} className="oj-input" />
                      <span className="mt-1 block text-[11px] font-semibold text-slate-500">minutes</span>
                    </label>
                    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-700">
                      <span>
                        <span className="block text-sm font-extrabold text-slate-900">Manual unfreeze</span>
                        <span className="block text-xs font-semibold text-slate-500">Judge releases final standings</span>
                      </span>
                      <input type="checkbox" checked={manualUnfreeze} onChange={(event) => setManualUnfreeze(event.target.checked)} />
                    </label>
                    {!manualUnfreeze && (
                      <label className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
                        <span className="mb-1 block text-xs font-extrabold uppercase tracking-wide text-slate-500">Auto unfreeze after end</span>
                        <input value={freezeAfterMinutes} onChange={(event) => setFreezeAfterMinutes(event.target.value)} className="oj-input" />
                        <span className="mt-1 block text-[11px] font-semibold text-slate-500">minutes</span>
                      </label>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-extrabold text-slate-950">Problem Bank</h2>
            <label className="relative mt-4 block">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search problems"
                className="oj-input"
                style={{ paddingLeft: '2.6rem' }}
              />
            </label>
            <div className="mt-3 max-h-[540px] space-y-2 overflow-auto pr-1 oj-scrollbar">
              {filteredProblems.map((problem) => (
                <button
                  key={problem.id}
                  type="button"
                  onClick={() => addProblem(problem)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left hover:border-teal-300 hover:bg-teal-50"
                >
                  <span>
                    <span className="block text-sm font-extrabold text-slate-900">{problem.title}</span>
                    <span className="block text-xs font-semibold text-slate-500">{problem.problemCode ?? problem.id} · {problem.timeLimitMs ?? '—'}ms</span>
                  </span>
                  <Plus size={16} className="text-teal-700" />
                </button>
              ))}
              {!filteredProblems.length && (
                <p className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm font-semibold text-slate-400">No available problems.</p>
              )}
            </div>
          </section>
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold text-slate-950">Contest Problems</h2>
              <span className="text-sm font-bold text-slate-500">{selected.length} selected</span>
            </div>
            <button
              type="button"
              onClick={randomizeSelected}
              disabled={selected.length < 2}
              className="oj-btn-secondary px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Shuffle size={14} />
              Random Arrangement
            </button>
          </div>
          <div className="space-y-2">
            {selected.map((problem, index) => (
              <div
                key={problem.problemId}
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => moveProblem(index)}
                className="grid grid-cols-[auto_auto_1fr_auto_auto] items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2"
              >
                <GripVertical size={16} className="cursor-grab text-slate-400" />
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950 text-sm font-extrabold text-white">{problemLabel(index)}</span>
                <div>
                  <p className="text-sm font-extrabold text-slate-900">{problem.title}</p>
                  <p className="text-xs font-semibold text-slate-500">{problem.problemCode ?? problem.problemId}</p>
                </div>
                {type === 'score_based' && (
                  <input
                    type="number"
                    value={problem.score ?? 100}
                    onChange={(event) => {
                      const score = Number(event.target.value || 0);
                      setSelected((prev) => prev.map((item) => item.problemId === problem.problemId ? { ...item, score } : item));
                    }}
                    className="oj-input w-24 py-1 text-sm"
                  />
                )}
                <button
                  type="button"
                  onClick={() => setSelected((prev) => prev.filter((item) => item.problemId !== problem.problemId))}
                  className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
            {!selected.length && (
              <p className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm font-semibold text-slate-400">
                Add problems from the bank to build the contest.
              </p>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
