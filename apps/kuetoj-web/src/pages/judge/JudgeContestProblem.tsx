import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { Plus, Trash2 } from 'lucide-react';

type SampleCase = { input: string; output: string };

function formatRemainingTime(startTime?: string, endTime?: string) {
  if (!startTime || !endTime) return '00:00:00';
  const now = Date.now();
  const startMs = new Date(startTime).getTime();
  const endMs = new Date(endTime).getTime();

  let remainingSeconds = 0;
  if (now < startMs) remainingSeconds = Math.floor((startMs - now) / 1000);
  else if (now < endMs) remainingSeconds = Math.floor((endMs - now) / 1000);

  const hrs = Math.floor(remainingSeconds / 3600).toString().padStart(2, '0');
  const mins = Math.floor((remainingSeconds % 3600) / 60).toString().padStart(2, '0');
  const secs = Math.floor(remainingSeconds % 60).toString().padStart(2, '0');
  return `${hrs}:${mins}:${secs}`;
}

export function JudgeContestProblem() {
  const { id, problemId } = useParams<{ id: string; problemId: string }>();
  const qc = useQueryClient();

  const [remainingTime, setRemainingTime] = useState('00:00:00');
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [statement, setStatement] = useState('');
  const [timeLimitMs, setTimeLimitMs] = useState(2000);
  const [memoryLimitKb, setMemoryLimitKb] = useState(262144);
  const [sampleCases, setSampleCases] = useState<SampleCase[]>([{ input: '', output: '' }]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyBlock = async (text: string, label: string, key: string) => {
    if (!text) {
      toast.error(`No ${label} to copy`);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 1200);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Failed to copy ${label}`);
    }
  };

  const { data: contest } = useQuery({
    queryKey: ['contest', id],
    queryFn: () => api.get(`/contests/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  const cp = useMemo(() => {
    const contestProblems: any[] = contest?.problems ?? contest?.contestProblems ?? [];
    return contestProblems.find((contestProblem: any) => {
      const idMatch = contestProblem.problem?.id === problemId;
      const codeMatch = contestProblem.problem?.problemCode === problemId;
      return idMatch || codeMatch;
    });
  }, [contest, problemId]);

  const problem = cp?.problem;

  useEffect(() => {
    if (!contest?.startTime || !contest?.endTime) return;
    setRemainingTime(formatRemainingTime(contest.startTime, contest.endTime));
    const timer = window.setInterval(() => {
      setRemainingTime(formatRemainingTime(contest.startTime, contest.endTime));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [contest?.startTime, contest?.endTime]);

  const remainingLabel = useMemo(() => {
    if (!contest?.startTime || !contest?.endTime) return 'Ended';
    const now = Date.now();
    const startMs = new Date(contest.startTime).getTime();
    const endMs = new Date(contest.endTime).getTime();
    if (now > endMs) return 'Ended';
    const prefix = now < startMs ? 'Starts In' : 'Remaining';
    return `${prefix}: ${remainingTime}`;
  }, [contest?.startTime, contest?.endTime, remainingTime]);

  useEffect(() => {
    if (!problem) return;
    setTitle(problem.title ?? '');
    setStatement(problem.statement ?? '');
    setTimeLimitMs(problem.timeLimitMs ?? 2000);
    setMemoryLimitKb(problem.memoryLimitKb ?? 262144);
    setSampleCases(problem.sampleTestCases?.length ? problem.sampleTestCases : [{ input: '', output: '' }]);
  }, [problem]);

  const updateMutation = useMutation({
    mutationFn: () => api.patch(`/contests/problems/${problem?.id}`, {
      title,
      statement,
      timeLimitMs,
      memoryLimitKb,
      sampleTestCases: sampleCases,
    }),
    onSuccess: () => {
      toast.success('Problem updated');
      setIsEditing(false);
      qc.invalidateQueries({ queryKey: ['contest', id] });
      qc.invalidateQueries({ queryKey: ['judge-problems'] });
    },
    onError: (error: any) => toast.error(error.response?.data?.message ?? 'Failed to update problem'),
  });

  const updateSample = (index: number, key: 'input' | 'output', value: string) => {
    setSampleCases((prev) => prev.map((item, i) => (i === index ? { ...item, [key]: value } : item)));
  };

  if (!problem) {
    return (
      <AppShell>
        <div className="py-12 text-center text-slate-400">Problem unavailable.</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="w-full">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold text-slate-900">{contest?.title ?? 'Contest'}</h1>
          <p className="text-sm text-slate-500 mt-1">{contest?.type} · #{contest?.contestNumber ?? '—'}</p>
        </div>

        <div className="mb-6 overflow-x-auto">
          <div className="flex min-w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-2">
            <div className="flex flex-wrap gap-2">
              <Link to={`/contests/${id}/problems`} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white">Problems</Link>
              <Link to={`/contests/${id}/status`} className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">Status</Link>
              <Link to={`/contests/${id}/standings`} className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">Standings</Link>
              <Link to={`/contests/${id}/clarifications`} className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">Clarifications</Link>
              <Link to={`/contests/${id}/announcements`} className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">Announcements</Link>
            </div>
            <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">
              {remainingLabel}
            </div>
          </div>
        </div>

        <div className="mb-3 flex justify-end">
          {!isEditing ? (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Edit Problem
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => updateMutation.mutate()}
                disabled={updateMutation.isPending}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          {!isEditing ? (
            <>
              <div className="mb-4 flex items-start gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 font-bold text-indigo-700">
                  {cp?.label}
                </span>
                <div>
                  <h1 className="text-xl font-bold text-slate-900">{problem.title}</h1>
                  <p className="text-sm text-slate-500">Time: {problem.timeLimitMs}ms · Memory: {problem.memoryLimitKb}KB</p>
                </div>
              </div>

              <div className="prose prose-sm max-w-none text-slate-700">
                <pre className="whitespace-pre-wrap font-sans">{problem.statement}</pre>
              </div>

              {problem.inputDescription && (
                <div className="mt-5">
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-700">Input</h3>
                  <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-800 font-sans">{problem.inputDescription}</pre>
                </div>
              )}

              {problem.outputDescription && (
                <div className="mt-5">
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-700">Output</h3>
                  <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-800 font-sans">{problem.outputDescription}</pre>
                </div>
              )}

              {problem.sampleTestCases?.length > 0 && (
                <div className="mt-6">
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-700">Sample Test Cases</h3>
                  <div className="space-y-3">
                    {problem.sampleTestCases.map((tc: any, index: number) => (
                      <div key={index} className="rounded-lg border border-slate-200 p-3 space-y-3">
                        <p className="text-xs font-semibold text-slate-600">Sample #{index + 1}</p>
                        <div>
                          <div className="mb-1 flex items-center justify-between">
                            <p className="text-xs font-medium text-slate-500">Input {index + 1}</p>
                            <button
                              type="button"
                              onClick={() => void copyBlock(tc.input, `Sample ${index + 1} input`, `sample-${index}-input`)}
                              className="cursor-pointer rounded px-2 py-1 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-50 hover:text-indigo-700"
                            >
                              {copiedKey === `sample-${index}-input` ? 'Copied' : 'Copy'}
                            </button>
                          </div>
                          <pre className="overflow-auto rounded-lg bg-slate-50 p-3 font-mono text-sm text-slate-800 whitespace-pre-wrap">{tc.input}</pre>
                        </div>
                        <div>
                          <div className="mb-1 flex items-center justify-between">
                            <p className="text-xs font-medium text-slate-500">Output {index + 1}</p>
                            <button
                              type="button"
                              onClick={() => void copyBlock(tc.output, `Sample ${index + 1} output`, `sample-${index}-output`)}
                              className="cursor-pointer rounded px-2 py-1 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-50 hover:text-indigo-700"
                            >
                              {copiedKey === `sample-${index}-output` ? 'Copied' : 'Copy'}
                            </button>
                          </div>
                          <pre className="overflow-auto rounded-lg bg-slate-50 p-3 font-mono text-sm text-slate-800 whitespace-pre-wrap">{tc.output}</pre>
                        </div>
                        {(tc.note || tc.explanation) && (
                          <div>
                            <p className="mb-1 text-xs font-medium text-slate-500">Note</p>
                            <pre className="whitespace-pre-wrap rounded-lg bg-indigo-50 p-3 text-sm text-slate-700 font-sans">{tc.note ?? tc.explanation}</pre>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600">Title</label>
                <input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600">Statement</label>
                <textarea value={statement} onChange={(event) => setStatement(event.target.value)} rows={10} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm resize-none" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600">Time (ms)</label>
                  <input type="number" value={timeLimitMs} onChange={(event) => setTimeLimitMs(Number(event.target.value || 0))} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Memory (KB)</label>
                  <input type="number" value={memoryLimitKb} onChange={(event) => setMemoryLimitKb(Number(event.target.value || 0))} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-600">Sample Test Cases</label>
                  <button type="button" onClick={() => setSampleCases((prev) => [...prev, { input: '', output: '' }])} className="inline-flex items-center gap-1 text-xs text-indigo-600">
                    <Plus size={12} /> Add
                  </button>
                </div>
                <div className="space-y-2">
                  {sampleCases.map((sample, index) => (
                    <div key={index} className="grid grid-cols-2 gap-2">
                      <textarea rows={2} value={sample.input} onChange={(event) => updateSample(index, 'input', event.target.value)} placeholder="Input" className="rounded-md border border-slate-300 px-2 py-1 text-xs font-mono" />
                      <div className="relative">
                        <textarea rows={2} value={sample.output} onChange={(event) => updateSample(index, 'output', event.target.value)} placeholder="Output" className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs font-mono" />
                        {sampleCases.length > 1 && (
                          <button type="button" onClick={() => setSampleCases((prev) => prev.filter((_, i) => i !== index))} className="absolute right-1 top-1 text-red-500">
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

      </div>
    </AppShell>
  );
}
