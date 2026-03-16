import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { Megaphone } from 'lucide-react';
import { ContestCountdownBar } from '../../components/ContestCountdownBar';

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

const VERDICTS = ['accepted', 'wrong_answer', 'time_limit_exceeded', 'memory_limit_exceeded', 'runtime_error', 'presentation_error', 'partial'];

const VERDICT_COLOR: Record<string, string> = {
  accepted: 'bg-green-100 text-green-700',
  wrong_answer: 'bg-red-100 text-red-700',
  pending: 'bg-amber-100 text-amber-700',
  manual_review: 'bg-blue-100 text-blue-700',
};

export function ContestManage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [gradingId, setGradingId] = useState<string | null>(null);
  const [showAnnouncement, setShowAnnouncement] = useState(false);

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
    queryFn: () => api.get(`/contests/${id}/clarifications/pending`).then(r => r.data),
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
    onSuccess: () => { toast.success('Answered!'); qc.invalidateQueries({ queryKey: ['contest-clarifications'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed'),
  });

  const announceMutation = useMutation({
    mutationFn: (d: AnnouncementData) => api.post(`/contests/${id}/announcements`, d),
    onSuccess: () => { toast.success('Announced!'); announcementForm.reset(); setShowAnnouncement(false); },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed'),
  });

  const [answerText, setAnswerText] = useState<{ [key: string]: string }>({});

  return (
    <AppShell>
      <div className="max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{contest?.title ?? 'Contest'}</h1>
            <p className="text-sm text-slate-500 mt-0.5">{contest?.type} · {contest?.status}</p>
          </div>
          <button onClick={() => setShowAnnouncement(!showAnnouncement)}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600">
            <Megaphone size={15} /> Announce
          </button>
        </div>

        {contest?.startTime && contest?.endTime && (
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 mb-6">
            <ContestCountdownBar startTime={contest.startTime} endTime={contest.endTime} />
          </div>
        )}

        {showAnnouncement && (
          <div className="bg-white rounded-xl border border-amber-200 shadow-sm p-5 mb-6">
            <h2 className="font-semibold mb-3">New Announcement</h2>
            <form onSubmit={announcementForm.handleSubmit(d => announceMutation.mutate(d))} className="space-y-3">
              <input {...announcementForm.register('title')} placeholder="Announcement title"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
              <textarea {...announcementForm.register('body')} placeholder="Body (optional)" rows={2}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none" />
              <div className="flex items-center gap-2">
                <input type="checkbox" id="pinned" {...announcementForm.register('isPinned')} />
                <label htmlFor="pinned" className="text-sm text-slate-700">Pinned</label>
              </div>
              <div className="flex gap-3">
                <button type="submit" disabled={announceMutation.isPending}
                  className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50">Post</button>
                <button type="button" onClick={() => setShowAnnouncement(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium">Cancel</button>
              </div>
            </form>
          </div>
        )}

        {/* Submissions */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden mb-6">
          <h2 className="font-semibold px-5 py-3 border-b border-slate-100">Submissions ({(submissions as any[]).length})</h2>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                {['Participant','Problem','Language','Verdict','Score','Action'].map(h => (
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
                      <div className="flex gap-2">
                        {sub.fileUrl && <a href={`/uploads/${sub.fileUrl}`} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:underline">View</a>}
                        <button onClick={() => setGradingId(sub.id)} className="text-xs px-2 py-1 border border-slate-300 rounded hover:bg-slate-50">Grade</button>
                      </div>
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

        {/* Clarifications */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <h2 className="font-semibold px-5 py-3 border-b border-slate-100">Clarifications ({(clarifications as any[]).length})</h2>
          <div className="divide-y divide-slate-100">
            {(clarifications as any[]).map((c: any) => (
              <div key={c.id} className="px-5 py-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{c.question}</p>
                    <p className="text-xs text-slate-500 mt-0.5">From: {c.participantName} · {c.status}</p>
                  </div>
                  <span className={`px-2 py-0.5 text-xs rounded-full ${c.status === 'open' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>{c.status}</span>
                </div>
                {c.answer ? (
                  <p className="mt-2 text-sm text-green-700 bg-green-50 rounded-lg p-2">✓ {c.answer}</p>
                ) : (
                  <div className="mt-2 flex gap-2">
                    <input value={answerText[c.id] ?? ''} onChange={e => setAnswerText(prev => ({ ...prev, [c.id]: e.target.value }))}
                      placeholder="Answer…" className="flex-1 px-3 py-1.5 border border-slate-300 rounded text-sm" />
                    <button onClick={() => answerMutation.mutate({ clarId: c.id, answer: answerText[c.id] ?? '' })}
                      disabled={!answerText[c.id]?.trim()}
                      className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50">Answer</button>
                  </div>
                )}
              </div>
            ))}
            {!(clarifications as any[]).length && <p className="text-center text-slate-400 py-6">No clarifications</p>}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
