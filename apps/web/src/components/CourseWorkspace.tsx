import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  BookOpen,
  ExternalLink,
  MessageSquare,
  Send,
  Users,
  Megaphone,
  CircleHelp,
} from 'lucide-react';
import { api } from '../lib/api';
import { courseCode, courseTitle, studentDisplayName } from '../lib/display';

type WorkspaceRole = 'student' | 'teacher';

function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function teacherNames(course: any): string[] {
  return Array.isArray(course?.teachers)
    ? course.teachers
        .map((teacher: any) => teacher?.fullName || teacher?.teacherId)
        .filter((value: unknown): value is string => Boolean(value))
    : [];
}

function postTypeLabel(type: string): string {
  if (type === 'announcement') return 'Announcement';
  if (type === 'question') return 'Question';
  return 'Discussion';
}

function postTypeStyles(type: string): string {
  if (type === 'announcement') return 'bg-indigo-100 text-indigo-700';
  if (type === 'question') return 'bg-amber-100 text-amber-700';
  return 'bg-emerald-100 text-emerald-700';
}

export function CourseWorkspace({ role }: { role: WorkspaceRole }) {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [postTitle, setPostTitle] = useState('');
  const [postBody, setPostBody] = useState('');
  const [postType, setPostType] = useState(
    role === 'teacher' ? 'announcement' : 'question',
  );
  const [commentBodies, setCommentBodies] = useState<Record<string, string>>({});
  const [highlightedSheetId, setHighlightedSheetId] = useState<string | null>(
    null,
  );

  const basePath = role === 'teacher' ? '/teacher/courses' : '/student/courses';
  const deepLinkSheetId = searchParams.get('sheetId') ?? '';

  const { data: courses = [], isLoading: coursesLoading } = useQuery({
    queryKey: [role, 'courses'],
    queryFn: () => api.get('/courses/my').then((response) => response.data),
  });

  const selectedCourse = useMemo(
    () => (courses as any[]).find((course: any) => course.id === courseId) ?? null,
    [courseId, courses],
  );

  useEffect(() => {
    if (!courseId) return;
    if (coursesLoading) return;
    if ((courses as any[]).length > 0 && !selectedCourse) {
      navigate(basePath, { replace: true });
    }
  }, [basePath, courseId, courses, coursesLoading, navigate, selectedCourse]);

  const { data: sheets = [], isLoading: sheetsLoading } = useQuery({
    queryKey: ['lecture-sheets', courseId],
    queryFn: () =>
      api.get(`/courses/${courseId}/lecture-sheets`).then((response) => response.data),
    enabled: Boolean(courseId),
  });

  const { data: posts = [], isLoading: postsLoading } = useQuery({
    queryKey: ['course-posts', courseId],
    queryFn: () => api.get(`/courses/${courseId}/posts`).then((response) => response.data),
    enabled: Boolean(courseId),
  });

  const { data: enrollments = [] } = useQuery({
    queryKey: ['course-enrollments', courseId],
    queryFn: () =>
      api.get(`/courses/${courseId}/enrollments`).then((response) => response.data),
    enabled: Boolean(courseId) && role === 'teacher',
  });

  const createPostMutation = useMutation({
    mutationFn: async () => {
      if (!courseId) return null;
      return api.post(`/courses/${courseId}/posts`, {
        title: postTitle.trim() || undefined,
        body: postBody.trim(),
        type: postType,
      });
    },
    onSuccess: () => {
      setPostTitle('');
      setPostBody('');
      setPostType(role === 'teacher' ? 'announcement' : 'question');
      queryClient.invalidateQueries({ queryKey: ['course-posts', courseId] });
      toast.success(role === 'teacher' ? 'Posted to class stream' : 'Question posted');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message ?? 'Failed to post');
    },
  });

  const createCommentMutation = useMutation({
    mutationFn: async (postId: string) => {
      const body = (commentBodies[postId] ?? '').trim();
      return api.post(`/courses/posts/${postId}/comments`, { body });
    },
    onSuccess: (_response, postId) => {
      setCommentBodies((current) => ({ ...current, [postId]: '' }));
      queryClient.invalidateQueries({ queryKey: ['course-posts', courseId] });
      toast.success('Comment added');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message ?? 'Failed to comment');
    },
  });

  useEffect(() => {
    if (!deepLinkSheetId) return;
    if (!(sheets as any[]).some((sheet: any) => sheet.id === deepLinkSheetId)) {
      return;
    }

    setHighlightedSheetId(deepLinkSheetId);
    window.setTimeout(() => {
      document
        .getElementById(`course-sheet-${deepLinkSheetId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 0);
    window.setTimeout(() => setHighlightedSheetId(null), 1800);

    const next = new URLSearchParams(searchParams);
    next.delete('sheetId');
    setSearchParams(next, { replace: true });
  }, [deepLinkSheetId, searchParams, setSearchParams, sheets]);

  const streamItems = useMemo(() => {
    const materialItems = (sheets as any[]).map((sheet: any) => ({
      kind: 'sheet' as const,
      id: sheet.id,
      createdAt: sheet.createdAt,
      item: sheet,
    }));
    const postItems = (posts as any[])
      .filter((post: any) => post.type !== 'question')
      .map((post: any) => ({
        kind: 'post' as const,
        id: post.id,
        createdAt: post.createdAt,
        item: post,
      }));

    return [...materialItems, ...postItems].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [posts, sheets]);

  const questionPosts = useMemo(
    () =>
      (posts as any[])
        .filter((post: any) => post.type === 'question')
        .sort(
          (a: any, b: any) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
    [posts],
  );

  const getSheetHref = (sheet: any) =>
    `${basePath}/${sheet.courseId ?? courseId}?sheetId=${sheet.id}`;

  return (
    <div className="w-full max-w-[1520px] 2xl:max-w-[1680px]">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {selectedCourse ? courseCode(selectedCourse) : 'Courses'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {selectedCourse
              ? 'Course stream, materials, and discussion for the selected class.'
              : 'Open a course card to view the class stream and discussion.'}
          </p>
        </div>
        {selectedCourse && (
          <Link
            to={basePath}
            className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
          >
            Back to all courses
          </Link>
        )}
      </div>

      {!selectedCourse && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 mb-8">
          {coursesLoading &&
            [1, 2, 3].map((key) => (
              <div
                key={key}
                className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm animate-pulse"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-100 mb-3" />
                <div className="h-4 w-24 rounded bg-slate-100 mb-2" />
                <div className="h-3 w-36 rounded bg-slate-100" />
              </div>
            ))}

          {!coursesLoading &&
            (courses as any[]).map((course: any) => (
              <Link
                key={course.id}
                to={`${basePath}/${course.id}`}
                className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition-all hover:border-slate-300 hover:-translate-y-0.5"
              >
                <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center mb-3">
                  <BookOpen size={18} className="text-indigo-600" />
                </div>
                <p className="font-semibold text-slate-900">{courseCode(course)}</p>
                <p className="text-sm text-slate-600 mt-1">{courseTitle(course)}</p>
                <p className="text-xs text-slate-500 mt-3">
                  {teacherNames(course).join(', ') || 'Teacher not assigned yet'}
                </p>
              </Link>
            ))}

          {!coursesLoading && !(courses as any[]).length && (
            <p className="text-slate-400 py-4">No courses available right now.</p>
          )}
        </div>
      )}

      {!selectedCourse ? null : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,0.95fr)_minmax(360px,1.08fr)] 2xl:grid-cols-[minmax(0,2.15fr)_minmax(360px,1fr)_minmax(400px,1.15fr)]">
          <div className="space-y-5">
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-500">
                    {courseCode(selectedCourse)}
                  </p>
                  <h2 className="text-2xl font-semibold text-slate-900 mt-2">
                    {courseTitle(selectedCourse)}
                  </h2>
                  <p className="text-sm text-slate-500 mt-2">
                    {teacherNames(selectedCourse).join(', ') ||
                      'Teacher not assigned yet'}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  {selectedCourse.semester?.name?.replace(/_/g, ' ') ||
                    'Semester N/A'}
                </div>
              </div>
            </section>

            {role === 'teacher' && (
              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <MessageSquare size={18} className="text-indigo-500" />
                  <div>
                    <h3 className="font-semibold text-slate-900">Class Stream</h3>
                    <p className="text-sm text-slate-500">
                      Post updates, prompts, and discussion starters for the class.
                    </p>
                  </div>
                </div>

                <div className="mb-4">
                  <label className="text-xs font-medium text-slate-500 block mb-2">
                    Post type
                  </label>
                  <select
                    value={postType}
                    onChange={(event) => setPostType(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
                  >
                    <option value="announcement">Announcement</option>
                    <option value="discussion">Discussion</option>
                  </select>
                </div>

                <input
                  value={postTitle}
                  onChange={(event) => setPostTitle(event.target.value)}
                  placeholder="Optional title for this post"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400 mb-3"
                />
                <textarea
                  value={postBody}
                  onChange={(event) => setPostBody(event.target.value)}
                  placeholder="Share an update, reminder, or discussion prompt..."
                  rows={4}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400"
                />
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    disabled={!postBody.trim() || createPostMutation.isPending}
                    onClick={() => createPostMutation.mutate()}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Send size={14} />
                    Post to stream
                  </button>
                </div>
              </section>
            )}

            <section className="space-y-4">
              {(sheetsLoading || postsLoading) && (
                <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm animate-pulse">
                  <div className="h-5 w-40 rounded bg-slate-100 mb-3" />
                  <div className="h-4 w-64 rounded bg-slate-100 mb-2" />
                  <div className="h-4 w-52 rounded bg-slate-100" />
                </div>
              )}

              {!sheetsLoading && !postsLoading && !streamItems.length && (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-400">
                  Nothing has been posted in this course yet.
                </div>
              )}

              {streamItems.map((entry) => {
                if (entry.kind === 'sheet') {
                  const sheet = entry.item;
                  return (
                    <article
                      key={`sheet-${sheet.id}`}
                      id={`course-sheet-${sheet.id}`}
                      className={`rounded-3xl border bg-white p-6 shadow-sm ${
                        highlightedSheetId === sheet.id
                          ? 'border-indigo-300 ring-2 ring-indigo-100'
                          : 'border-slate-100'
                      }`}
                    >
                      <Link
                        to={getSheetHref(sheet)}
                        className="block rounded-2xl transition-colors hover:bg-slate-50"
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-1 rounded-xl bg-indigo-100 p-2">
                            <BookOpen size={16} className="text-indigo-600" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-700">
                                Material
                              </span>
                              <span className="text-xs text-slate-400">
                                {formatDateTime(sheet.createdAt)}
                              </span>
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600">
                                Open material
                                <ExternalLink size={12} />
                              </span>
                            </div>
                            <h4 className="text-lg font-semibold text-slate-900 mt-3">
                              {sheet.title}
                            </h4>
                            {sheet.description && (
                              <p className="text-sm text-slate-600 mt-2">
                                {sheet.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </Link>
                      {!!sheet.links?.length && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {sheet.links.map((link: any, index: number) => (
                            <a
                              key={`${sheet.id}-${index}`}
                              href={link.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
                            >
                              <ExternalLink size={12} />
                              {link.label || link.url}
                            </a>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                }

                const post = entry.item;
                return (
                  <article
                    key={`post-${post.id}`}
                    className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="mt-1 rounded-xl bg-emerald-100 p-2"
                      >
                        {post.type === 'announcement' ? (
                          <Megaphone size={16} className="text-indigo-700" />
                        ) : (
                          <MessageSquare size={16} className="text-emerald-700" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${postTypeStyles(post.type)}`}
                          >
                            {postTypeLabel(post.type)}
                          </span>
                          <span className="text-xs text-slate-500">
                            {post.postedByName}
                          </span>
                          <span className="text-xs text-slate-400">
                            {formatDateTime(post.createdAt)}
                          </span>
                        </div>

                        {post.title && (
                          <h4 className="text-lg font-semibold text-slate-900 mt-3">
                            {post.title}
                          </h4>
                        )}
                        <p className="text-sm leading-6 text-slate-700 mt-2 whitespace-pre-wrap">
                          {post.body}
                        </p>

                        <div className="mt-5 space-y-3">
                          {(post.comments ?? []).map((comment: any) => (
                            <div
                              key={comment.id}
                              className="rounded-2xl bg-slate-50 px-4 py-3"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium text-slate-800">
                                  {comment.commentedByName}
                                </span>
                                <span className="text-xs text-slate-400">
                                  {formatDateTime(comment.createdAt)}
                                </span>
                              </div>
                              <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">
                                {comment.body}
                              </p>
                            </div>
                          ))}
                        </div>

                        <div className="mt-4 flex gap-2">
                          <input
                            value={commentBodies[post.id] ?? ''}
                            onChange={(event) =>
                              setCommentBodies((current) => ({
                                ...current,
                                [post.id]: event.target.value,
                              }))
                            }
                            placeholder="Add a comment..."
                            className="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-indigo-400"
                          />
                          <button
                            type="button"
                            disabled={
                              !(commentBodies[post.id] ?? '').trim() ||
                              createCommentMutation.isPending
                            }
                            onClick={() => createCommentMutation.mutate(post.id)}
                            className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Reply
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>
          </div>

          <aside className="space-y-5">
            <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <Users size={16} className="text-slate-500" />
                {role === 'teacher' ? 'Enrolled Students' : 'Teachers'}
              </h3>

              {role === 'teacher' ? (
                !(enrollments as any[]).length ? (
                  <p className="text-sm text-slate-400 mt-3">
                    No students enrolled yet.
                  </p>
                ) : (
                  <div className="mt-3 space-y-2 max-h-80 overflow-auto">
                    {(enrollments as any[]).map((enrollment: any) => (
                      <div
                        key={enrollment.id}
                        className="rounded-2xl bg-slate-50 px-3 py-2.5"
                      >
                        <p className="text-sm font-medium text-slate-800">
                          {studentDisplayName(enrollment)}
                        </p>
                        <p className="text-xs text-slate-500">
                          {enrollment.student?.studentId ?? 'N/A'}
                        </p>
                      </div>
                    ))}
                  </div>
                )
              ) : !teacherNames(selectedCourse).length ? (
                <p className="text-sm text-slate-400 mt-3">
                  No teachers assigned yet.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {teacherNames(selectedCourse).map((name) => (
                    <div
                      key={name}
                      className="rounded-2xl bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-800"
                    >
                      {name}
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
              <h3 className="font-semibold text-slate-900">Materials</h3>
              {!(sheets as any[]).length ? (
                <p className="text-sm text-slate-400 mt-3">
                  No materials posted yet.
                </p>
              ) : (
                <div className="mt-3 space-y-3">
                  {(sheets as any[]).slice(0, 6).map((sheet: any) => (
                    <Link
                      key={sheet.id}
                      to={getSheetHref(sheet)}
                      className="flex items-start justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-3 transition-colors hover:bg-slate-100"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800">
                          {sheet.title}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          {formatDateTime(sheet.createdAt)}
                        </p>
                      </div>
                      <ExternalLink
                        size={14}
                        className="mt-0.5 shrink-0 text-slate-400"
                      />
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </aside>

          <aside className="space-y-5">
            <section className="rounded-3xl border border-amber-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <CircleHelp size={16} className="text-amber-600" />
                <h3 className="font-semibold text-slate-900">Questions</h3>
              </div>
              <p className="text-sm text-slate-500 mt-2">
                {role === 'teacher'
                  ? 'Student questions and replies stay here for quick follow-up.'
                  : 'Ask the teachers or your classmates from here.'}
              </p>

              {role === 'student' && (
                <>
                  <input
                    value={postTitle}
                    onChange={(event) => setPostTitle(event.target.value)}
                    placeholder="Question title (optional)"
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-amber-400 mt-4 mb-3"
                  />
                  <textarea
                    value={postBody}
                    onChange={(event) => setPostBody(event.target.value)}
                    placeholder="Ask your question..."
                    rows={4}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-amber-400"
                  />
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      disabled={!postBody.trim() || createPostMutation.isPending}
                      onClick={() => createPostMutation.mutate()}
                      className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Send size={14} />
                      Ask now
                    </button>
                  </div>
                </>
              )}

              <div className="mt-5 space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Recent Questions
                </h4>
                {!questionPosts.length ? (
                  <p className="text-sm text-slate-400">
                    No questions yet in this class.
                  </p>
                ) : (
                  questionPosts.map((post: any) => (
                    <div
                      key={post.id}
                      className="rounded-2xl bg-amber-50 px-3 py-3 border border-amber-100"
                    >
                      <div className="flex items-start gap-2">
                        <CircleHelp
                          size={14}
                          className="text-amber-700 mt-0.5 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-800">
                            {post.title || 'Untitled question'}
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            {post.postedByName} · {formatDateTime(post.createdAt)}
                          </p>
                          <p className="text-xs text-slate-700 mt-2 whitespace-pre-wrap">
                            {post.body}
                          </p>

                          <div className="mt-3 space-y-2">
                            {(post.comments ?? []).map((comment: any) => (
                              <div
                                key={comment.id}
                                className="rounded-xl bg-white/80 px-3 py-2"
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-xs font-medium text-slate-800">
                                    {comment.commentedByName}
                                  </span>
                                  <span className="text-[11px] text-slate-400">
                                    {formatDateTime(comment.createdAt)}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-600 mt-1 whitespace-pre-wrap">
                                  {comment.body}
                                </p>
                              </div>
                            ))}
                          </div>

                          <div className="mt-3 flex gap-2">
                            <input
                              value={commentBodies[post.id] ?? ''}
                              onChange={(event) =>
                                setCommentBodies((current) => ({
                                  ...current,
                                  [post.id]: event.target.value,
                                }))
                              }
                              placeholder={
                                role === 'teacher'
                                  ? 'Reply to this question...'
                                  : 'Add a follow-up...'
                              }
                              className="min-w-0 flex-1 rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs outline-none focus:border-amber-400"
                            />
                            <button
                              type="button"
                              disabled={
                                !(commentBodies[post.id] ?? '').trim() ||
                                createCommentMutation.isPending
                              }
                              onClick={() => createCommentMutation.mutate(post.id)}
                              className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Reply
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
