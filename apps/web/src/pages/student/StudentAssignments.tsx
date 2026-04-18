import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, FileText, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { useSearchParams } from 'react-router-dom';
import { AppShell } from '../../components/AppShell';
import { api } from '../../lib/api';

type AssignmentSectionKey = 'due' | 'late' | 'expired';

const SUBMISSION_STATUS_STYLES: Record<string, string> = {
  submitted: 'bg-sky-100 text-sky-700',
  resubmitted: 'bg-indigo-100 text-indigo-700',
  late: 'bg-amber-100 text-amber-700',
  graded: 'bg-emerald-100 text-emerald-700',
};

function courseCode(course: any): string {
  return course?.courseCode ?? course?.code ?? 'N/A';
}

function courseTitle(course: any): string {
  return course?.title ?? course?.name ?? 'Untitled Course';
}

function getDeadlineTime(assignment: any): number | null {
  if (!assignment?.deadline) return null;
  const deadline = new Date(assignment.deadline).getTime();
  return Number.isFinite(deadline) ? deadline : null;
}

function isLateSubmissionWindow(assignment: any, nowMs: number): boolean {
  const deadlineMs = getDeadlineTime(assignment);
  return deadlineMs != null && deadlineMs < nowMs && Boolean(assignment?.allowLateSubmission);
}

function isExpiredAssignment(assignment: any, nowMs: number): boolean {
  const deadlineMs = getDeadlineTime(assignment);
  return deadlineMs != null && deadlineMs < nowMs && !assignment?.allowLateSubmission;
}

function compareUpcomingAssignments(left: any, right: any): number {
  const leftDeadline = getDeadlineTime(left);
  const rightDeadline = getDeadlineTime(right);

  if (leftDeadline != null && rightDeadline != null && leftDeadline !== rightDeadline) {
    return leftDeadline - rightDeadline;
  }

  if (leftDeadline != null) return -1;
  if (rightDeadline != null) return 1;

  return (
    new Date(right?.createdAt ?? 0).getTime() - new Date(left?.createdAt ?? 0).getTime()
  );
}

function compareRecentlyExpiredAssignments(left: any, right: any): number {
  const leftDeadline = getDeadlineTime(left) ?? Number.NEGATIVE_INFINITY;
  const rightDeadline = getDeadlineTime(right) ?? Number.NEGATIVE_INFINITY;

  if (leftDeadline !== rightDeadline) {
    return rightDeadline - leftDeadline;
  }

  return (
    new Date(right?.createdAt ?? 0).getTime() - new Date(left?.createdAt ?? 0).getTime()
  );
}

