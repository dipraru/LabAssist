import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Trash2, Copy } from 'lucide-react';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { ProblemContentField } from '../../components/ProblemContentField';
import type { ProblemContentFormat } from '../../components/ProblemContent';

type ProblemCase = {
  input: string;
  output: string;
  note?: string;
  noteFormat?: ProblemContentFormat;
  inputFileName?: string;
  outputFileName?: string;
};

const emptyCase = (): ProblemCase => ({ input: '', output: '', note: '', noteFormat: 'text' });

function normalizeContentFormat(format: unknown): ProblemContentFormat {
  return format === 'latex' ? 'latex' : 'text';
}

async function readTextFile(file: File, extension: '.in' | '.out') {
  if (!file.name.toLowerCase().endsWith(extension)) {
    throw new Error(`Please select a ${extension} file`);
  }
  return file.text();
}

export function JudgeProblemEditor() {
  const { problemId } = useParams<{ problemId: string }>();
  const isEditing = Boolean(problemId);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [title, setTitle] = useState('');
  const [statement, setStatement] = useState('');
  const [statementFormat, setStatementFormat] = useState<ProblemContentFormat>('text');
  const [inputDescription, setInputDescription] = useState('');
  const [inputDescriptionFormat, setInputDescriptionFormat] = useState<ProblemContentFormat>('text');
  const [outputDescription, setOutputDescription] = useState('');
  const [outputDescriptionFormat, setOutputDescriptionFormat] = useState<ProblemContentFormat>('text');
  const [timeLimitMs, setTimeLimitMs] = useState(2000);
  const [memoryLimitKb, setMemoryLimitKb] = useState(262144);
  const [sampleCases, setSampleCases] = useState<ProblemCase[]>([emptyCase()]);
  const [hiddenCases, setHiddenCases] = useState<ProblemCase[]>([emptyCase()]);

  const { data: existingProblem, isLoading } = useQuery({
    queryKey: ['judge-problem-detail', problemId],
    queryFn: () => api.get(`/contests/problems/${problemId}`).then((response) => response.data),
    enabled: !!problemId,
  });

  useEffect(() => {
    if (!existingProblem) return;
    setTitle(existingProblem.title ?? '');
    setStatement(existingProblem.statement ?? '');
    setStatementFormat(normalizeContentFormat(existingProblem.statementFormat));
    setInputDescription(existingProblem.inputDescription ?? '');
    setInputDescriptionFormat(normalizeContentFormat(existingProblem.inputDescriptionFormat));
    setOutputDescription(existingProblem.outputDescription ?? '');
    setOutputDescriptionFormat(normalizeContentFormat(existingProblem.outputDescriptionFormat));
    setTimeLimitMs(existingProblem.timeLimitMs ?? 2000);
    setMemoryLimitKb(existingProblem.memoryLimitKb ?? 262144);
    setSampleCases(existingProblem.sampleTestCases?.length ? existingProblem.sampleTestCases : [emptyCase()]);
    setHiddenCases(existingProblem.hiddenTestCases?.length ? existingProblem.hiddenTestCases : [emptyCase()]);
  }, [existingProblem]);

  const normalizedSampleCases = useMemo(() => (
    sampleCases.map((sampleCase) => ({
      input: sampleCase.input.trim(),
      output: sampleCase.output.trim(),
      note: sampleCase.note?.trim() || undefined,
      noteFormat: normalizeContentFormat(sampleCase.noteFormat),
    }))
  ), [sampleCases]);

  const normalizedHiddenCases = useMemo(() => (
    hiddenCases.map((hiddenCase) => ({
      input: hiddenCase.input.trim(),
      output: hiddenCase.output.trim(),
      inputFileName: hiddenCase.inputFileName,
      outputFileName: hiddenCase.outputFileName,
    }))
  ), [hiddenCases]);

  const copyText = async (text: string, label: string) => {
    if (!text) {
      toast.error(`No ${label} to copy`);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Failed to copy ${label}`);
    }
  };

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

  const saveMutation = useMutation({
    mutationFn: async () => {
      const sampleRowsToSave = normalizedSampleCases.filter((sampleCase) => sampleCase.input || sampleCase.output || sampleCase.note);
      const hiddenRowsToSave = normalizedHiddenCases.filter((hiddenCase) => hiddenCase.input || hiddenCase.output);

      const partialSampleExists = sampleRowsToSave.some((sampleCase) => !sampleCase.input || !sampleCase.output);
      if (partialSampleExists) {
        throw new Error('Each sample test case must contain both input and output');
      }

      const partialHiddenExists = hiddenRowsToSave.some((hiddenCase) => !hiddenCase.input || !hiddenCase.output);
      if (partialHiddenExists) {
        throw new Error('Each hidden test case must contain both input and output');
      }

      const payload = {
        title: title.trim(),
        statement: statement.trim(),
        statementFormat,
        inputDescription: inputDescription.trim() || undefined,
        inputDescriptionFormat,
        outputDescription: outputDescription.trim() || undefined,
        outputDescriptionFormat,
        timeLimitMs,
        memoryLimitKb,
        sampleTestCases: sampleRowsToSave,
        hiddenTestCases: hiddenRowsToSave,
      };

      if (!payload.title) throw new Error('Title is required');
      if (!payload.statement) throw new Error('Statement is required');

      if (isEditing) {
        return api.patch(`/contests/problems/${problemId}`, payload);
      }
      return api.post('/contests/problems', payload);
    },
    onSuccess: () => {
      toast.success(isEditing ? 'Problem updated' : 'Problem created');
      qc.invalidateQueries({ queryKey: ['judge-problems'] });
      if (problemId) {
        qc.invalidateQueries({ queryKey: ['judge-problem-detail', problemId] });
      }
      navigate('/problems');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message ?? error?.message ?? 'Failed to save problem');
    },
  });

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{isEditing ? 'Edit Problem' : 'Create New Problem'}</h1>
            <p className="text-sm text-slate-500 mt-1">Configure statement, sample test cases, and hidden test cases.</p>
          </div>
          <Link
            to="/problems"
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Back to Problem List
          </Link>
        </section>

        {isEditing && isLoading ? (
          <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm text-sm text-slate-500">Loading problem...</section>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              saveMutation.mutate();
            }}
            className="space-y-4"
          >
            <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600">Title</label>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                />
              </div>

              <ProblemContentField
                label="Problem Statement"
                value={statement}
                onChange={setStatement}
                format={statementFormat}
                onFormatChange={setStatementFormat}
                rows={10}
                textareaClassName="resize-none"
              />

              <ProblemContentField
                label="Input"
                value={inputDescription}
                onChange={setInputDescription}
                format={inputDescriptionFormat}
                onFormatChange={setInputDescriptionFormat}
                rows={4}
                placeholder="Describe input format and constraints"
                textareaClassName="resize-none"
              />

              <ProblemContentField
                label="Output"
                value={outputDescription}
                onChange={setOutputDescription}
                format={outputDescriptionFormat}
                onFormatChange={setOutputDescriptionFormat}
                rows={4}
                placeholder="Describe output format and requirements"
                textareaClassName="resize-none"
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600">Time Limit (ms)</label>
                  <input
                    type="number"
                    value={timeLimitMs}
                    onChange={(event) => setTimeLimitMs(Number(event.target.value || 0))}
                    className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Memory Limit (KB)</label>
                  <input
                    type="number"
                    value={memoryLimitKb}
                    onChange={(event) => setMemoryLimitKb(Number(event.target.value || 0))}
                    className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </section>

            <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Sample Test Cases</h2>
                  <p className="mt-1 text-xs text-slate-500">Use file upload or paste text directly. Input and output are shown one after another.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSampleCases((prev) => [...prev, emptyCase()])}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                >
                  <Plus size={12} /> Add Sample
                </button>
              </div>

              {sampleCases.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                  <p className="text-sm text-slate-600">No sample test cases added.</p>
                  <button
                    type="button"
                    onClick={() => setSampleCases([emptyCase()])}
                    className="mt-3 inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    <Plus size={12} /> Add First Sample
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {sampleCases.map((sampleCase, index) => (
                    <div key={`sample-${index}`} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-700">Sample #{index + 1}</p>
                        <button
                          type="button"
                          onClick={() => setSampleCases((prev) => prev.filter((_, caseIndex) => caseIndex !== index))}
                          className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-white px-2.5 py-1.5 text-xs text-red-700 hover:bg-red-50"
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-slate-600">Input</p>
                          <button
                            type="button"
                            onClick={() => void copyText(sampleCase.input, `Sample ${index + 1} input`)}
                            className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700"
                          >
                            <Copy size={12} /> Copy
                          </button>
                        </div>
                        <input
                          type="file"
                          accept=".in,text/plain"
                          onChange={(event) => {
                            const file = event.target.files?.[0] ?? null;
                            void onSampleFileSelected(index, 'input', file);
                          }}
                          className="w-full border border-slate-300 rounded-md px-3 py-2 text-xs"
                        />
                        {sampleCase.inputFileName && (
                          <p className="text-xs text-slate-500">Loaded file: {sampleCase.inputFileName}</p>
                        )}
                        <textarea
                          rows={5}
                          value={sampleCase.input}
                          onChange={(event) => setSampleCaseAt(index, { input: event.target.value })}
                          placeholder="Paste or edit sample input text"
                          className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono resize-y"
                        />
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-slate-600">Output</p>
                          <button
                            type="button"
                            onClick={() => void copyText(sampleCase.output, `Sample ${index + 1} output`)}
                            className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700"
                          >
                            <Copy size={12} /> Copy
                          </button>
                        </div>
                        <input
                          type="file"
                          accept=".out,text/plain"
                          onChange={(event) => {
                            const file = event.target.files?.[0] ?? null;
                            void onSampleFileSelected(index, 'output', file);
                          }}
                          className="w-full border border-slate-300 rounded-md px-3 py-2 text-xs"
                        />
                        {sampleCase.outputFileName && (
                          <p className="text-xs text-slate-500">Loaded file: {sampleCase.outputFileName}</p>
                        )}
                        <textarea
                          rows={5}
                          value={sampleCase.output}
                          onChange={(event) => setSampleCaseAt(index, { output: event.target.value })}
                          placeholder="Paste or edit sample output text"
                          className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono resize-y"
                        />
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <ProblemContentField
                          label="Note (optional)"
                          value={sampleCase.note ?? ''}
                          onChange={(value) => setSampleCaseAt(index, { note: value })}
                          format={normalizeContentFormat(sampleCase.noteFormat)}
                          onFormatChange={(format) => setSampleCaseAt(index, { noteFormat: format })}
                          rows={3}
                          placeholder="Explain how the sample output is derived"
                          textareaClassName="resize-none"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Hidden Test Cases</h2>
                  <p className="mt-1 text-xs text-slate-500">These are private cases and will not appear in the statement. Upload files or paste text.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setHiddenCases((prev) => [...prev, emptyCase()])}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                >
                  <Plus size={12} /> Add Hidden Case
                </button>
              </div>

              {hiddenCases.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                  <p className="text-sm text-slate-600">No hidden test cases added.</p>
                  <button
                    type="button"
                    onClick={() => setHiddenCases([emptyCase()])}
                    className="mt-3 inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    <Plus size={12} /> Add First Hidden Case
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {hiddenCases.map((hiddenCase, index) => (
                    <div key={`hidden-${index}`} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-700">Hidden Case #{index + 1}</p>
                        <button
                          type="button"
                          onClick={() => setHiddenCases((prev) => prev.filter((_, caseIndex) => caseIndex !== index))}
                          className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-white px-2.5 py-1.5 text-xs text-red-700 hover:bg-red-50"
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>

                      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                          <p className="text-xs font-semibold text-slate-600">Input</p>
                          <input
                            type="file"
                            accept=".in,text/plain"
                            onChange={(event) => {
                              const file = event.target.files?.[0] ?? null;
                              void onHiddenFileSelected(index, 'input', file);
                            }}
                            className="w-full border border-slate-300 rounded-md px-3 py-2 text-xs"
                          />
                          {hiddenCase.inputFileName && (
                            <p className="text-xs text-slate-500">Loaded file: {hiddenCase.inputFileName}</p>
                          )}
                          <textarea
                            rows={5}
                            value={hiddenCase.input}
                            onChange={(event) => setHiddenCaseAt(index, { input: event.target.value })}
                            placeholder="Paste or edit hidden input text"
                            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono resize-y"
                          />
                        </div>

                        <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                          <p className="text-xs font-semibold text-slate-600">Output</p>
                          <input
                            type="file"
                            accept=".out,text/plain"
                            onChange={(event) => {
                              const file = event.target.files?.[0] ?? null;
                              void onHiddenFileSelected(index, 'output', file);
                            }}
                            className="w-full border border-slate-300 rounded-md px-3 py-2 text-xs"
                          />
                          {hiddenCase.outputFileName && (
                            <p className="text-xs text-slate-500">Loaded file: {hiddenCase.outputFileName}</p>
                          )}
                          <textarea
                            rows={5}
                            value={hiddenCase.output}
                            onChange={(event) => setHiddenCaseAt(index, { output: event.target.value })}
                            placeholder="Paste or edit hidden output text"
                            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono resize-y"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <div className="flex justify-end gap-2">
              <Link
                to="/problems"
                className="px-4 py-2 border border-slate-300 rounded-md text-sm text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={saveMutation.isPending}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-md text-sm font-medium"
              >
                {saveMutation.isPending ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Problem'}
              </button>
            </div>
          </form>
        )}
      </div>
    </AppShell>
  );
}
