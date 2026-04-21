import AceEditor from "react-ace";
import { Modal } from "./Modal";
import {
  getCodeViewerHeight,
  getEditorMode,
  isZipFileName,
  LAB_EDITOR_THEME,
} from "../lib/code-editor";

function humanize(value: string | null | undefined) {
  return `${value ?? ""}`
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";

  return new Intl.DateTimeFormat([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function verdictBadge(verdict: string | null | undefined) {
  switch (verdict) {
    case "accepted":
      return "bg-emerald-100 text-emerald-700";
    case "wrong_answer":
      return "bg-rose-100 text-rose-700";
    case "partial":
      return "bg-sky-100 text-sky-700";
    case "time_limit_exceeded":
    case "memory_limit_exceeded":
    case "runtime_error":
    case "compilation_error":
      return "bg-amber-100 text-amber-700";
    case "manual_review":
      return "bg-violet-100 text-violet-700";
    case "pending":
    case "judging":
      return "bg-sky-100 text-sky-700";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

function getEffectiveVerdict(submission: any) {
  if (submission?.manualVerdict && submission.manualVerdict !== "pending") {
    return submission.manualVerdict;
  }
  return submission?.submissionStatus ?? "pending";
}

function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}

function FeedbackCard({ label, body }: { label: string; body: string }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
        {body}
      </p>
    </div>
  );
}

export function LabSubmissionViewer({
  open,
  onClose,
  submission,
}: {
  open: boolean;
  onClose: () => void;
  submission: any | null;
}) {
  if (!submission) {
    return null;
  }

  const verdict = getEffectiveVerdict(submission);
  const testcaseResults = Array.isArray(submission.testcaseResults)
    ? submission.testcaseResults
    : [];
  const zipUpload = isZipFileName(submission.fileName);
  const studentLabel =
    submission.student?.fullName ??
    submission.student?.studentId ??
    submission.student?.user?.username ??
    null;
  const editorHeight = getCodeViewerHeight(submission.code);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Submission Details"
      maxWidthClass="max-w-6xl"
    >
      <div className="space-y-6">
        <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,#f8fafc_0%,#ffffff_100%)] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                Submission Overview
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-slate-900">
                {submission.problem?.title ?? "Lab Submission"}
              </h3>
              <p className="mt-2 text-sm text-slate-500">
                Submitted {formatDateTime(submission.submittedAt)}
                {studentLabel ? ` by ${studentLabel}` : ""}
              </p>
            </div>
            <span
              className={`inline-flex w-fit rounded-full px-3 py-1.5 text-xs font-semibold ${verdictBadge(
                verdict,
              )}`}
            >
              {humanize(verdict)}
            </span>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetaCard
              label="Language"
              value={
                submission.language
                  ? humanize(submission.language)
                  : "Not provided"
              }
            />
            <MetaCard label="Score" value={String(submission.score ?? "—")} />
            <MetaCard
              label="Execution Time"
              value={
                submission.executionTimeMs == null
                  ? "—"
                  : `${submission.executionTimeMs} ms`
              }
            />
            <MetaCard
              label="Memory Used"
              value={
                submission.memoryUsedKb == null
                  ? "—"
                  : `${submission.memoryUsedKb} KB`
              }
            />
          </div>
        </div>

        {submission.fileUrl ? (
          <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Uploaded File
            </p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {submission.fileName ?? "Uploaded source file"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {zipUpload
                    ? "This ZIP archive is stored for manual local review."
                    : "This submission was uploaded as a file."}
                </p>
              </div>
              <a
                href={submission.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                Download File
              </a>
            </div>
          </div>
        ) : null}

        {submission.judgeMessage ||
        submission.instructorNote ||
        submission.compileOutput ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {submission.judgeMessage ? (
              <FeedbackCard
                label="Judge Message"
                body={submission.judgeMessage}
              />
            ) : null}
            {submission.instructorNote ? (
              <FeedbackCard
                label="Instructor Note"
                body={submission.instructorNote}
              />
            ) : null}
            {submission.compileOutput ? (
              <div className="lg:col-span-2">
                <FeedbackCard
                  label="Compile Output"
                  body={submission.compileOutput}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {testcaseResults.length ? (
          <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Test Case Results
                </p>
                <h4 className="mt-2 text-lg font-semibold text-slate-900">
                  Verdict per case
                </h4>
              </div>
              <span className="text-sm text-slate-500">
                {testcaseResults.length} cases
              </span>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 font-semibold text-slate-700">
                      Case
                    </th>
                    <th className="px-3 py-2 font-semibold text-slate-700">
                      Type
                    </th>
                    <th className="px-3 py-2 font-semibold text-slate-700">
                      Verdict
                    </th>
                    <th className="px-3 py-2 font-semibold text-slate-700">
                      Time
                    </th>
                    <th className="px-3 py-2 font-semibold text-slate-700">
                      Memory
                    </th>
                    <th className="px-3 py-2 font-semibold text-slate-700">
                      Message
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {testcaseResults.map((testcase: any) => (
                    <tr
                      key={`${testcase.index}-${testcase.isSample ? "sample" : "hidden"}`}
                    >
                      <td className="px-3 py-2 text-slate-700">
                        #{testcase.index}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {testcase.isSample ? "Sample" : "Hidden"}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${verdictBadge(
                            testcase.verdict,
                          )}`}
                        >
                          {humanize(testcase.verdict)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {testcase.timeMs == null
                          ? "—"
                          : `${testcase.timeMs} ms`}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {testcase.memoryKb == null
                          ? "—"
                          : `${testcase.memoryKb} KB`}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {testcase.message?.trim() ? testcase.message : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        <div className="rounded-[24px] border border-slate-200 bg-slate-950 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                Source Code
              </p>
              <p className="mt-2 text-sm text-slate-400">
                Stored source for this submission.
              </p>
            </div>
            <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-medium text-slate-300">
              {submission.language ? humanize(submission.language) : "Source"}
            </span>
          </div>

          {submission.code?.trim() ? (
            <div className="mt-4 overflow-hidden rounded-2xl ring-1 ring-slate-800">
              <AceEditor
                mode={getEditorMode(submission.language)}
                theme={LAB_EDITOR_THEME}
                value={submission.code}
                name={`submission-viewer-${submission.id}`}
                width="100%"
                height={editorHeight}
                readOnly
                fontSize={13}
                showGutter
                highlightActiveLine={false}
                setOptions={{
                  useWorker: false,
                  showPrintMargin: false,
                  displayIndentGuides: true,
                  tabSize: 2,
                }}
                editorProps={{ $blockScrolling: true }}
              />
            </div>
          ) : (
            <div className="mt-4 rounded-2xl bg-slate-900 px-4 py-4 text-sm text-slate-300 ring-1 ring-slate-800">
              {zipUpload
                ? "Source preview is not available for ZIP uploads. Use the download button and review the archive locally."
                : "Source preview is not available for this submission."}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