function formatDateTimeLabel(value: string | null | undefined): string {
  if (!value) return 'No deadline';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function getAssignmentWindowLabel(sectionKey: AssignmentSectionKey, assignment: any): string {
  if (sectionKey === 'late') {
    return 'Late submission open';
  }

  if (sectionKey === 'expired') {
    return 'Submission closed';
  }

  if (!assignment?.deadline) {
    return 'No deadline';
  }

  return 'Due soon';
}

function getAssignmentWindowStyles(sectionKey: AssignmentSectionKey): string {
  if (sectionKey === 'late') {
    return 'bg-amber-100 text-amber-800';
  }

  if (sectionKey === 'expired') {
    return 'bg-rose-100 text-rose-700';
  }

  return 'bg-emerald-100 text-emerald-700';
}

function getSubmissionStatusLabel(submission: any): string {
  if (!submission) return 'Not submitted';
  if (submission?.status === 'graded' && submission?.score != null) {
    return `Graded ${submission.score}`;
  }

  return String(submission.status ?? 'submitted')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function canSubmitAssignment(assignment: any, sectionKey: AssignmentSectionKey): boolean {
  if (sectionKey === 'expired') {
    return false;
  }

  if (sectionKey === 'late') {
    return Boolean(assignment?.allowLateSubmission);
  }

  return true;
}

function buildAssignmentSections(assignments: any[]) {
  const nowMs = Date.now();
  const due: any[] = [];
  const late: any[] = [];
  const expired: any[] = [];

  for (const assignment of assignments ?? []) {
    if (isLateSubmissionWindow(assignment, nowMs)) {
      late.push(assignment);
      continue;
    }

    if (isExpiredAssignment(assignment, nowMs)) {
      expired.push(assignment);
      continue;
    }

    due.push(assignment);
  }

  due.sort(compareUpcomingAssignments);
  late.sort(compareRecentlyExpiredAssignments);
  expired.sort(compareRecentlyExpiredAssignments);

  return [
    {
      key: 'due' as const,
      title: 'Due',
      description: 'Upcoming assignments stay here.',
      emptyState: 'No active assignments are due right now.',
      items: due,
    },
    {
      key: 'late' as const,
      title: 'Late Submissions',
      description:
        'These deadlines already passed, but late submission is still allowed.',
      emptyState: 'No late-submission assignments are available right now.',
      items: late,
    },
    {
      key: 'expired' as const,
      title: 'Expired',
      description: 'Closed assignments stay here.',
      emptyState: 'No expired assignments yet.',
      items: expired,
    },
  ];
}

export function StudentAssignments() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkAssignmentId = searchParams.get('assignmentId') ?? '';
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [highlightedAssignmentId, setHighlightedAssignmentId] = useState<string | null>(null);
  const [assignmentDeepLinkHandled, setAssignmentDeepLinkHandled] = useState(false);
  const [uploadFile, setUploadFile] = useState<Record<string, File>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ['student-assignments', 'all'],
    queryFn: () => api.get('/assignments/my').then((response) => response.data),
  });

  const { data: deepLinkedAssignment } = useQuery({
    queryKey: ['assignment-by-id', deepLinkAssignmentId],
    enabled: Boolean(deepLinkAssignmentId),
    queryFn: () => api.get(`/assignments/${deepLinkAssignmentId}`).then((response) => response.data),
  });

  const assignmentSections = useMemo(
    () => buildAssignmentSections(assignments as any[]),
    [assignments],
  );
  const orderedAssignments = useMemo(
    () => assignmentSections.flatMap((section) => section.items),
    [assignmentSections],
  );
  const assignmentCounts = useMemo(
    () =>
      assignmentSections.reduce(
        (accumulator, section) => {
          accumulator[section.key] = section.items.length;
          return accumulator;
        },
        { due: 0, late: 0, expired: 0 } as Record<AssignmentSectionKey, number>,
      ),
    [assignmentSections],
  );

  useEffect(() => {
    if (!deepLinkAssignmentId || !deepLinkedAssignment) return;
    if (!orderedAssignments.some((assignment: any) => assignment.id === deepLinkAssignmentId)) {
      return;
    }

    setAssignmentDeepLinkHandled(false);
  }, [deepLinkAssignmentId, deepLinkedAssignment, orderedAssignments]);

  useEffect(() => {
    if (!deepLinkAssignmentId || assignmentDeepLinkHandled || !orderedAssignments.length) {
      return;
    }

    const linkedAssignment = orderedAssignments.find(
      (assignment: any) => assignment.id === deepLinkAssignmentId,
    );
    if (!linkedAssignment) {
      return;
    }

    setExpandedId(linkedAssignment.id);
    setHighlightedAssignmentId(linkedAssignment.id);
    setAssignmentDeepLinkHandled(true);

    window.setTimeout(() => {
      document
        .getElementById(`student-assignment-${linkedAssignment.id}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 0);

    window.setTimeout(() => setHighlightedAssignmentId(null), 1800);

    const next = new URLSearchParams(searchParams);
    next.delete('assignmentId');
    setSearchParams(next, { replace: true });
  }, [
    assignmentDeepLinkHandled,
    deepLinkAssignmentId,
    orderedAssignments,
    searchParams,
    setSearchParams,
  ]);

  const submitMutation = useMutation({
    mutationFn: ({
      assignmentId,
      file,
      note,
    }: {
      assignmentId: string;
      file: File;
      note: string;
    }) => {
      const formData = new FormData();
      formData.append('file', file);
      if (note) {
        formData.append('notes', note);
      }

      return api.post(`/assignments/${assignmentId}/submit`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: (_, variables) => {
      toast.success('Assignment submitted');
      setUploadFile((current) => {
        const next = { ...current };
        delete next[variables.assignmentId];
        return next;
      });
      setNotes((current) => {
        const next = { ...current };
        delete next[variables.assignmentId];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['student-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['student-course-assignments-page'] });
      queryClient.invalidateQueries({
        queryKey: ['assignment-by-id', variables.assignmentId],
      });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message ?? 'Submission failed');
    },
  });

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)]">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                Student Assignments
              </p>
              <h1 className="mt-2 text-3xl font-semibold text-slate-900">
                All Course Assignments
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-500">
                Review every assignment from your enrolled courses in one place.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard label="Due" value={String(assignmentCounts.due)} />
              <StatCard label="Late" value={String(assignmentCounts.late)} />
              <StatCard label="Expired" value={String(assignmentCounts.expired)} />
            </div>
          </div>
        </section>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-40 animate-pulse rounded-[26px] border border-slate-200 bg-white"
              />
            ))}
          </div>
        ) : assignmentSections.every((section) => section.items.length === 0) ? (
          <section className="rounded-[30px] border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
            No assignments found for your enrolled courses.
          </section>
        ) : (
          <div className="space-y-6">
            {assignmentSections.map((section) => (
              <section
                key={section.key}
                className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)]"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                      {section.title}
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                      {section.items.length} assignment{section.items.length === 1 ? '' : 's'}
                    </h2>
                    <p className="mt-2 text-sm text-slate-500">{section.description}</p>
                  </div>
                </div>

                {section.items.length ? (
                  <div className="mt-6 space-y-4">
                    {section.items.map((assignment: any) => {
                      const submission = assignment?.mySubmission ?? null;
                      const expanded = expandedId === assignment.id;
                      const canSubmit = !submission && canSubmitAssignment(assignment, section.key);

                      return (
                        <article
                          id={`student-assignment-${assignment.id}`}
                          key={assignment.id}
                          className={`overflow-hidden rounded-[26px] border bg-white shadow-[0_18px_48px_-36px_rgba(15,23,42,0.35)] transition-colors ${
                            highlightedAssignmentId === assignment.id
                              ? 'border-sky-300 bg-sky-50/30'
                              : 'border-slate-200'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedId(expanded ? null : assignment.id)
                            }
                            className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-slate-50"
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getAssignmentWindowStyles(
                                    section.key,
                                  )}`}
                                >
                                  {getAssignmentWindowLabel(section.key, assignment)}
                                </span>
                                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                                  {courseCode(assignment.course)}
                                </span>
                                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                                  {assignment?.totalMarks ?? 0} marks
                                </span>
                                {submission ? (
                                  <span
                                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                      SUBMISSION_STATUS_STYLES[submission.status] ??
                                      'bg-slate-100 text-slate-700'
                                    }`}
                                  >
                                    {getSubmissionStatusLabel(submission)}
                                  </span>
                                ) : (
                                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
                                    Not submitted
                                  </span>
                                )}
                              </div>

                              <h3 className="mt-3 text-lg font-semibold text-slate-900">
                                {assignment.title}
                              </h3>
                              <p className="mt-1 text-sm text-slate-500">
                                {courseTitle(assignment.course)}
                              </p>
                              <p className="mt-2 text-xs font-medium text-slate-500">
                                Deadline: {formatDateTimeLabel(assignment.deadline)}
                              </p>
                            </div>

                            <div className="shrink-0 text-slate-400">
                              {expanded ? (
                                <ChevronDown size={18} />
                              ) : (
                                <ChevronRight size={18} />
                              )}
                            </div>
                          </button>

                          {expanded ? (
                            <div className="border-t border-slate-200 px-5 py-5">
                              {assignment.caption ? (
                                <p className="text-sm leading-7 text-slate-600">
                                  {assignment.caption}
                                </p>
                              ) : null}

                              {assignment?.links?.length ? (
                                <div className="mt-4 flex flex-wrap gap-2">
                                  {assignment.links.map((link: any) => (
                                    <a
                                      key={link.id ?? link.url}
                                      href={link.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-200"
                                    >
                                      <FileText size={12} />
                                      {link.label || 'Open resource'}
                                    </a>
                                  ))}
                                </div>
                              ) : null}

                              {submission ? (
                                <div className="mt-5 rounded-[22px] border border-slate-200 bg-slate-50/80 p-4">
                                  <p className="text-sm font-semibold text-slate-900">
                                    Your Submission
                                  </p>
                                  <div className="mt-3 space-y-1 text-sm text-slate-600">
                                    <p>File: {submission.fileName || 'Uploaded file'}</p>
                                    <p>
                                      Submitted:{' '}
                                      {formatDateTimeLabel(submission.submittedAt)}
                                    </p>
                                    {submission.score != null ? (
                                      <p>
                                        Score: {submission.score} /{' '}
                                        {assignment?.totalMarks ?? 0}
                                      </p>
                                    ) : null}
                                    {submission.feedback ? (
                                      <p>Feedback: {submission.feedback}</p>
                                    ) : null}
                                  </div>
                                </div>
                              ) : canSubmit ? (
                                <div className="mt-5 space-y-4">
                                  <div>
                                    <label className="block text-sm font-medium text-slate-700">
                                      Submit file
                                    </label>
                                    <label
                                      className={`mt-2 flex cursor-pointer items-center gap-3 rounded-[18px] border-2 border-dashed px-4 py-4 transition ${
                                        uploadFile[assignment.id]
                                          ? 'border-sky-300 bg-sky-50'
                                          : 'border-slate-300 bg-slate-50 hover:border-slate-400'
                                      }`}
                                    >
                                      <Upload size={16} className="text-slate-400" />
                                      <span className="text-sm text-slate-600">
                                        {uploadFile[assignment.id]
                                          ? uploadFile[assignment.id].name
                                          : 'Choose a file to upload'}
                                      </span>
                                      <input
                                        type="file"
                                        className="hidden"
                                        onChange={(event) => {
                                          const file = event.target.files?.[0] ?? null;
                                          if (!file) return;
                                          setUploadFile((current) => ({
                                            ...current,
                                            [assignment.id]: file,
                                          }));
                                        }}
                                      />
                                    </label>
                                  </div>

                                  <div>
                                    <label className="block text-sm font-medium text-slate-700">
                                      Notes
                                    </label>
                                    <textarea
                                      value={notes[assignment.id] ?? ''}
                                      onChange={(event) =>
                                        setNotes((current) => ({
                                          ...current,
                                          [assignment.id]: event.target.value,
                                        }))
                                      }
                                      rows={3}
                                      className="mt-2 w-full rounded-[18px] border border-slate-300 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-slate-400"
                                    />
                                  </div>

                                  <button
                                    type="button"
                                    disabled={
                                      !uploadFile[assignment.id] ||
                                      submitMutation.isPending
                                    }
                                    onClick={() =>
                                      submitMutation.mutate({
                                        assignmentId: assignment.id,
                                        file: uploadFile[assignment.id],
                                        note: notes[assignment.id] ?? '',
                                      })
                                    }
                                    className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {submitMutation.isPending
                                      ? 'Submitting...'
                                      : 'Submit assignment'}
                                  </button>
                                </div>
                              ) : (
                                <div className="mt-5 rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
                                  Submission closed for this assignment.
                                </div>
                              )}
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-6 rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-5 py-12 text-center text-sm text-slate-500">
                    {section.emptyState}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}
