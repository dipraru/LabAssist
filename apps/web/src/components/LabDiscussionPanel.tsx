import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  CheckCircle2,
  MessageCircleMore,
  MessageSquareReply,
  Send,
  Sparkles,
} from 'lucide-react';
import { api } from '../lib/api';
import { SafeImage } from '../lib/media';
import { useAuthStore } from '../store/auth.store';

type Role = 'teacher' | 'student';

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Recently';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Recently';
  }

  return new Intl.DateTimeFormat([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function getRoleBadgeClasses(role: string | null | undefined) {
  return role === 'teacher'
    ? 'bg-rose-100 text-rose-700 ring-1 ring-rose-200'
    : 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200';
}

function getDiscussionSurface(isSolved: boolean, index: number) {
  if (isSolved) {
    return 'border-emerald-200 bg-[linear-gradient(135deg,#ecfdf5_0%,#ffffff_100%)]';
  }

  if (index % 2 === 0) {
    return 'border-sky-200 bg-[linear-gradient(135deg,#eff6ff_0%,#ffffff_100%)]';
  }

  return 'border-slate-200 bg-[linear-gradient(135deg,#f8fafc_0%,#ffffff_100%)]';
}

function PersonAvatar({
  name,
  photo,
}: {
  name: string;
  photo?: string | null;
}) {
  return (
    <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-slate-900 font-semibold text-white shadow-sm">
      {photo ? (
        <SafeImage
          src={photo}
          alt={name}
          className="h-full w-full object-cover"
          fallback={getInitials(name || 'User')}
        />
      ) : (
        getInitials(name || 'User')
      )}
    </div>
  );
}

export function LabDiscussionPanel({
  role,
  courseId,
  labClass,
}: {
  role: Role;
  courseId: string;
  labClass: any;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [questionTitle, setQuestionTitle] = useState('');
  const [questionBody, setQuestionBody] = useState('');
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  const queryKey = useMemo(
    () => ['lab-discussion-posts', role, courseId, labClass?.id],
    [courseId, labClass?.id, role],
  );

  const { data: questions = [], isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      api
        .get(`/courses/${courseId}/posts`, {
          params: {
            type: 'question',
            labClassId: labClass?.id,
          },
        })
        .then((response) => response.data),
    enabled: Boolean(courseId && labClass?.id),
  });

  const createQuestionMutation = useMutation({
    mutationFn: () =>
      api.post(`/courses/${courseId}/posts`, {
        type: 'question',
        labClassId: labClass.id,
        title: questionTitle.trim(),
        body: questionBody.trim(),
      }),
    onSuccess: () => {
      toast.success('Question posted');
      queryClient.invalidateQueries({ queryKey });
      setQuestionTitle('');
      setQuestionBody('');
    },
    onError: (error: any) =>
      toast.error(error.response?.data?.message ?? 'Failed to post question'),
  });

  const replyMutation = useMutation({
    mutationFn: ({ postId, body }: { postId: string; body: string }) =>
      api.post(`/courses/posts/${postId}/comments`, { body }),
    onSuccess: (_, variables) => {
      toast.success('Reply posted');
      queryClient.invalidateQueries({ queryKey });
      setReplyDrafts((current) => ({
        ...current,
        [variables.postId]: '',
      }));
    },
    onError: (error: any) =>
      toast.error(error.response?.data?.message ?? 'Failed to post reply'),
  });

  const solveMutation = useMutation({
    mutationFn: (postId: string) =>
      api.patch(`/courses/posts/${postId}/solved`, { isSolved: true }),
    onSuccess: () => {
      toast.success('Question marked as solved');
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error: any) =>
      toast.error(error.response?.data?.message ?? 'Failed to update the question'),
  });

  const handleCreateQuestion = () => {
    if (!questionTitle.trim()) {
      toast.error('Question title is required');
      return;
    }
    if (!questionBody.trim()) {
      toast.error('Question details are required');
      return;
    }
    createQuestionMutation.mutate();
  };

  const postReply = (postId: string) => {
    const body = replyDrafts[postId] ?? '';
    if (!body.trim()) {
      toast.error('Write a reply first');
      return;
    }

    replyMutation.mutate({
      postId,
      body: body.trim(),
    });
  };

  return (
    <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)]">
      <div className="flex items-start gap-4">
        <div className="rounded-[24px] bg-[linear-gradient(135deg,#0f172a_0%,#1d4ed8_100%)] p-3 text-white shadow-[0_18px_34px_-24px_rgba(29,78,216,0.6)]">
          <MessageCircleMore size={20} />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
            Lab Discussion
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900">
            Questions and replies
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Students can ask for help here, and both classmates and teachers can reply.
          </p>
        </div>
      </div>

      {role === 'student' ? (
        <div className="mt-6 rounded-[28px] border border-sky-200 bg-[linear-gradient(135deg,#eff6ff_0%,#ffffff_100%)] p-5 shadow-[0_18px_48px_-36px_rgba(15,23,42,0.35)]">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-white p-3 text-sky-700 ring-1 ring-sky-100">
              <Sparkles size={18} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                Ask a question
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Mention the blocker clearly so your teacher and classmates can help quickly.
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Question title
              </span>
              <input
                value={questionTitle}
                onChange={(event) => setQuestionTitle(event.target.value)}
                className={inputClass}
                placeholder="What do you need help with?"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Details
              </span>
              <textarea
                value={questionBody}
                onChange={(event) => setQuestionBody(event.target.value)}
                rows={5}
                className={`${inputClass} min-h-32 resize-none`}
                placeholder="Describe the issue, expected result, and anything you already tried"
              />
            </label>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleCreateQuestion}
                disabled={createQuestionMutation.isPending}
                className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Send size={15} />
                {createQuestionMutation.isPending ? 'Posting...' : 'Post question'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <div className="mt-6 space-y-4">
          {[1, 2].map((item) => (
            <div
              key={item}
              className="h-48 animate-pulse rounded-[26px] border border-slate-200 bg-slate-50"
            />
          ))}
        </div>
      ) : (questions as any[]).length ? (
        <div className="mt-6 space-y-4">
          {(questions as any[]).map((question: any, index: number) => {
            const canMarkSolved =
              !question.isSolved &&
              (role === 'teacher' || question.postedByUserId === user?.id);
            const replyDraft = replyDrafts[question.id] ?? '';

            return (
              <article
                key={question.id}
                id={`discussion-${question.id}`}
                className={`rounded-[28px] border p-5 shadow-[0_18px_48px_-36px_rgba(15,23,42,0.35)] ${getDiscussionSurface(
                  Boolean(question.isSolved),
                  index,
                )}`}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex min-w-0 items-start gap-4">
                    <PersonAvatar
                      name={question.postedByName ?? 'User'}
                      photo={question.postedByPhoto}
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">
                          {question.postedByName ?? 'User'}
                        </span>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                          {question.postedByIdentifier ?? 'Identity unavailable'}
                        </span>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${getRoleBadgeClasses(
                            question.postedByRole,
                          )}`}
                        >
                          {question.postedByRole === 'teacher' ? 'Teacher' : 'Student'}
                        </span>
                        <span className="text-xs font-medium text-slate-400">
                          {formatDateTime(question.createdAt)}
                        </span>
                        {question.isSolved ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                            <CheckCircle2 size={12} />
                            Solved
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-3 text-lg font-semibold text-slate-900">
                        {question.title}
                      </p>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                        {question.body}
                      </p>
                    </div>
                  </div>

                  {canMarkSolved ? (
                    <button
                      type="button"
                      onClick={() => solveMutation.mutate(question.id)}
                      disabled={solveMutation.isPending}
                      className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <CheckCircle2 size={15} />
                      Mark solved
                    </button>
                  ) : null}
                </div>

                {question.isSolved ? (
                  <div className="mt-5 rounded-[22px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    This question was marked as solved
                    {question.solvedByName ? ` by ${question.solvedByName}` : ''}
                    {question.solvedAt ? ` on ${formatDateTime(question.solvedAt)}` : ''}.
                    Replies are now closed.
                  </div>
                ) : null}

                <div className="mt-6 space-y-3 border-t border-white/80 pt-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Replies
                  </p>

                  {(question.comments ?? []).length ? (
                    <div className="space-y-3">
                      {(question.comments ?? []).map((comment: any) => (
                        <div
                          key={comment.id}
                          className="rounded-[24px] border border-slate-200 bg-white/90 p-4 shadow-sm"
                        >
                          <div className="flex items-start gap-3">
                            <PersonAvatar
                              name={comment.commentedByName ?? 'User'}
                              photo={comment.commentedByPhoto}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-slate-900">
                                  {comment.commentedByName ?? 'User'}
                                </span>
                                <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                                  {comment.commentedByIdentifier ?? 'Identity unavailable'}
                                </span>
                                <span
                                  className={`rounded-full px-3 py-1 text-xs font-semibold ${getRoleBadgeClasses(
                                    comment.commentedByRole,
                                  )}`}
                                >
                                  {comment.commentedByRole === 'teacher' ? 'Teacher' : 'Student'}
                                </span>
                                <span className="text-xs font-medium text-slate-400">
                                  {formatDateTime(comment.createdAt)}
                                </span>
                              </div>
                              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                                {comment.body}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-[22px] border border-dashed border-slate-300 bg-white/60 px-5 py-6 text-sm text-slate-500">
                      No replies yet.
                    </div>
                  )}

                  {!question.isSolved ? (
                    <div className="rounded-[24px] border border-slate-200 bg-white/90 p-4 shadow-sm">
                      <label className="block">
                        <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Add a reply
                        </span>
                        <textarea
                          value={replyDraft}
                          onChange={(event) =>
                            setReplyDrafts((current) => ({
                              ...current,
                              [question.id]: event.target.value,
                            }))
                          }
                          rows={4}
                          className={`${inputClass} min-h-28 resize-none`}
                          placeholder="Write a helpful reply"
                        />
                      </label>

                      <div className="mt-4 flex justify-end">
                        <button
                          type="button"
                          onClick={() => postReply(question.id)}
                          disabled={replyMutation.isPending}
                          className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <MessageSquareReply size={15} />
                          {replyMutation.isPending ? 'Posting...' : 'Reply'}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mt-6 rounded-[26px] border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-700">No discussion yet</p>
          <p className="mt-2 text-xs text-slate-500">
            {role === 'student'
              ? 'Ask the first question if you need help with this lab.'
              : 'Student questions for this lab will appear here.'}
          </p>
        </div>
      )}
    </section>
  );
}

const inputClass =
  'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white';
