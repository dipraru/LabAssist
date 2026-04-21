import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  BookOpenCheck,
  CheckCircle2,
  CircleAlert,
  ClipboardCopy,
  Eye,
  FileInput,
  FileOutput,
  FileText,
  Gauge,
  HardDrive,
  Loader2,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { Modal } from '../../components/Modal';
import { ProblemContent } from '../../components/ProblemContent';
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

type TextCaseEditorProps = {
  id: string;
  label: string;
  value: string;
  icon: ReactNode;
  placeholder: string;
  onChange: (value: string) => void;
  onCopy: () => void;
};

type HiddenFilePickerProps = {
  id: string;
  label: string;
  fileName?: string;
  accept: string;
  badge: string;
  icon: ReactNode;
  onFileSelected: (file: File | null) => void;
};

type LimitFieldProps = {
  label: string;
  value: number;
  min: number;
  step: number;
  suffix: string;
  icon: ReactNode;
  onChange: (value: number) => void;
};

type ReviewItemProps = {
  label: string;
  value: string;
  ok: boolean;
};

const emptyCase = (): ProblemCase => ({
  input: '',
  output: '',
  note: '',
  noteFormat: 'text',
});

function normalizeContentFormat(format: unknown): ProblemContentFormat {
  return format === 'latex' ? 'latex' : 'text';
}

function hasText(value: string | undefined | null): boolean {
  return Boolean(value?.trim());
}

function sampleCaseHasAnyContent(testCase: ProblemCase): boolean {
  return (
    hasText(testCase.input) ||
    hasText(testCase.output) ||
    hasText(testCase.note)
  );
}

function sampleCaseIsComplete(testCase: ProblemCase): boolean {
  return hasText(testCase.input) && hasText(testCase.output);
}

function hiddenCaseHasAnyContent(testCase: ProblemCase): boolean {
  return (
    Boolean(testCase.inputFileName || testCase.outputFileName) ||
    hasText(testCase.input) ||
    hasText(testCase.output)
  );
}

function hiddenCaseIsComplete(testCase: ProblemCase): boolean {
  return (
    (Boolean(testCase.inputFileName) || hasText(testCase.input)) &&
    (Boolean(testCase.outputFileName) || hasText(testCase.output))
  );
}

async function readCaseFile(file: File, extensions: string[]) {
  const fileName = file.name.toLowerCase();
  if (!extensions.some((extension) => fileName.endsWith(extension))) {
    throw new Error(`Please select ${extensions.join(' or ')} file`);
  }
  return file.text();
}

function formatTimeLimitText(value: number) {
  if (!Number.isFinite(value) || value < 1) return '-';
  if (value % 1000 === 0) return `${value / 1000}s`;
  return `${value} ms`;
}

function formatMemoryLimitText(value: number) {
  if (!Number.isFinite(value) || value < 1) return '-';
  if (value % 1024 === 0) return `${value / 1024} MB`;
  return `${value} KB`;
}

function TextCaseEditor({
  id,
  label,
  value,
  icon,
  placeholder,
  onChange,
  onCopy,
}: TextCaseEditorProps) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label
          htmlFor={`${id}-text`}
          className="inline-flex items-center gap-2 text-xs font-extrabold uppercase text-slate-600"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-700">
            {icon}
          </span>
          {label}
        </label>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:border-teal-300 hover:text-teal-700"
        >
          <ClipboardCopy size={13} />
          Copy
        </button>
      </div>

      <textarea
        id={`${id}-text`}
        rows={7}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-h-40 w-full resize-y rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-mono leading-6 text-slate-900 outline-none focus:border-teal-500 focus:bg-white"
      />
    </div>
  );
}

