import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import {
  Archive,
  BarChart3,
  Bell,
  CheckCircle2,
  ClipboardList,
  HelpCircle,
  MessageSquare,
  Pin,
  RefreshCw,
  Send,
  Snowflake,
  Trophy,
  XCircle,
} from 'lucide-react';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { Modal } from '../../components/Modal';
import { CodePreview } from '../../components/CodePreview';
import { getSocket, joinContest, leaveContest } from '../../lib/socket';
import { getEffectiveVerdict } from '../../lib/verdict';

const gradeSchema = z.object({
  manualVerdict: z.string().min(1, 'Select verdict'),
  score: z.coerce.number().min(0).optional(),
  penaltyMinutes: z.coerce.number().min(0).optional(),
});
type GradeInput = z.input<typeof gradeSchema>;
type GradeData = z.output<typeof gradeSchema>;

const announcementSchema = z.object({
  title: z.string().min(2),
  body: z.string().optional(),
  isPinned: z.boolean().optional(),
});
type AnnouncementData = z.infer<typeof announcementSchema>;

type ContestTab = 'problems' | 'status' | 'standings' | 'clarifications' | 'announcements';

const VERDICTS = ['accepted', 'wrong_answer', 'time_limit_exceeded', 'memory_limit_exceeded', 'runtime_error', 'compilation_error', 'partial'];

const VERDICT_COLOR: Record<string, string> = {
  accepted: 'bg-green-100 text-green-700',
  wrong_answer: 'bg-red-100 text-red-700',
  time_limit_exceeded: 'bg-orange-100 text-orange-700',
  memory_limit_exceeded: 'bg-orange-100 text-orange-700',
  runtime_error: 'bg-rose-100 text-rose-700',
  compilation_error: 'bg-fuchsia-100 text-fuchsia-700',
  presentation_error: 'bg-yellow-100 text-yellow-700',
  partial: 'bg-sky-100 text-sky-700',
  pending: 'bg-amber-100 text-amber-700',
  judging: 'bg-blue-100 text-blue-700',
  skipped: 'bg-slate-100 text-slate-600',
  manual_review: 'bg-blue-100 text-blue-700',
};

function contestProblemLabel(cp: any, index: number): string {
  const raw = typeof cp?.label === 'string' ? cp.label.trim().toUpperCase() : '';
  if (raw.length === 1 && /^[A-Z]$/.test(raw)) return raw;
  return String.fromCharCode(65 + index);
}

