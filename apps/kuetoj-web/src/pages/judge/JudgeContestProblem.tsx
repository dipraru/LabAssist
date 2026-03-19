import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { Copy, Plus, Trash2 } from 'lucide-react';

type ProblemCase = {
  input: string;
  output: string;
  note?: string;
  inputFileName?: string;
  outputFileName?: string;
};

const emptyCase = (): ProblemCase => ({ input: '', output: '', note: '' });

function normalizeProblemLabel(rawLabel: unknown, index: number): string {
  const label = typeof rawLabel === 'string' ? rawLabel.trim().toUpperCase() : '';
  if (label.length === 1 && /^[A-Z]$/.test(label)) return label;
  return String.fromCharCode(65 + index);
}

async function readTextFile(file: File, extension: '.in' | '.out') {
  if (!file.name.toLowerCase().endsWith(extension)) {
    throw new Error(`Please select a ${extension} file`);
  }
  return file.text();
}

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
  const [inputDescription, setInputDescription] = useState('');
  const [outputDescription, setOutputDescription] = useState('');
  const [timeLimitMs, setTimeLimitMs] = useState(2000);
  const [memoryLimitKb, setMemoryLimitKb] = useState(262144);
  const [sampleCases, setSampleCases] = useState<ProblemCase[]>([emptyCase()]);
  const [hiddenCases, setHiddenCases] = useState<ProblemCase[]>([emptyCase()]);
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

  const contestProblems = useMemo(
    () => [...(contest?.problems ?? contest?.contestProblems ?? [])]
      .sort((a: any, b: any) => (a?.orderIndex ?? 0) - (b?.orderIndex ?? 0)),
    [contest],
  );

  const cp = useMemo(() => {
    return contestProblems.find((contestProblem: any) => {
      const idMatch = contestProblem.problem?.id === problemId;
      const codeMatch = contestProblem.problem?.problemCode === problemId;
      return idMatch || codeMatch;
    });
  }, [contestProblems, problemId]);

  const problem = cp?.problem;
  const currentProblemIndex = contestProblems.findIndex((contestProblem: any) => contestProblem?.id === cp?.id);
  const currentProblemLabel = currentProblemIndex >= 0
    ? normalizeProblemLabel(cp?.label, currentProblemIndex)
    : '—';

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
    setInputDescription(problem.inputDescription ?? '');
    setOutputDescription(problem.outputDescription ?? '');
    setTimeLimitMs(problem.timeLimitMs ?? 2000);
    setMemoryLimitKb(problem.memoryLimitKb ?? 262144);
    setSampleCases(problem.sampleTestCases?.length ? problem.sampleTestCases : [emptyCase()]);
    setHiddenCases(problem.hiddenTestCases?.length ? problem.hiddenTestCases : [emptyCase()]);
  }, [problem]);

  const setSampleCaseAt = (index: number, patch: Partial<ProblemCase>) => {
    setSampleCases((prev) => prev.map((sampleCase, caseIndex) => (caseIndex === index ? { ...sampleCase, ...patch } : sampleCase)));
  };

  const setHiddenCaseAt = (index: number, patch: Partial<ProblemCase>) => {
    setHiddenCases((prev) => prev.map((hiddenCase, caseIndex) => (caseIndex === index ? { ...hiddenCase, ...patch } : hiddenCase)));
  };

  const onSampleFileSelected = async (index: number, kind: 'input' | 'output', file: File | null) => {
    if (!file) return;
    try {
      const extension = kind === 'input' ? '.in' : '.out';
      const content = await readTextFile(file, extension);
      if (kind === 'input') {
        setSampleCaseAt(index, { input: content, inputFileName: file.name });
      } else {
        setSampleCaseAt(index, { output: content, outputFileName: file.name });
      }
    } catch (error: any) {
      toast.error(error?.message ?? 'Failed to read file');
    }
  };

  const onHiddenFileSelected = async (index: number, kind: 'input' | 'output', file: File | null) => {
    if (!file) return;
    try {
      const extension = kind === 'input' ? '.in' : '.out';
      const content = await readTextFile(file, extension);
      if (kind === 'input') {
        setHiddenCaseAt(index, { input: content, inputFileName: file.name });
      } else {
        setHiddenCaseAt(index, { output: content, outputFileName: file.name });
      }
    } catch (error: any) {
      toast.error(error?.message ?? 'Failed to read file');
    }
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      const sampleRowsToSave = sampleCases
        .map((sampleCase) => ({
          input: sampleCase.input.trim(),
          output: sampleCase.output.trim(),
          note: sampleCase.note?.trim() || undefined,
        }))
        .filter((sampleCase) => sampleCase.input || sampleCase.output || sampleCase.note);

      const hiddenRowsToSave = hiddenCases
        .map((hiddenCase) => ({
          input: hiddenCase.input.trim(),
          output: hiddenCase.output.trim(),
        }))
        .filter((hiddenCase) => hiddenCase.input || hiddenCase.output);

      if (sampleRowsToSave.some((sampleCase) => !sampleCase.input || !sampleCase.output)) {
        throw new Error('Each sample test case must contain both input and output');
      }

      if (hiddenRowsToSave.some((hiddenCase) => !hiddenCase.input || !hiddenCase.output)) {
        throw new Error('Each hidden test case must contain both input and output');
      }

      return api.patch(`/contests/problems/${problem?.id}`, {
        title: title.trim(),
        statement: statement.trim(),
        inputDescription: inputDescription.trim() || undefined,
        outputDescription: outputDescription.trim() || undefined,
        timeLimitMs,
        memoryLimitKb,
        sampleTestCases: sampleRowsToSave,
        hiddenTestCases: hiddenRowsToSave,
      });
    },
    onSuccess: () => {
      toast.success('Problem updated');
      setIsEditing(false);
      qc.invalidateQueries({ queryKey: ['contest', id] });
      qc.invalidateQueries({ queryKey: ['judge-problems'] });
    },
    onError: (error: any) => toast.error(error.response?.data?.message ?? error.message ?? 'Failed to update problem'),
  });

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
                  {currentProblemLabel}
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
            <div className="space-y-4">
              <section className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-600">Title</label>
                  <input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-600">Problem Statement</label>
                  <textarea value={statement} onChange={(event) => setStatement(event.target.value)} rows={10} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm resize-none" />
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-600">Input</label>
                  <textarea
                    value={inputDescription}
                    onChange={(event) => setInputDescription(event.target.value)}
                    rows={4}
                    placeholder="Describe input format and constraints"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm resize-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-600">Output</label>
                  <textarea
                    value={outputDescription}
                    onChange={(event) => setOutputDescription(event.target.value)}
                    rows={4}
                    placeholder="Describe output format and requirements"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-600">Time Limit (ms)</label>
                    <input type="number" value={timeLimitMs} onChange={(event) => setTimeLimitMs(Number(event.target.value || 0))} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">Memory Limit (KB)</label>
                    <input type="number" value={memoryLimitKb} onChange={(event) => setMemoryLimitKb(Number(event.target.value || 0))} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-700">Sample Test Cases</h3>
                  <button type="button" onClick={() => setSampleCases((prev) => [...prev, emptyCase()])} className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100">
                    <Plus size={12} /> Add Sample
                  </button>
                </div>

                <div className="space-y-3">
                  {sampleCases.map((sample, index) => (
                    <div key={`sample-edit-${index}`} className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-slate-600">Sample #{index + 1}</p>
                        {sampleCases.length > 1 && (
                          <button type="button" onClick={() => setSampleCases((prev) => prev.filter((_, i) => i !== index))} className="inline-flex items-center gap-1 rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50">
                            <Trash2 size={12} /> Delete
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold text-slate-600">Input</p>
                            <button type="button" onClick={() => void copyBlock(sample.input, `Sample ${index + 1} input`, `edit-sample-${index}-input`)} className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700">
                              <Copy size={12} /> Copy
                            </button>
                          </div>
                          <input type="file" accept=".in,text/plain" onChange={(event) => { const file = event.target.files?.[0] ?? null; void onSampleFileSelected(index, 'input', file); }} className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs" />
                          {sample.inputFileName && <p className="text-[11px] text-slate-500">Loaded file: {sample.inputFileName}</p>}
                          <textarea rows={4} value={sample.input} onChange={(event) => setSampleCaseAt(index, { input: event.target.value })} placeholder="Input" className="w-full rounded-md border border-slate-300 px-2 py-2 text-xs font-mono" />
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold text-slate-600">Output</p>
                            <button type="button" onClick={() => void copyBlock(sample.output, `Sample ${index + 1} output`, `edit-sample-${index}-output`)} className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700">
                              <Copy size={12} /> Copy
                            </button>
                          </div>
                          <input type="file" accept=".out,text/plain" onChange={(event) => { const file = event.target.files?.[0] ?? null; void onSampleFileSelected(index, 'output', file); }} className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs" />
                          {sample.outputFileName && <p className="text-[11px] text-slate-500">Loaded file: {sample.outputFileName}</p>}
                          <textarea rows={4} value={sample.output} onChange={(event) => setSampleCaseAt(index, { output: event.target.value })} placeholder="Output" className="w-full rounded-md border border-slate-300 px-2 py-2 text-xs font-mono" />
                        </div>
                      </div>

                      <textarea
                        rows={2}
                        value={sample.note ?? ''}
                        onChange={(event) => setSampleCaseAt(index, { note: event.target.value })}
                        placeholder="Note (optional)"
                        className="w-full rounded-md border border-slate-300 px-2 py-2 text-xs"
                      />
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-700">Hidden Test Cases</h3>
                  <button type="button" onClick={() => setHiddenCases((prev) => [...prev, emptyCase()])} className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100">
                    <Plus size={12} /> Add Hidden
                  </button>
                </div>

                <div className="space-y-3">
                  {hiddenCases.map((hiddenCase, index) => (
                    <div key={`hidden-edit-${index}`} className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-slate-600">Hidden #{index + 1}</p>
                        {hiddenCases.length > 1 && (
                          <button type="button" onClick={() => setHiddenCases((prev) => prev.filter((_, i) => i !== index))} className="inline-flex items-center gap-1 rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50">
                            <Trash2 size={12} /> Delete
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-slate-600">Input</p>
                          <input type="file" accept=".in,text/plain" onChange={(event) => { const file = event.target.files?.[0] ?? null; void onHiddenFileSelected(index, 'input', file); }} className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs" />
                          {hiddenCase.inputFileName && <p className="text-[11px] text-slate-500">Loaded file: {hiddenCase.inputFileName}</p>}
                          <textarea rows={4} value={hiddenCase.input} onChange={(event) => setHiddenCaseAt(index, { input: event.target.value })} placeholder="Hidden input" className="w-full rounded-md border border-slate-300 px-2 py-2 text-xs font-mono" />
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-slate-600">Output</p>
                          <input type="file" accept=".out,text/plain" onChange={(event) => { const file = event.target.files?.[0] ?? null; void onHiddenFileSelected(index, 'output', file); }} className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs" />
                          {hiddenCase.outputFileName && <p className="text-[11px] text-slate-500">Loaded file: {hiddenCase.outputFileName}</p>}
                          <textarea rows={4} value={hiddenCase.output} onChange={(event) => setHiddenCaseAt(index, { output: event.target.value })} placeholder="Hidden output" className="w-full rounded-md border border-slate-300 px-2 py-2 text-xs font-mono" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>

      </div>
    </AppShell>
  );
}