function HiddenFilePicker({
  id,
  label,
  fileName,
  accept,
  badge,
  icon,
  onFileSelected,
}: HiddenFilePickerProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-xs font-extrabold uppercase text-slate-600">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 text-slate-700">
            {icon}
          </span>
          {label}
        </span>
        <span className="rounded-md bg-slate-100 px-2.5 py-1.5 text-xs font-extrabold uppercase text-slate-500">
          {badge}
        </span>
      </div>

      <div className="mt-4 flex min-w-0 flex-wrap items-center gap-2">
        <label
          htmlFor={id}
          className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-extrabold text-teal-800 hover:bg-teal-100"
        >
          <Upload size={15} />
          Choose File
        </label>
        <input
          id={id}
          type="file"
          accept={accept}
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            onFileSelected(file);
            event.currentTarget.value = '';
          }}
          className="sr-only"
        />
        <span
          className={`min-w-0 max-w-full truncate rounded-md px-2.5 py-2 text-xs font-semibold ${
            fileName
              ? 'bg-emerald-50 text-emerald-800'
              : 'bg-slate-100 text-slate-500'
          }`}
        >
          {fileName ?? 'No file selected'}
        </span>
      </div>
    </div>
  );
}

function LimitField({
  label,
  value,
  min,
  step,
  suffix,
  icon,
  onChange,
}: LimitFieldProps) {
  return (
    <label className="block rounded-lg border border-slate-200 bg-white p-4">
      <span className="flex items-center gap-2 text-xs font-extrabold uppercase text-slate-600">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 text-slate-700">
          {icon}
        </span>
        {label}
      </span>
      <span className="mt-3 flex items-center gap-2">
        <input
          type="number"
          min={min}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value || 0))}
          className="oj-input h-11 flex-1 text-base font-extrabold"
        />
        <span className="rounded-md bg-slate-100 px-2.5 py-2 text-xs font-extrabold uppercase text-slate-500">
          {suffix}
        </span>
      </span>
    </label>
  );
}

function ReviewItem({ label, value, ok }: ReviewItemProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-extrabold text-slate-800">
          {label}
        </p>
        <p className="truncate text-xs font-semibold text-slate-500">{value}</p>
      </div>
      {ok ? (
        <CheckCircle2 className="shrink-0 text-emerald-600" size={18} />
      ) : (
        <CircleAlert className="shrink-0 text-amber-600" size={18} />
      )}
    </div>
  );
}