export function ContestManage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [gradingId, setGradingId] = useState<string | null>(null);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [editingAnswerId, setEditingAnswerId] = useState<string | null>(null);
  const [answeringIgnoredId, setAnsweringIgnoredId] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState<{ [key: string]: string }>({});
  const [nowMs, setNowMs] = useState<number>(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const activeTab = useMemo<ContestTab>(() => {
    const path = location.pathname;
    if (path.endsWith('/status')) return 'status';
    if (path.endsWith('/standings')) return 'standings';
    if (path.endsWith('/clarifications')) return 'clarifications';
    if (path.endsWith('/announcements')) return 'announcements';
    return 'problems';
  }, [location.pathname]);

  const { data: contest } = useQuery({
    queryKey: ['contest', id],
    queryFn: () => api.get(`/contests/${id}`).then(r => r.data),
  });

  const { data: submissions = [] } = useQuery({
    queryKey: ['contest-submissions', id],
    queryFn: () => api.get(`/contests/${id}/submissions/all`).then(r => r.data),
    enabled: !!id,
    refetchInterval: activeTab === 'status' ? 5000 : false,
  });

  const { data: clarifications = [] } = useQuery({
    queryKey: ['contest-clarifications', id],
    queryFn: () => api.get(`/contests/${id}/clarifications/all`).then(r => r.data),
    enabled: !!id,
  });

  const { data: announcements = [] } = useQuery({
    queryKey: ['contest-announcements', id],
    queryFn: () => api.get(`/contests/${id}/announcements`).then(r => r.data),
    enabled: !!id,
  });

  const { data: standings, refetch: refetchStandings, isFetching: standingsFetching } = useQuery({
    queryKey: ['contest-standings', id],
    queryFn: () => api.get(`/contests/${id}/standings`).then(r => r.data),
    enabled: !!id,
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (!id || !contest?.id) return;

    joinContest(contest.id);
    const socket = getSocket();

    const refreshSubmissions = () => {
      qc.invalidateQueries({ queryKey: ['contest-submissions', id] });
    };
    const refreshStandings = () => {
      qc.invalidateQueries({ queryKey: ['contest-standings', id] });
    };
    const refreshAnnouncements = () => {
      qc.invalidateQueries({ queryKey: ['contest-announcements', id] });
    };
    const refreshClarifications = () => {
      qc.invalidateQueries({ queryKey: ['contest-clarifications', id] });
    };

    const verdictHandler = () => {
      refreshSubmissions();
      refreshStandings();
    };

    socket.on('verdict', verdictHandler);
    socket.on('standings:freeze', refreshStandings);
    socket.on('announcement', refreshAnnouncements);
    socket.on('clarification', refreshClarifications);

    return () => {
      socket.off('verdict', verdictHandler);
      socket.off('standings:freeze', refreshStandings);
      socket.off('announcement', refreshAnnouncements);
      socket.off('clarification', refreshClarifications);
      leaveContest(contest.id);
    };
  }, [id, contest?.id, qc]);

  const gradeForm = useForm<GradeInput, unknown, GradeData>({ resolver: zodResolver(gradeSchema) });
  const announcementForm = useForm<AnnouncementData>({ resolver: zodResolver(announcementSchema) });

  const gradeMutation = useMutation({
    mutationFn: ({ subId, d }: { subId: string; d: GradeData }) =>
      api.patch(`/contests/submissions/${subId}/grade`, {
        verdict: d.manualVerdict,
        score: d.score,
      }),
    onSuccess: () => {
      toast.success('Graded!');
      qc.invalidateQueries({ queryKey: ['contest-submissions', id] });
      qc.invalidateQueries({ queryKey: ['contest-standings', id] });
      setGradingId(null);
      gradeForm.reset();
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed'),
  });

  const answerMutation = useMutation({
    mutationFn: ({ clarId, answer }: { clarId: string; answer: string }) =>
      api.patch(`/contests/clarifications/${clarId}/answer`, { answer }),
    onSuccess: () => {
      toast.success('Saved');
      qc.invalidateQueries({ queryKey: ['contest-clarifications', id] });
      setEditingAnswerId(null);
      setAnsweringIgnoredId(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed'),
  });

  const ignoreMutation = useMutation({
    mutationFn: (clarId: string) => api.patch(`/contests/clarifications/${clarId}/ignore`),
    onSuccess: () => {
      toast.success('Clarification ignored');
      qc.invalidateQueries({ queryKey: ['contest-clarifications', id] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed'),
  });

  const announceMutation = useMutation({
    mutationFn: (d: AnnouncementData) => api.post(`/contests/${id}/announcements`, d),
    onSuccess: () => {
      toast.success('Announcement posted');
      announcementForm.reset();
      qc.invalidateQueries({ queryKey: ['contest-announcements', id] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed'),
  });

  const pinAnnouncementMutation = useMutation({
    mutationFn: ({ announcementId, isPinned }: { announcementId: string; isPinned: boolean }) =>
      api.patch(`/contests/${id}/announcements/${announcementId}/pin`, { isPinned }),
    onSuccess: (_response, variables) => {
      toast.success(variables.isPinned ? 'Announcement pinned' : 'Announcement unpinned');
      qc.invalidateQueries({ queryKey: ['contest-announcements', id] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed'),
  });

  const freezeMutation = useMutation({
    mutationFn: (frozen: boolean) => api.patch(`/contests/${id}/freeze`, { frozen }),
    onSuccess: () => {
      toast.success('Standings freeze updated');
      qc.invalidateQueries({ queryKey: ['contest', id] });
      qc.invalidateQueries({ queryKey: ['contest-standings', id] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed'),
  });

  const problems: any[] = [...(contest?.problems ?? [])]
    .sort((a: any, b: any) => (a?.orderIndex ?? 0) - (b?.orderIndex ?? 0));
  const selectedSubmission = useMemo(
    () => (submissions as any[]).find((submission: any) => submission.id === selectedSubmissionId) ?? null,
    [submissions, selectedSubmissionId],
  );
  const standingRows: any[] = standings?.rows ?? [];
  const standingProblems: any[] = standings?.problems ?? [];
  const isFreezeActive = Boolean(standings?.isFrozen);
  const isIcpcStanding = contest?.type === 'icpc';
  const standingTableMinWidth = Math.max(
    920,
    80 + 288 + 112 + (isIcpcStanding ? 112 : 0) + standingProblems.length * 112,
  );

  const getStandingProblemCell = (row: any, label: string) => {
    const fromList = (row?.problems ?? []).find((problem: any) => problem?.label === label);
    if (fromList) return fromList;

    const fromStatus = row?.problemStatus?.[label];
    if (!fromStatus) {
      return { accepted: false, wrongAttempts: 0, attempts: 0, acceptedAtMinute: null };
    }

    return {
      accepted: Boolean(fromStatus.accepted),
      wrongAttempts: Number(fromStatus.tries ?? 0),
      attempts: Number(fromStatus.attempts ?? fromStatus.tries ?? 0),
      acceptedAtMinute: fromStatus.acceptedAtMinute ?? null,
      isFirstSolve: Boolean(fromStatus.isFirstSolve),
      score: fromStatus.score ?? null,
    };
  };

  const formatAcceptedText = (minute: number | null | undefined, wrongAttempts: number) => {
    const safeMinute = Math.max(0, Number(minute ?? 0));
    if ((wrongAttempts ?? 0) <= 0) return `${safeMinute}`;
    return `${safeMinute}(+${wrongAttempts})`;
  };

  const pendingClarifications = useMemo(
    () => (clarifications as any[]).filter((item: any) => item.status === 'open'),
    [clarifications],
  );
  const ignoredClarifications = useMemo(
    () => (clarifications as any[]).filter((item: any) => item.status === 'closed'),
    [clarifications],
  );
  const answeredClarifications = useMemo(
    () => (clarifications as any[]).filter((item: any) => item.status === 'answered'),
    [clarifications],
  );
  const sortedAnnouncements = useMemo(
    () => [...(announcements as any[])].sort((left: any, right: any) => {
      if (Boolean(left.isPinned) !== Boolean(right.isPinned)) return left.isPinned ? -1 : 1;
      return new Date(right.createdAt ?? 0).getTime() - new Date(left.createdAt ?? 0).getTime();
    }),
    [announcements],
  );

  const tabs: Array<{ key: ContestTab; label: string; icon: typeof ClipboardList; badge?: number }> = [
    { key: 'problems', label: 'Problems', icon: ClipboardList },
    { key: 'status', label: 'Status', icon: BarChart3 },
    { key: 'standings', label: 'Standings', icon: Trophy },
    { key: 'clarifications', label: 'Clarifications', icon: HelpCircle, badge: pendingClarifications.length },
    { key: 'announcements', label: 'Announcements', icon: Bell },
  ];

  const tabHref = (tab: ContestTab) => `/contests/${id}/${tab}`;

  const formatHms = (totalSeconds: number) => {
    const clamped = Math.max(0, totalSeconds);
    const hrs = Math.floor(clamped / 3600).toString().padStart(2, '0');
    const mins = Math.floor((clamped % 3600) / 60).toString().padStart(2, '0');
    const secs = Math.floor(clamped % 60).toString().padStart(2, '0');
    return `${hrs}:${mins}:${secs}`;
  };

  const remainingSeconds = useMemo(() => {
    if (!contest?.startTime || !contest?.endTime) return 0;
    const start = new Date(contest.startTime).getTime();
    const end = new Date(contest.endTime).getTime();
    if (nowMs < start) return Math.floor((start - nowMs) / 1000);
    if (nowMs > end) return 0;
    return Math.floor((end - nowMs) / 1000);
  }, [contest?.startTime, contest?.endTime, nowMs]);

  const remainingLabel = useMemo(() => {
    if (!contest?.startTime || !contest?.endTime) return 'Ended';
    const start = new Date(contest.startTime).getTime();
    const end = new Date(contest.endTime).getTime();
    if (nowMs < start) return `Starts In: ${formatHms(remainingSeconds)}`;
    if (nowMs > end) return 'Ended';
    return `Remaining: ${formatHms(remainingSeconds)}`;
  }, [contest?.startTime, contest?.endTime, nowMs, remainingSeconds]);

  return (
    <AppShell>
      <div className="oj-page">
        <section className="oj-hero mb-6 p-6 sm:p-7">
          <div className="relative z-10 flex flex-wrap items-end justify-between gap-6">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.18em] text-teal-50 ring-1 ring-white/20">
                Contest Operations
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{contest?.title ?? 'Contest'}</h1>
              <p className="mt-2 text-sm font-semibold text-teal-50/85">{contest?.type} · #{contest?.contestNumber ?? '—'}</p>
            </div>
            <div className="rounded-2xl bg-white/12 px-5 py-4 text-right ring-1 ring-white/20">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-50/70">Clock</p>
              <p className="mt-1 text-xl font-extrabold">{remainingLabel}</p>
            </div>
          </div>
          <div className="relative z-10 mt-6 grid gap-3 sm:grid-cols-4">
            <div className="rounded-2xl bg-white/12 p-4 ring-1 ring-white/20">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-50/70">Problems</p>
              <p className="mt-1 text-2xl font-extrabold">{problems.length}</p>
            </div>
            <div className="rounded-2xl bg-white/12 p-4 ring-1 ring-white/20">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-50/70">Submissions</p>
              <p className="mt-1 text-2xl font-extrabold">{(submissions as any[]).length}</p>
            </div>
            <div className="rounded-2xl bg-white/12 p-4 ring-1 ring-white/20">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-50/70">Clarifications</p>
              <p className="mt-1 text-2xl font-extrabold">{pendingClarifications.length}</p>
            </div>
            <div className="rounded-2xl bg-white/12 p-4 ring-1 ring-white/20">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-50/70">Standing</p>
              <p className="mt-1 text-2xl font-extrabold">{isFreezeActive ? 'Frozen' : 'Live'}</p>
            </div>
          </div>
        </section>

        <div className="mb-6 rounded-3xl border border-white/80 bg-white/80 p-2 shadow-lg shadow-slate-900/5 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => navigate(tabHref(tab.key))}
                    className={`inline-flex items-center gap-2 whitespace-nowrap rounded-2xl px-4 py-2.5 text-sm font-extrabold transition-all ${
                      activeTab === tab.key
                        ? 'bg-teal-700 text-white shadow-lg shadow-teal-900/15'
                        : 'text-slate-600 hover:bg-white hover:text-teal-700'
                    }`}
                  >
                    <Icon size={16} />
                    {tab.label}
                    {tab.key === 'clarifications' && (tab.badge ?? 0) > 0 && (
                      <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs text-white">
                        {tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-extrabold text-white">
              {remainingLabel}
            </div>
          </div>
        </div>

        {activeTab === 'problems' && (
          <div className="grid gap-5 xl:grid-cols-[1fr_20rem]">
            <section className="oj-panel overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <div>
                  <p className="oj-kicker"><ClipboardList size={14} /> Problems</p>
                  <h2 className="mt-2 text-xl font-extrabold text-slate-950">Contest Problem Set</h2>
                </div>
                <span className="oj-chip bg-teal-50 text-teal-700">{problems.length} added</span>
              </div>

              <div className="divide-y divide-slate-100">
                {problems.map((cp: any, index: number) => {
                  const rows: any[] = standingRows ?? [];
                  const label = contestProblemLabel(cp, index);
                  let solvedCount = 0;
                  let attemptCount = 0;
                  rows.forEach((row: any) => {
                    const problemStatus = row.problemStatus?.[label];
                    if (!problemStatus) return;
                    if (problemStatus.accepted) solvedCount += 1;
                    attemptCount += Number(problemStatus.tries ?? 0) + (problemStatus.accepted ? 1 : 0);
                  });

                  return (
                    <article key={cp.id} className="grid gap-4 px-5 py-4 transition-colors hover:bg-slate-50 md:grid-cols-[4rem_minmax(0,1fr)_11rem] md:items-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-lg font-extrabold text-white shadow-sm">
                        {label}
                      </div>
                      <div className="min-w-0">
                        <Link
                          to={`/contests/${id}/problems/${cp.problem?.problemCode ?? cp.problem?.id}`}
                          className="truncate text-lg font-extrabold text-slate-950 hover:text-teal-700"
                        >
                          {cp.problem?.title ?? 'Untitled Problem'}
                        </Link>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold text-slate-500">
                          <span className="rounded-full bg-slate-100 px-2.5 py-1">{cp.problem?.timeLimitMs ?? '—'} ms</span>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1">{cp.problem?.memoryLimitKb ?? '—'} KB</span>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1">Order {index + 1}</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-center">
                        <div className="rounded-2xl bg-teal-50 px-3 py-2">
                          <p className="text-lg font-extrabold text-teal-700">{solvedCount}</p>
                          <p className="text-[11px] font-bold uppercase tracking-wide text-teal-700/70">Solved</p>
                        </div>
                        <div className="rounded-2xl bg-slate-100 px-3 py-2">
                          <p className="text-lg font-extrabold text-slate-800">{attemptCount}</p>
                          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Attempts</p>
                        </div>
                      </div>
                    </article>
                  );
                })}
                {!problems.length && (
                  <p className="px-5 py-12 text-center text-sm font-semibold text-slate-400">No problems added yet.</p>
                )}
              </div>
            </section>

            <aside className="space-y-5">
              <section className="oj-panel p-5">
                <p className="oj-kicker"><Trophy size={14} /> Top Teams</p>
                <div className="mt-4 space-y-2">
                  {standingRows.slice(0, 5).map((row: any, idx: number) => (
                    <div key={row.participantId ?? idx} className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate font-extrabold text-slate-800">{idx + 1}. {row.participantName ?? row.participantId}</span>
                        <span className="shrink-0 font-extrabold text-teal-700">{isIcpcStanding ? row.solved ?? 0 : row.totalScore ?? row.scores ?? 0}</span>
                      </div>
                      <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-400">{row.universityName ?? 'University not set'}</p>
                    </div>
                  ))}
                  {!standingRows.length && (
                    <p className="rounded-2xl border border-dashed border-slate-200 py-8 text-center text-xs font-semibold text-slate-400">No standing data yet.</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => navigate(tabHref('standings'))}
                  className="oj-btn-secondary mt-4 w-full px-3 py-2 text-xs"
                >
                  Go to Full Standings
                </button>
              </section>
            </aside>
          </div>
        )}

        {activeTab === 'status' && (
          <div className="oj-panel mb-6 overflow-hidden">
            <h2 className="border-b border-slate-100 px-5 py-4 font-extrabold text-slate-950">All Submissions ({(submissions as any[]).length})</h2>
            <div className="overflow-x-auto">
            <table className="oj-table">
              <thead>
                <tr>
                  {['ID', 'Who', 'Problem', 'When', 'Lang', 'Verdict', 'Time', 'Memory', 'Action'].map(h => (
                    <th key={h} className="px-4 py-2 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(submissions as any[]).map((sub: any) => (
                  <tr key={sub.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-mono text-xs">
                      <button
                        type="button"
                        onClick={() => setSelectedSubmissionId(sub.id)}
                        className="font-bold text-teal-700 hover:underline"
                      >
                        {sub.submissionDisplayId}
                      </button>
                    </td>
                    <td className="px-4 py-2.5">{sub.participantName ?? sub.participantId}</td>
                    <td className="px-4 py-2.5">{sub.contestProblem?.label ?? '—'}. {sub.contestProblem?.problem?.title ?? 'Untitled Problem'}</td>
                    <td className="px-4 py-2.5 text-slate-500">{new Date(sub.submittedAt).toLocaleString()}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{sub.language}</td>
                    <td className="px-4 py-2.5">
                      {(() => {
                        const effectiveVerdict = getEffectiveVerdict(sub);
                        return (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${VERDICT_COLOR[effectiveVerdict] ?? 'bg-slate-100 text-slate-600'}`}>
                            {effectiveVerdict}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-2.5">{sub.executionTimeMs != null ? `${sub.executionTimeMs} ms` : '—'}</td>
                    <td className="px-4 py-2.5">{sub.memoryUsedKb != null ? `${sub.memoryUsedKb} KB` : '—'}</td>
                    <td className="px-4 py-2.5">
                      {gradingId === sub.id ? (
                        <form onSubmit={gradeForm.handleSubmit(d => gradeMutation.mutate({ subId: sub.id, d }))}
                          className="flex gap-1 items-center">
                          <select {...gradeForm.register('manualVerdict')} className="px-2 py-1 border border-slate-300 rounded text-xs">
                            <option value="">Verdict</option>
                            {VERDICTS.map(v => <option key={v} value={v}>{v}</option>)}
                          </select>
                          <input type="number" {...gradeForm.register('score')} placeholder="Score"
                            className="w-14 px-2 py-1 border border-slate-300 rounded text-xs" />
                          <button type="submit" className="px-2 py-1 bg-teal-700 text-white rounded text-xs">✓</button>
                          <button type="button" onClick={() => setGradingId(null)} className="px-1 py-1 border rounded text-xs">✕</button>
                        </form>
                      ) : (
                        <button onClick={() => setGradingId(sub.id)} className="text-xs px-2 py-1 border border-slate-300 rounded hover:bg-slate-50">Grade</button>
                      )}
                    </td>
                  </tr>
                ))}
                {!(submissions as any[]).length && (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No submissions yet</td></tr>
                )}
              </tbody>
            </table>
            </div>
          </div>
        )}

        {activeTab === 'standings' && (
          <div className="space-y-4">
            <div className="oj-panel flex flex-wrap items-center justify-between gap-4 p-5">
              <div>
                <p className="oj-kicker"><Snowflake size={14} /> Standings</p>
                <h2 className="mt-3 text-xl font-extrabold text-slate-950">{isIcpcStanding ? 'ICPC Leaderboard' : 'Score Leaderboard'}</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">{standingRows.length} participants · {standingProblems.length} problems</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {isFreezeActive && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-3 py-2 text-sm font-extrabold text-sky-700">
                    <Snowflake size={14} />
                    Frozen
                  </span>
                )}
                {isFreezeActive && (
                  <button
                    type="button"
                    onClick={() => freezeMutation.mutate(false)}
                    className="oj-btn-primary px-3 py-2 text-sm"
                  >
                    Unfreeze
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => refetchStandings()}
                  disabled={standingsFetching}
                  className="oj-btn-secondary cursor-pointer px-3 py-2 text-sm disabled:opacity-50"
                >
                  <RefreshCw size={14} className={standingsFetching ? 'animate-spin' : ''} />
                  Refresh
                </button>
              </div>
            </div>
            <div className="oj-panel overflow-hidden">
              <div className="overflow-x-auto oj-scrollbar">
                <table className="w-full border-separate border-spacing-0 text-sm" style={{ minWidth: standingTableMinWidth }}>
                  <thead className="bg-slate-50">
                  <tr>
                    <th className="sticky left-0 z-20 w-20 border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs font-extrabold uppercase tracking-wide text-slate-500">Rank</th>
                    <th className="sticky left-20 z-20 w-72 border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs font-extrabold uppercase tracking-wide text-slate-500">Participant</th>
                    <th className="w-28 border-b border-slate-200 px-4 py-3 text-center text-xs font-extrabold uppercase tracking-wide text-slate-500">{isIcpcStanding ? 'Solved' : 'Score'}</th>
                    {isIcpcStanding && (
                      <th className="w-28 border-b border-slate-200 px-4 py-3 text-center text-xs font-extrabold uppercase tracking-wide text-slate-500">Penalty</th>
                    )}
                    {standingProblems.map((problem: any) => (
                      <th key={problem.label} className="w-28 border-b border-slate-200 px-3 py-3 text-center">
                        <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950 text-sm font-extrabold text-white">{problem.label}</div>
                        <div className="mt-1 text-[11px] font-bold text-slate-500">{problem.solvedCount ?? 0}/{problem.attemptsCount ?? 0}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {standingRows.map((row: any, idx: number) => (
                    <tr key={row.participantId ?? idx} className="group">
                      <td className="sticky left-0 z-10 border-b border-slate-100 bg-white px-4 py-3 font-extrabold text-slate-700 group-hover:bg-slate-50">{row.rank ?? idx + 1}</td>
                      <td className="sticky left-20 z-10 border-b border-slate-100 bg-white px-4 py-3 group-hover:bg-slate-50">
                        <div className="max-w-64 truncate font-extrabold text-slate-900">{row.participantName ?? row.participantId}</div>
                        <div className="mt-0.5 max-w-64 truncate text-[11px] font-semibold text-slate-400">{row.universityName ?? 'University not set'}</div>
                      </td>
                      {isIcpcStanding ? (
                        <>
                          <td className="border-b border-slate-100 px-4 py-3 text-center font-extrabold text-teal-700 tabular-nums">{row.solved ?? 0}</td>
                          <td className="border-b border-slate-100 px-4 py-3 text-center font-bold text-slate-600 tabular-nums">{row.totalPenalty ?? row.penalty ?? 0}</td>
                          {standingProblems.map((problem: any) => {
                            const problemCell = getStandingProblemCell(row, problem.label);
                            return (
                              <td key={problem.label} className="border-b border-slate-100 px-3 py-3 text-center align-middle tabular-nums">
                                {problemCell.accepted ? (
                                  <div className={`mx-auto inline-flex min-w-16 flex-col items-center rounded-xl px-2 py-1.5 text-xs font-extrabold ${problemCell.isFirstSolve ? 'bg-amber-50 text-amber-700' : 'bg-teal-50 text-teal-700'}`}>
                                    {problemCell.isFirstSolve ? <span className="text-sm leading-none">★</span> : <CheckCircle2 size={14} />}
                                    <span className="mt-1">
                                      {formatAcceptedText(problemCell.acceptedAtMinute, problemCell.wrongAttempts ?? 0)}
                                    </span>
                                  </div>
                                ) : (problemCell.wrongAttempts ?? 0) > 0 ? (
                                  <span className="inline-flex min-w-10 justify-center rounded-full bg-rose-50 px-2 py-1 text-xs font-extrabold text-rose-700">-{problemCell.wrongAttempts}</span>
                                ) : <span className="text-slate-300">—</span>}
                              </td>
                            );
                          })}
                        </>
                      ) : (
                        <>
                          <td className="border-b border-slate-100 px-4 py-3 text-center font-extrabold text-teal-700 tabular-nums">{row.totalScore ?? row.scores ?? 0}</td>
                          {standingProblems.map((problem: any) => {
                            const problemCell = getStandingProblemCell(row, problem.label);
                            return (
                              <td key={problem.label} className="border-b border-slate-100 px-3 py-3 text-center text-xs tabular-nums">
                                {problemCell.score != null ? <span className="inline-flex min-w-12 justify-center rounded-full bg-teal-50 px-2 py-1 font-extrabold text-teal-700">{problemCell.score}</span> : <span className="text-slate-300">—</span>}
                              </td>
                            );
                          })}
                        </>
                      )}
                    </tr>
                  ))}
                  {!standingRows.length && (
                    <tr><td colSpan={3 + (isIcpcStanding ? 1 : 0) + standingProblems.length} className="px-4 py-10 text-center text-sm font-semibold text-slate-400">No standings yet</td></tr>
                  )}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'clarifications' && (
          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <section className="oj-panel p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="oj-kicker"><MessageSquare size={14} /> Clarifications</p>
                  <h2 className="mt-3 text-xl font-extrabold text-slate-950">Pending Questions</h2>
                </div>
                <span className="oj-chip bg-rose-50 text-rose-700">{pendingClarifications.length} open</span>
              </div>

              <div className="space-y-3">
                {pendingClarifications.map((c: any) => (
                  <article key={c.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-extrabold text-slate-950">{c.question}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {c.participantName ?? c.participantId}
                          {c.contestProblemLabel ? ` · Problem ${c.contestProblemLabel}. ${c.contestProblemTitle ?? 'Untitled Problem'}` : ''}
                        </p>
                      </div>
                      <span className="oj-chip bg-amber-50 text-amber-700">Open</span>
                    </div>
                    <textarea
                      value={answerText[c.id] ?? ''}
                      onChange={(e) => setAnswerText((prev) => ({ ...prev, [c.id]: e.target.value }))}
                      placeholder="Write answer"
                      rows={3}
                      className="oj-textarea mt-3 resize-none"
                    />
                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => ignoreMutation.mutate(c.id)}
                        className="oj-btn-secondary px-3 py-2 text-xs"
                      >
                        <XCircle size={14} />
                        Ignore
                      </button>
                      <button
                        type="button"
                        onClick={() => answerMutation.mutate({ clarId: c.id, answer: answerText[c.id] ?? '' })}
                        disabled={!answerText[c.id]?.trim()}
                        className="oj-btn-primary px-3 py-2 text-xs disabled:opacity-50"
                      >
                        <Send size={14} />
                        Answer
                      </button>
                    </div>
                  </article>
                ))}
                {!pendingClarifications.length && (
                  <p className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm font-semibold text-slate-400">No pending clarifications.</p>
                )}
              </div>
            </section>

            <div className="space-y-4">
              <section className="oj-panel p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-700">Answered</h2>
                  <span className="oj-chip bg-teal-50 text-teal-700">{answeredClarifications.length}</span>
                </div>
                <div className="space-y-3">
                  {answeredClarifications.map((c: any) => (
                    <article key={c.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-extrabold text-slate-900">{c.question}</p>
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            {c.participantName ?? c.participantId}
                            {c.contestProblemLabel ? ` · Problem ${c.contestProblemLabel}` : ''}
                          </p>
                        </div>
                        {editingAnswerId !== c.id && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingAnswerId(c.id);
                              setAnswerText((prev) => ({ ...prev, [c.id]: prev[c.id] ?? c.answer ?? '' }));
                            }}
                            className="oj-btn-secondary px-3 py-2 text-xs"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                      {editingAnswerId === c.id ? (
                        <div className="mt-3 space-y-2">
                          <textarea
                            value={answerText[c.id] ?? c.answer ?? ''}
                            onChange={(e) => setAnswerText((prev) => ({ ...prev, [c.id]: e.target.value }))}
                            placeholder="Edit answer"
                            rows={3}
                            className="oj-textarea resize-none bg-white"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingAnswerId(null)}
                              className="oj-btn-secondary px-3 py-2 text-xs"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => answerMutation.mutate({ clarId: c.id, answer: answerText[c.id] ?? c.answer ?? '' })}
                              disabled={!((answerText[c.id] ?? c.answer ?? '').trim())}
                              className="oj-btn-primary px-3 py-2 text-xs disabled:opacity-50"
                            >
                              Commit
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 rounded-xl bg-white px-3 py-2 text-sm font-semibold leading-6 text-slate-700">
                          {c.answer ?? '—'}
                          {c.answerEditedAt && (
                            <span className="ml-2 align-middle text-xs font-extrabold text-amber-700">edited</span>
                          )}
                        </div>
                      )}
                    </article>
                  ))}
                  {!answeredClarifications.length && (
                    <p className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm font-semibold text-slate-400">No answered clarifications.</p>
                  )}
                </div>
              </section>

              <section className="oj-panel p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-700">Ignored</h2>
                  <span className="oj-chip bg-slate-100 text-slate-600">{ignoredClarifications.length}</span>
                </div>
                <div className="space-y-3">
                  {ignoredClarifications.map((c: any) => (
                    <article key={c.id} className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-extrabold text-slate-900">{c.question}</p>
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            {c.participantName ?? c.participantId}
                            {c.contestProblemLabel ? ` · Problem ${c.contestProblemLabel}` : ''}
                          </p>
                        </div>
                        {answeringIgnoredId !== c.id && (
                          <button
                            type="button"
                            onClick={() => {
                              setAnsweringIgnoredId(c.id);
                              setAnswerText((prev) => ({ ...prev, [c.id]: prev[c.id] ?? '' }));
                            }}
                            className="oj-btn-secondary px-3 py-2 text-xs"
                          >
                            Answer now
                          </button>
                        )}
                      </div>
                      {answeringIgnoredId === c.id && (
                        <div className="mt-3 space-y-2">
                          <textarea
                            value={answerText[c.id] ?? ''}
                            onChange={(e) => setAnswerText((prev) => ({ ...prev, [c.id]: e.target.value }))}
                            placeholder="Write answer"
                            rows={3}
                            className="oj-textarea resize-none"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setAnsweringIgnoredId(null)}
                              className="oj-btn-secondary px-3 py-2 text-xs"
                            >
                              Cancel
                            </button>
                        <button
                          type="button"
                          onClick={() => answerMutation.mutate({ clarId: c.id, answer: answerText[c.id] ?? '' })}
                          disabled={!answerText[c.id]?.trim()}
                          className="oj-btn-primary px-3 py-2 text-xs disabled:opacity-50"
                        >
                          Answer
                        </button>
                          </div>
                        </div>
                      )}
                    </article>
                  ))}
                  {!ignoredClarifications.length && (
                    <p className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm font-semibold text-slate-400">No ignored clarifications.</p>
                  )}
                </div>
              </section>
            </div>
          </div>
        )}

        {activeTab === 'announcements' && (
          <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
            <section className="oj-panel p-5">
              <p className="oj-kicker"><Bell size={14} /> Broadcast</p>
              <h2 className="mt-3 text-xl font-extrabold text-slate-950">New Announcement</h2>
              <form onSubmit={announcementForm.handleSubmit(d => announceMutation.mutate(d))} className="mt-4 space-y-3">
                <input {...announcementForm.register('title')} placeholder="Announcement title" className="oj-input" />
                <textarea {...announcementForm.register('body')} placeholder="Body" rows={5} className="oj-textarea resize-none" />
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
                  <span className="inline-flex items-center gap-2">
                    <Pin size={14} />
                    Pinned
                  </span>
                  <input type="checkbox" {...announcementForm.register('isPinned')} />
                </label>
                <button type="submit" disabled={announceMutation.isPending}
                  className="oj-btn-primary w-full disabled:opacity-50">
                  <Send size={15} />
                  {announceMutation.isPending ? 'Posting...' : 'Post Announcement'}
                </button>
              </form>
            </section>

            <section className="oj-panel p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="oj-kicker"><Archive size={14} /> History</p>
                  <h2 className="mt-3 text-xl font-extrabold text-slate-950">Announcements</h2>
                </div>
                <span className="oj-chip bg-slate-100 text-slate-600">{sortedAnnouncements.length} total</span>
              </div>
              <div className="space-y-3">
                {sortedAnnouncements.map((announcement: any) => (
                  <article key={announcement.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-extrabold text-slate-950">{announcement.title}</p>
                          {announcement.isPinned && (
                            <span className="oj-chip bg-amber-50 text-amber-700"><Pin size={12} /> Pinned</span>
                          )}
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-600">{announcement.body}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <span className="text-xs font-semibold text-slate-400">{new Date(announcement.createdAt).toLocaleString()}</span>
                        <button
                          type="button"
                          onClick={() => pinAnnouncementMutation.mutate({ announcementId: announcement.id, isPinned: !announcement.isPinned })}
                          disabled={pinAnnouncementMutation.isPending}
                          className="oj-btn-secondary px-3 py-1.5 text-xs disabled:opacity-50"
                        >
                          <Pin size={13} />
                          {announcement.isPinned ? 'Unpin' : 'Pin'}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
                {!sortedAnnouncements.length && (
                  <p className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm font-semibold text-slate-400">No announcements yet.</p>
                )}
              </div>
            </section>
          </div>
        )}

        <Modal
          open={!!selectedSubmission}
          title={selectedSubmission ? `Submission #${selectedSubmission.submissionDisplayId}` : 'Submission'}
          onClose={() => setSelectedSubmissionId(null)}
        >
          {selectedSubmission && (
            <div className="space-y-3 text-sm">
              <p><span className="font-semibold">Problem:</span> {selectedSubmission.contestProblem?.label ?? '—'}. {selectedSubmission.contestProblem?.problem?.title ?? 'Untitled Problem'}</p>
              <p><span className="font-semibold">Language:</span> {selectedSubmission.language ?? '—'}</p>
              <p><span className="font-semibold">Status:</span> {getEffectiveVerdict(selectedSubmission)}</p>
              <p><span className="font-semibold">Submitted:</span> {new Date(selectedSubmission.submittedAt).toLocaleString()}</p>
              {selectedSubmission.code ? (
                <div>
                  <p className="mb-1 font-semibold">Code</p>
                  <CodePreview
                    code={selectedSubmission.code}
                    language={selectedSubmission.language}
                    height="50vh"
                    name={`judge-submission-${selectedSubmission.id}`}
                  />
                </div>
              ) : (
                <p className="text-slate-500">No inline code. File upload submission.</p>
              )}
              <p className="text-xs font-semibold text-slate-500">Submission opens here for judges to avoid leaving the control room.</p>
            </div>
          )}
        </Modal>
      </div>
    </AppShell>
  );
}
