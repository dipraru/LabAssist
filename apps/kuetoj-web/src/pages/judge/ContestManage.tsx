import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';

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

const VERDICTS = ['accepted', 'wrong_answer', 'time_limit_exceeded', 'memory_limit_exceeded', 'runtime_error', 'presentation_error', 'partial'];

const VERDICT_COLOR: Record<string, string> = {
  accepted: 'bg-green-100 text-green-700',
  wrong_answer: 'bg-red-100 text-red-700',
  pending: 'bg-amber-100 text-amber-700',
  manual_review: 'bg-blue-100 text-blue-700',
};

export function ContestManage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [gradingId, setGradingId] = useState<string | null>(null);
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
  });

  const { data: clarifications = [] } = useQuery({
    queryKey: ['contest-clarifications', id],
    queryFn: () => api.get(`/contests/${id}/clarifications/all`).then(r => r.data),
  });

  const { data: announcements = [] } = useQuery({
    queryKey: ['contest-announcements', id],
    queryFn: () => api.get(`/contests/${id}/announcements`).then(r => r.data),
  });

  const { data: standings, refetch: refetchStandings, isFetching: standingsFetching } = useQuery({
    queryKey: ['contest-standings', id],
    queryFn: () => api.get(`/contests/${id}/standings`).then(r => r.data),
    refetchInterval: 30000,
  });

  const gradeForm = useForm<GradeInput, unknown, GradeData>({ resolver: zodResolver(gradeSchema) });
  const announcementForm = useForm<AnnouncementData>({ resolver: zodResolver(announcementSchema) });

  const gradeMutation = useMutation({
    mutationFn: ({ subId, d }: { subId: string; d: GradeData }) =>
      api.patch(`/contests/submissions/${subId}/grade`, {
        verdict: d.manualVerdict,
        score: d.score,
      }),
    onSuccess: () => { toast.success('Graded!'); qc.invalidateQueries({ queryKey: ['contest-submissions'] }); setGradingId(null); gradeForm.reset(); },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed'),
  });

  const answerMutation = useMutation({
    mutationFn: ({ clarId, answer }: { clarId: string; answer: string }) =>
      api.patch(`/contests/clarifications/${clarId}/answer`, { answer }),
    onSuccess: () => {
      toast.success('Saved');
      qc.invalidateQueries({ queryKey: ['contest-clarifications', id] });
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

  const freezeMutation = useMutation({
    mutationFn: (frozen: boolean) => api.patch(`/contests/${id}/freeze`, { frozen }),
    onSuccess: () => {
      toast.success('Standings freeze updated');
      qc.invalidateQueries({ queryKey: ['contest', id] });
      qc.invalidateQueries({ queryKey: ['contest-standings', id] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed'),
  });

  const problems: any[] = contest?.problems ?? [];
  const standingRows: any[] = standings?.rows ?? [];
  const standingProblems: any[] = standings?.problems ?? [];
  const isFreezeActive = Boolean(standings?.isFrozen);

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

  const tabs: Array<{ key: ContestTab; label: string; badge?: number }> = [
    { key: 'problems', label: 'Problems' },
    { key: 'status', label: 'Status' },
    { key: 'standings', label: 'Standings' },
    { key: 'clarifications', label: 'Clarifications', badge: pendingClarifications.length },
    { key: 'announcements', label: 'Announcements' },
  ];

  const tabHref = (tab: ContestTab) => `/judge/contests/${id}/${tab}`;

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
      <div className="w-full">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold text-slate-900">{contest?.title ?? 'Contest'}</h1>
          <p className="text-sm text-slate-500 mt-1">{contest?.type} · #{contest?.contestNumber ?? '—'}</p>
        </div>

        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => navigate(tabHref(tab.key))}
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${
                    activeTab === tab.key
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                  {tab.key === 'clarifications' && (tab.badge ?? 0) > 0 && (
                    <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs text-white">
                      {tab.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-semibold">
              {remainingLabel}
            </div>
          </div>
        </div>

        {activeTab === 'problems' && (
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 lg:col-span-9 bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
              <h2 className="font-semibold px-5 py-3 border-b border-slate-100">Problems</h2>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left">#</th>
                    <th className="px-4 py-3 text-left">Problem</th>
                    <th className="px-4 py-3 text-left">Solved/Attempt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {problems.map((cp: any) => {
                    const rows: any[] = standingRows ?? [];
                    const label = cp.label;
                    let solvedCount = 0;
                    let attemptCount = 0;
                    rows.forEach((row: any) => {
                      const problemStatus = row.problemStatus?.[label];
                      if (!problemStatus) return;
                      if (problemStatus.accepted) solvedCount += 1;
                      attemptCount += (problemStatus.tries ?? 0) + (problemStatus.accepted ? 1 : 0);
                    });

                    return (
                      <tr key={cp.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-semibold text-slate-700">{cp.label}</td>
                        <td className="px-4 py-3">
                          <Link
                            to={`/judge/contests/${id}/problems/${cp.problem?.problemCode ?? cp.problem?.id}`}
                            className="font-semibold text-indigo-700 hover:underline"
                          >
                            {cp.problem?.title ?? '—'}
                          </Link>
                          <div className="text-xs text-slate-500">
                            {cp.problem?.timeLimitMs ?? '—'} ms · {cp.problem?.memoryLimitKb ?? '—'} KB
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{solvedCount}/{attemptCount}</td>
                      </tr>
                    );
                  })}
                  {!problems.length && (
                    <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-400">No problems added yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="col-span-12 lg:col-span-3">
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                <h3 className="text-sm font-semibold text-slate-800 mb-3">Short Standings</h3>
                <div className="space-y-2">
                  {standingRows.slice(0, 5).map((row: any, idx: number) => (
                    <div key={row.participantId ?? idx} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs">
                      <span className="font-medium text-slate-700">{idx + 1}. {row.participantName ?? row.participantId}</span>
                      <span className="text-slate-500">{row.solved ?? 0}</span>
                    </div>
                  ))}
                  {!standingRows.length && (
                    <p className="text-xs text-slate-400">No standing data yet.</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => navigate(tabHref('standings'))}
                  className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Go to Full Standings
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'status' && (
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden mb-6">
            <h2 className="font-semibold px-5 py-3 border-b border-slate-100">All Submissions ({(submissions as any[]).length})</h2>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  {['Participant', 'Problem', 'Language', 'Verdict', 'Score', 'Action'].map(h => (
                    <th key={h} className="px-4 py-2 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(submissions as any[]).map((sub: any) => (
                  <tr key={sub.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5">{sub.participantName ?? sub.participantId}</td>
                    <td className="px-4 py-2.5">{sub.contestProblem?.label ?? '—'}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{sub.language}</td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${VERDICT_COLOR[sub.submissionStatus] ?? 'bg-slate-100 text-slate-600'}`}>
                        {sub.manualVerdict ?? sub.submissionStatus}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">{sub.score ?? '—'}</td>
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
                          <button type="submit" className="px-2 py-1 bg-indigo-600 text-white rounded text-xs">✓</button>
                          <button type="button" onClick={() => setGradingId(null)} className="px-1 py-1 border rounded text-xs">✕</button>
                        </form>
                      ) : (
                        <button onClick={() => setGradingId(sub.id)} className="text-xs px-2 py-1 border border-slate-300 rounded hover:bg-slate-50">Grade</button>
                      )}
                    </td>
                  </tr>
                ))}
                {!(submissions as any[]).length && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No submissions yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'standings' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => refetchStandings()}
                  disabled={standingsFetching}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <RefreshCw size={14} className={standingsFetching ? 'animate-spin' : ''} />
                    Refresh
                  </span>
                </button>
                {isFreezeActive && (
                  <button
                    type="button"
                    onClick={() => freezeMutation.mutate(false)}
                    className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
                  >
                    Unfreeze Standings
                  </button>
                )}
              </div>
              {isFreezeActive && (
                <div className="px-3 py-2 rounded-lg bg-blue-100 text-blue-700 text-sm font-semibold">
                  Frozen
                </div>
              )}
            </div>
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left">#</th>
                    <th className="px-4 py-3 text-left">Participant</th>
                    {standingProblems.map((p: any) => (
                      <th key={p.label} className="px-3 py-3 text-center">{p.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {standingRows.map((row: any, idx: number) => (
                    <tr key={row.participantId ?? idx} className="hover:bg-slate-50">
                      <td className="px-4 py-3">{idx + 1}</td>
                      <td className="px-4 py-3 font-medium">{row.participantName ?? row.participantId}</td>
                      {standingProblems.map((p: any) => {
                        const status = row.problemStatus?.[p.label];
                        if (!status) return <td key={p.label} className="px-3 py-3 text-center text-slate-300">—</td>;
                        if (status.accepted) return <td key={p.label} className="px-3 py-3 text-center text-green-600">Solved</td>;
                        return <td key={p.label} className="px-3 py-3 text-center text-red-500">{status.tries ?? 0}</td>;
                      })}
                    </tr>
                  ))}
                  {!standingRows.length && (
                    <tr><td colSpan={2 + standingProblems.length} className="px-4 py-8 text-center text-slate-400">No standings yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'clarifications' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
              <h2 className="font-semibold px-5 py-3 border-b border-slate-100">Pending Questions ({pendingClarifications.length})</h2>
              <div className="divide-y divide-slate-100">
                {pendingClarifications.map((c: any) => (
                  <div key={c.id} className="px-5 py-4">
                    <p className="text-sm font-medium text-slate-800">{c.question}</p>
                    <p className="text-xs text-slate-500 mt-1">From: {c.participantName ?? c.participantId}</p>
                    <div className="mt-2 flex gap-2">
                      <input
                        value={answerText[c.id] ?? ''}
                        onChange={(e) => setAnswerText((prev) => ({ ...prev, [c.id]: e.target.value }))}
                        placeholder="Write answer"
                        className="flex-1 px-3 py-1.5 border border-slate-300 rounded text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => answerMutation.mutate({ clarId: c.id, answer: answerText[c.id] ?? '' })}
                        disabled={!answerText[c.id]?.trim()}
                        className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm disabled:opacity-50"
                      >
                        Answer
                      </button>
                      <button
                        type="button"
                        onClick={() => ignoreMutation.mutate(c.id)}
                        className="px-3 py-1.5 border border-slate-300 rounded text-sm hover:bg-slate-50"
                      >
                        Ignore
                      </button>
                    </div>
                  </div>
                ))}
                {!pendingClarifications.length && <p className="text-center text-slate-400 py-6">No pending clarifications</p>}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
              <h2 className="font-semibold px-5 py-3 border-b border-slate-100">Ignored Questions ({ignoredClarifications.length})</h2>
              <div className="divide-y divide-slate-100">
                {ignoredClarifications.map((c: any) => (
                  <div key={c.id} className="px-5 py-4">
                    <p className="text-sm font-medium text-slate-800">{c.question}</p>
                    <div className="mt-2 flex gap-2">
                      <input
                        value={answerText[c.id] ?? ''}
                        onChange={(e) => setAnswerText((prev) => ({ ...prev, [c.id]: e.target.value }))}
                        placeholder="Write answer"
                        className="flex-1 px-3 py-1.5 border border-slate-300 rounded text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => answerMutation.mutate({ clarId: c.id, answer: answerText[c.id] ?? '' })}
                        disabled={!answerText[c.id]?.trim()}
                        className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm disabled:opacity-50"
                      >
                        Answer
                      </button>
                    </div>
                  </div>
                ))}
                {!ignoredClarifications.length && <p className="text-center text-slate-400 py-6">No ignored clarifications</p>}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
              <h2 className="font-semibold px-5 py-3 border-b border-slate-100">Answered Questions ({answeredClarifications.length})</h2>
              <div className="divide-y divide-slate-100">
                {answeredClarifications.map((c: any) => (
                  <div key={c.id} className="px-5 py-4">
                    <p className="text-sm font-medium text-slate-800">{c.question}</p>
                    <p className="mt-2 text-sm text-green-700">Answer: {c.answer ?? '—'}</p>
                    <div className="mt-2 flex gap-2">
                      <input
                        value={answerText[c.id] ?? c.answer ?? ''}
                        onChange={(e) => setAnswerText((prev) => ({ ...prev, [c.id]: e.target.value }))}
                        placeholder="Edit answer"
                        className="flex-1 px-3 py-1.5 border border-slate-300 rounded text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => answerMutation.mutate({ clarId: c.id, answer: answerText[c.id] ?? c.answer ?? '' })}
                        disabled={!((answerText[c.id] ?? c.answer ?? '').trim())}
                        className="px-3 py-1.5 border border-slate-300 rounded text-sm hover:bg-slate-50 disabled:opacity-50"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                ))}
                {!answeredClarifications.length && <p className="text-center text-slate-400 py-6">No answered clarifications</p>}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'announcements' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-amber-200 shadow-sm p-5">
              <h2 className="font-semibold mb-3">Make Announcement</h2>
              <form onSubmit={announcementForm.handleSubmit(d => announceMutation.mutate(d))} className="space-y-3">
                <input {...announcementForm.register('title')} placeholder="Announcement title"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                <textarea {...announcementForm.register('body')} placeholder="Body (optional)" rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none" />
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="pinned" {...announcementForm.register('isPinned')} />
                  <label htmlFor="pinned" className="text-sm text-slate-700">Pinned</label>
                </div>
                <button type="submit" disabled={announceMutation.isPending}
                  className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50">Post</button>
              </form>
            </div>

            <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
              <h2 className="font-semibold px-5 py-3 border-b border-slate-100">Previous Announcements</h2>
              <div className="divide-y divide-slate-100">
                {(announcements as any[]).map((announcement: any) => (
                  <div key={announcement.id} className="px-5 py-4">
                    <p className="text-sm font-semibold text-slate-800">{announcement.title}</p>
                    <p className="mt-1 text-sm text-slate-600">{announcement.body}</p>
                    <p className="mt-2 text-xs text-slate-400">{new Date(announcement.createdAt).toLocaleString()}</p>
                  </div>
                ))}
                {!(announcements as any[]).length && <p className="text-center text-slate-400 py-6">No announcements yet</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