export function JudgeProblemEditor() {
  const { problemId } = useParams<{ problemId: string }>();
  const isEditing = Boolean(problemId);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [title, setTitle] = useState('');
  const [statement, setStatement] = useState('');
  const [statementFormat, setStatementFormat] =
    useState<ProblemContentFormat>('text');
  const [inputDescription, setInputDescription] = useState('');
  const [inputDescriptionFormat, setInputDescriptionFormat] =
    useState<ProblemContentFormat>('text');
  const [outputDescription, setOutputDescription] = useState('');
  const [outputDescriptionFormat, setOutputDescriptionFormat] =
    useState<ProblemContentFormat>('text');
  const [timeLimitMs, setTimeLimitMs] = useState(2000);
  const [memoryLimitKb, setMemoryLimitKb] = useState(262144);
  const [sampleCases, setSampleCases] = useState<ProblemCase[]>([emptyCase()]);
  const [hiddenCases, setHiddenCases] = useState<ProblemCase[]>([emptyCase()]);
  const [previewOpen, setPreviewOpen] = useState(false);

  const { data: existingProblem, isLoading } = useQuery({
    queryKey: ['judge-problem-detail', problemId],
    queryFn: () =>
      api
        .get(`/contests/problems/${problemId}`)
        .then((response) => response.data),
    enabled: !!problemId,
  });

  useEffect(() => {
    if (!existingProblem) return;
    setTitle(existingProblem.title ?? '');
    setStatement(existingProblem.statement ?? '');
    setStatementFormat(normalizeContentFormat(existingProblem.statementFormat));
    setInputDescription(existingProblem.inputDescription ?? '');
    setInputDescriptionFormat(
      normalizeContentFormat(existingProblem.inputDescriptionFormat),
    );
    setOutputDescription(existingProblem.outputDescription ?? '');
    setOutputDescriptionFormat(
      normalizeContentFormat(existingProblem.outputDescriptionFormat),
    );
    setTimeLimitMs(existingProblem.timeLimitMs ?? 2000);
    setMemoryLimitKb(existingProblem.memoryLimitKb ?? 262144);
    setSampleCases(
      existingProblem.sampleTestCases?.length
        ? existingProblem.sampleTestCases.map((sampleCase: ProblemCase) => ({
            ...sampleCase,
            note: sampleCase.note ?? '',
            noteFormat: normalizeContentFormat(sampleCase.noteFormat),
          }))
        : [emptyCase()],
    );
    setHiddenCases(
      existingProblem.hiddenTestCases?.length
        ? existingProblem.hiddenTestCases
        : [emptyCase()],
    );
  }, [existingProblem]);

  const sampleRowsToSave = useMemo(
    () =>
      sampleCases
        .map((sampleCase) => ({
          input: sampleCase.input,
          output: sampleCase.output,
          note: sampleCase.note?.trim() || undefined,
          noteFormat: normalizeContentFormat(sampleCase.noteFormat),
        }))
        .filter(sampleCaseHasAnyContent),
    [sampleCases],
  );

  const hiddenRowsToSave = useMemo(
    () =>
      hiddenCases
        .map((hiddenCase) => ({
          input: hiddenCase.input,
          output: hiddenCase.output,
          inputFileName: hiddenCase.inputFileName,
          outputFileName: hiddenCase.outputFileName,
        }))
        .filter(hiddenCaseHasAnyContent),
    [hiddenCases],
  );

  const sampleCompleteCount = sampleCases.filter(sampleCaseIsComplete).length;
  const hiddenCompleteCount = hiddenCases.filter(hiddenCaseIsComplete).length;

  const validationIssues = useMemo(() => {
    const issues: string[] = [];
    if (!title.trim()) issues.push('Title is required');
    if (!statement.trim()) issues.push('Problem statement is required');
    if (!Number.isFinite(timeLimitMs) || timeLimitMs < 1) {
      issues.push('Time limit must be greater than 0 ms');
    }
    if (!Number.isFinite(memoryLimitKb) || memoryLimitKb < 1) {
      issues.push('Memory limit must be greater than 0 KB');
    }

    sampleCases.forEach((sampleCase, index) => {
      if (
        sampleCaseHasAnyContent(sampleCase) &&
        !sampleCaseIsComplete(sampleCase)
      ) {
        issues.push(`Sample ${index + 1} needs both input and output`);
      }
    });

    hiddenCases.forEach((hiddenCase, index) => {
      if (
        hiddenCaseHasAnyContent(hiddenCase) &&
        !hiddenCaseIsComplete(hiddenCase)
      ) {
        issues.push(`Hidden ${index + 1} needs input and output files`);
      }
    });

    return issues;
  }, [hiddenCases, memoryLimitKb, sampleCases, statement, timeLimitMs, title]);

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
    setSampleCases((prev) =>
      prev.map((sampleCase, caseIndex) =>
        caseIndex === index ? { ...sampleCase, ...patch } : sampleCase,
      ),
    );
  };

  const setHiddenCaseAt = (index: number, patch: Partial<ProblemCase>) => {
    setHiddenCases((prev) =>
      prev.map((hiddenCase, caseIndex) =>
        caseIndex === index ? { ...hiddenCase, ...patch } : hiddenCase,
      ),
    );
  };

  const onHiddenFileSelected = async (
    index: number,
    kind: 'input' | 'output',
    file: File | null,
  ) => {
    if (!file) return;
    try {
      const extensions = kind === 'input' ? ['.in', '.txt'] : ['.out', '.txt'];
      const content = await readCaseFile(file, extensions);
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
      if (validationIssues.length) {
        throw new Error(validationIssues[0]);
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
      toast.error(
        error?.response?.data?.message ??
          error?.message ??
          'Failed to save problem',
      );
    },
  });

  const saveDisabled = validationIssues.length > 0 || saveMutation.isPending;
  const problemCode = existingProblem?.problemCode ?? 'Draft';
  const previewTitle = title.trim() || 'Untitled Problem';
  const previewSamples = sampleRowsToSave.filter(sampleCaseIsComplete);

  return (
    <AppShell fullWidth mainClassName="bg-slate-100/70">
      <div className="mx-auto max-w-[1440px] space-y-5">
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
            <Link
              to="/problems"
              className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-extrabold text-slate-700 hover:border-teal-300 hover:text-teal-700"
            >
              <ArrowLeft size={16} />
              Problems
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/problems/latex-guide"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-extrabold text-teal-800 hover:bg-teal-100"
              >
                <BookOpenCheck size={16} />
                LaTeX Guide
              </Link>
              <span className="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-extrabold uppercase text-slate-600">
                {problemCode}
              </span>
            </div>
          </div>

          <div className="grid gap-5 bg-slate-950 px-5 py-6 text-white lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <p className="text-xs font-extrabold uppercase text-teal-200">
                Judge Workspace
              </p>
              <h1 className="mt-2 truncate text-3xl font-extrabold tracking-tight sm:text-4xl">
                {isEditing ? 'Edit Problem' : 'Create Problem'}
              </h1>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:w-[520px]">
              <div className="rounded-lg border border-white/10 bg-white/10 p-3">
                <p className="text-xs font-bold uppercase text-slate-300">
                  Samples
                </p>
                <p className="mt-1 text-2xl font-extrabold">
                  {sampleCompleteCount}
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/10 p-3">
                <p className="text-xs font-bold uppercase text-slate-300">
                  Hidden
                </p>
                <p className="mt-1 text-2xl font-extrabold">
                  {hiddenCompleteCount}
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/10 p-3">
                <p className="text-xs font-bold uppercase text-slate-300">
                  Time
                </p>
                <p className="mt-1 flex items-baseline gap-1 text-2xl font-extrabold">
                  {timeLimitMs}
                  <span className="text-xs font-bold uppercase text-slate-300">
                    ms
                  </span>
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/10 p-3">
                <p className="text-xs font-bold uppercase text-slate-300">
                  Memory
                </p>
                <p className="mt-1 flex items-baseline gap-1 text-2xl font-extrabold">
                  {Math.round(memoryLimitKb / 1024)}
                  <span className="text-xs font-bold uppercase text-slate-300">
                    MB
                  </span>
                </p>
              </div>
            </div>
          </div>
        </section>

        {isEditing && isLoading ? (
          <section className="flex min-h-64 items-center justify-center rounded-lg border border-slate-200 bg-white p-8 text-sm font-bold text-slate-500">
            <Loader2 className="mr-2 animate-spin" size={18} />
            Loading problem
          </section>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              saveMutation.mutate();
            }}
            className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]"
          >
            <div className="min-w-0 space-y-5">
              <section className="rounded-lg border border-slate-200 bg-white p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="inline-flex items-center gap-2 text-base font-extrabold text-slate-900">
                    <FileText className="text-teal-700" size={18} />
                    Problem Brief
                  </h2>
                </div>

                <label className="block">
                  <span className="text-xs font-extrabold uppercase text-slate-600">
                    Title
                  </span>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="A concise problem name"
                    className="oj-input mt-2 h-12 text-lg font-extrabold"
                  />
                </label>

                <ProblemContentField
                  label="Problem Statement"
                  value={statement}
                  onChange={setStatement}
                  format={statementFormat}
                  onFormatChange={setStatementFormat}
                  rows={13}
                  className="mt-5"
                  textareaClassName="min-h-80 resize-y bg-slate-50 leading-6 focus:bg-white"
                />

                <div className="mt-5 grid gap-4 xl:grid-cols-2">
                  <ProblemContentField
                    label="Input"
                    value={inputDescription}
                    onChange={setInputDescription}
                    format={inputDescriptionFormat}
                    onFormatChange={setInputDescriptionFormat}
                    rows={5}
                    placeholder="Input format and constraints"
                    textareaClassName="min-h-36 resize-y bg-slate-50 leading-6 focus:bg-white"
                  />

                  <ProblemContentField
                    label="Output"
                    value={outputDescription}
                    onChange={setOutputDescription}
                    format={outputDescriptionFormat}
                    onFormatChange={setOutputDescriptionFormat}
                    rows={5}
                    placeholder="Output format and requirements"
                    textareaClassName="min-h-36 resize-y bg-slate-50 leading-6 focus:bg-white"
                  />
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-5">
                <div className="mb-4 flex items-center gap-2">
                  <Gauge className="text-teal-700" size={18} />
                  <h2 className="text-base font-extrabold text-slate-900">
                    Judge Limits
                  </h2>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <LimitField
                    label="Time Limit"
                    value={timeLimitMs}
                    min={1}
                    step={1}
                    suffix="ms"
                    icon={<Gauge size={16} />}
                    onChange={setTimeLimitMs}
                  />
                  <LimitField
                    label="Memory Limit"
                    value={memoryLimitKb}
                    min={1}
                    step={1}
                    suffix="KB"
                    icon={<HardDrive size={16} />}
                    onChange={setMemoryLimitKb}
                  />
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="inline-flex items-center gap-2 text-base font-extrabold text-slate-900">
                    <FileInput className="text-teal-700" size={18} />
                    Sample Cases
                  </h2>
                  <button
                    type="button"
                    onClick={() =>
                      setSampleCases((prev) => [...prev, emptyCase()])
                    }
                    className="inline-flex items-center gap-2 rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-extrabold text-teal-800 hover:bg-teal-100"
                  >
                    <Plus size={16} />
                    Add Sample
                  </button>
                </div>

                {sampleCases.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                    <p className="text-sm font-bold text-slate-600">
                      No sample cases yet
                    </p>
                    <button
                      type="button"
                      onClick={() => setSampleCases([emptyCase()])}
                      className="mt-3 inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-extrabold text-slate-700 hover:border-teal-300 hover:text-teal-700"
                    >
                      <Plus size={16} />
                      Add Sample
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {sampleCases.map((sampleCase, index) => (
                      <div
                        key={`sample-${index}`}
                        className="rounded-lg border border-slate-200 bg-slate-50 p-4"
                      >
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-extrabold text-slate-900">
                              Sample {index + 1}
                            </p>
                            <p className="text-xs font-semibold text-slate-500">
                              {sampleCaseIsComplete(sampleCase)
                                ? 'Complete'
                                : sampleCaseHasAnyContent(sampleCase)
                                  ? 'Needs input and output'
                                  : 'Empty'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setSampleCases((prev) =>
                                prev.filter(
                                  (_, caseIndex) => caseIndex !== index,
                                ),
                              )
                            }
                            className="inline-flex items-center gap-2 rounded-md border border-rose-200 bg-white px-3 py-2 text-sm font-extrabold text-rose-700 hover:bg-rose-50"
                          >
                            <Trash2 size={16} />
                            Delete
                          </button>
                        </div>

                        <div className="grid gap-4 xl:grid-cols-2">
                          <TextCaseEditor
                            id={`sample-${index}-input`}
                            label="Input"
                            value={sampleCase.input}
                            icon={<FileInput size={15} />}
                            placeholder="Sample input"
                            onChange={(value) =>
                              setSampleCaseAt(index, { input: value })
                            }
                            onCopy={() =>
                              void copyText(
                                sampleCase.input,
                                `Sample ${index + 1} input`,
                              )
                            }
                          />

                          <TextCaseEditor
                            id={`sample-${index}-output`}
                            label="Output"
                            value={sampleCase.output}
                            icon={<FileOutput size={15} />}
                            placeholder="Sample output"
                            onChange={(value) =>
                              setSampleCaseAt(index, { output: value })
                            }
                            onCopy={() =>
                              void copyText(
                                sampleCase.output,
                                `Sample ${index + 1} output`,
                              )
                            }
                          />
                        </div>

                        <ProblemContentField
                          label="Note"
                          value={sampleCase.note ?? ''}
                          onChange={(value) =>
                            setSampleCaseAt(index, { note: value })
                          }
                          format={normalizeContentFormat(sampleCase.noteFormat)}
                          onFormatChange={(format) =>
                            setSampleCaseAt(index, { noteFormat: format })
                          }
                          rows={3}
                          placeholder="Sample note"
                          className="mt-4"
                          textareaClassName="min-h-28 resize-y bg-white leading-6"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="inline-flex items-center gap-2 text-base font-extrabold text-slate-900">
                    <ShieldCheck className="text-teal-700" size={18} />
                    Hidden Cases
                  </h2>
                  <button
                    type="button"
                    onClick={() =>
                      setHiddenCases((prev) => [...prev, emptyCase()])
                    }
                    className="inline-flex items-center gap-2 rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-extrabold text-teal-800 hover:bg-teal-100"
                  >
                    <Plus size={16} />
                    Add Hidden
                  </button>
                </div>

                {hiddenCases.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                    <p className="text-sm font-bold text-slate-600">
                      No hidden cases yet
                    </p>
                    <button
                      type="button"
                      onClick={() => setHiddenCases([emptyCase()])}
                      className="mt-3 inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-extrabold text-slate-700 hover:border-teal-300 hover:text-teal-700"
                    >
                      <Plus size={16} />
                      Add Hidden
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {hiddenCases.map((hiddenCase, index) => (
                      <div
                        key={`hidden-${index}`}
                        className="rounded-lg border border-slate-200 bg-slate-50 p-4"
                      >
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-extrabold text-slate-900">
                              Hidden {index + 1}
                            </p>
                            <p className="text-xs font-semibold text-slate-500">
                              {hiddenCaseIsComplete(hiddenCase)
                                ? 'Complete'
                                : hiddenCaseHasAnyContent(hiddenCase)
                                  ? 'Needs input and output files'
                                  : 'Empty'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setHiddenCases((prev) =>
                                prev.filter(
                                  (_, caseIndex) => caseIndex !== index,
                                ),
                              )
                            }
                            className="inline-flex items-center gap-2 rounded-md border border-rose-200 bg-white px-3 py-2 text-sm font-extrabold text-rose-700 hover:bg-rose-50"
                          >
                            <Trash2 size={16} />
                            Delete
                          </button>
                        </div>

                        <div className="grid gap-4 xl:grid-cols-2">
                          <HiddenFilePicker
                            id={`hidden-${index}-input`}
                            label="Input File"
                            fileName={
                              hiddenCase.inputFileName ??
                              (hasText(hiddenCase.input)
                                ? 'Stored input'
                                : undefined)
                            }
                            accept=".in,.txt,text/plain"
                            badge=".in / .txt"
                            icon={<FileInput size={15} />}
                            onFileSelected={(file) =>
                              void onHiddenFileSelected(index, 'input', file)
                            }
                          />

                          <HiddenFilePicker
                            id={`hidden-${index}-output`}
                            label="Output File"
                            fileName={
                              hiddenCase.outputFileName ??
                              (hasText(hiddenCase.output)
                                ? 'Stored output'
                                : undefined)
                            }
                            accept=".out,.txt,text/plain"
                            badge=".out / .txt"
                            icon={<FileOutput size={15} />}
                            onFileSelected={(file) =>
                              void onHiddenFileSelected(index, 'output', file)
                            }
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
              <section className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="mb-3 flex items-center gap-2">
                  <ShieldCheck className="text-teal-700" size={18} />
                  <h2 className="text-base font-extrabold text-slate-900">
                    Review
                  </h2>
                </div>
                <div className="space-y-2">
                  <ReviewItem
                    label="Title"
                    value={title.trim() || 'Missing'}
                    ok={hasText(title)}
                  />
                  <ReviewItem
                    label="Statement"
                    value={`${statement.trim().length} characters`}
                    ok={hasText(statement)}
                  />
                  <ReviewItem
                    label="Samples"
                    value={`${sampleCompleteCount} complete`}
                    ok={
                      !sampleCases.some(
                        (sampleCase) =>
                          sampleCaseHasAnyContent(sampleCase) &&
                          !sampleCaseIsComplete(sampleCase),
                      )
                    }
                  />
                  <ReviewItem
                    label="Hidden"
                    value={`${hiddenCompleteCount} complete`}
                    ok={
                      !hiddenCases.some(
                        (hiddenCase) =>
                          hiddenCaseHasAnyContent(hiddenCase) &&
                          !hiddenCaseIsComplete(hiddenCase),
                      )
                    }
                  />
                </div>
              </section>

              <section
                className={`rounded-lg border p-4 ${
                  validationIssues.length
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-emerald-200 bg-emerald-50'
                }`}
              >
                <div className="flex items-start gap-3">
                  {validationIssues.length ? (
                    <CircleAlert className="mt-0.5 text-amber-700" size={18} />
                  ) : (
                    <CheckCircle2
                      className="mt-0.5 text-emerald-700"
                      size={18}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-extrabold ${
                        validationIssues.length
                          ? 'text-amber-900'
                          : 'text-emerald-900'
                      }`}
                    >
                      {validationIssues.length ? 'Needs Attention' : 'Ready'}
                    </p>
                    {validationIssues.length ? (
                      <ul className="mt-2 space-y-1 text-xs font-semibold text-amber-900">
                        {validationIssues.slice(0, 5).map((issue) => (
                          <li key={issue}>{issue}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-xs font-semibold text-emerald-900">
                        All required fields are complete
                      </p>
                    )}
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-3">
                <button
                  type="button"
                  onClick={() => setPreviewOpen(true)}
                  className="mb-2 inline-flex w-full items-center justify-center gap-2 rounded-md border border-teal-200 bg-teal-50 px-3 py-2.5 text-sm font-extrabold text-teal-800 hover:bg-teal-100"
                >
                  <Eye size={16} />
                  Preview
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    to="/problems"
                    className="inline-flex items-center justify-center rounded-md border border-slate-300 px-3 py-2.5 text-sm font-extrabold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </Link>
                  <button
                    type="submit"
                    disabled={saveDisabled}
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-teal-700 px-3 py-2.5 text-sm font-extrabold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saveMutation.isPending ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : (
                      <Save size={16} />
                    )}
                    {saveMutation.isPending
                      ? 'Saving...'
                      : isEditing
                        ? 'Save'
                        : 'Create'}
                  </button>
                </div>
              </section>
            </aside>
          </form>
        )}

        <Modal
          open={previewOpen}
          title="Participant Preview"
          onClose={() => setPreviewOpen(false)}
          maxWidthClass="max-w-5xl"
        >
          <article className="space-y-7 text-[15px] leading-7 text-slate-700">
            <header className="border-b border-slate-200 pb-5">
              <p className="text-xs font-extrabold uppercase text-teal-700">
                {problemCode}
              </p>
              <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950">
                {previewTitle}
              </h1>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-3 py-1.5 text-sm font-extrabold text-slate-700">
                  <Gauge size={15} />
                  {formatTimeLimitText(timeLimitMs)}
                </span>
                <span className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-3 py-1.5 text-sm font-extrabold text-slate-700">
                  <HardDrive size={15} />
                  {formatMemoryLimitText(memoryLimitKb)}
                </span>
              </div>
            </header>

            <section>
              <ProblemContent value={statement} format={statementFormat} />
            </section>

            {inputDescription.trim() && (
              <section>
                <h2 className="mb-2 text-xl font-extrabold text-slate-900">
                  Input Format
                </h2>
                <ProblemContent
                  value={inputDescription}
                  format={inputDescriptionFormat}
                />
              </section>
            )}

            {outputDescription.trim() && (
              <section>
                <h2 className="mb-2 text-xl font-extrabold text-slate-900">
                  Output Format
                </h2>
                <ProblemContent
                  value={outputDescription}
                  format={outputDescriptionFormat}
                />
              </section>
            )}

            {previewSamples.length > 0 && (
              <section>
                <h2 className="mb-3 text-xl font-extrabold text-slate-900">
                  Sample {previewSamples.length > 1 ? 'Cases' : 'Case'}
                </h2>
                <div className="space-y-5">
                  {previewSamples.map((sampleCase, index) => (
                    <div
                      key={`preview-sample-${index}`}
                      className="overflow-hidden rounded-lg border border-slate-200 bg-white"
                    >
                      <div className="grid border-b border-slate-200 bg-slate-50 text-sm font-bold text-slate-600 sm:grid-cols-2">
                        <div className="border-b border-slate-200 px-4 py-3 sm:border-b-0 sm:border-r">
                          Input
                        </div>
                        <div className="px-4 py-3">Output</div>
                      </div>
                      <div className="grid sm:grid-cols-2">
                        <pre className="min-h-28 overflow-auto whitespace-pre-wrap border-b border-slate-200 bg-slate-50 p-4 font-mono text-sm text-slate-800 sm:border-b-0 sm:border-r">
                          {sampleCase.input}
                        </pre>
                        <pre className="min-h-28 overflow-auto whitespace-pre-wrap bg-slate-50 p-4 font-mono text-sm text-slate-800">
                          {sampleCase.output}
                        </pre>
                      </div>
                      {sampleCase.note && (
                        <div className="border-t border-slate-200 px-4 py-3">
                          <p className="mb-1 text-sm font-extrabold text-slate-900">
                            Explanation
                          </p>
                          <ProblemContent
                            value={sampleCase.note}
                            format={sampleCase.noteFormat}
                            className="text-sm text-slate-700"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </article>
        </Modal>
      </div>
    </AppShell>
  );
}
