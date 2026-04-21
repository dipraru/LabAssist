import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { CheckCircle2, Send } from 'lucide-react';
import { ParticipantContestNav } from '../../components/ParticipantContestNav';
import { ParticipantContestHeader } from '../../components/ParticipantContestHeader';
import { getSocket } from '../../lib/socket';

const schema = z.object({
  question: z.string().min(5, 'Question too short'),
  contestProblemId: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

export function AskClarification() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const { data: contest } = useQuery({
    queryKey: ['contest', id],
    queryFn: () => api.get(`/contests/${id}`).then(r => r.data),
  });

  const { data: myClarifications = [] } = useQuery({
    queryKey: ['my-clarifications', id],
    queryFn: () => api.get(`/contests/${id}/clarifications/mine`).then(r => r.data),
  });

  useEffect(() => {
    if (!id) return;
    const socket = getSocket();
    const refreshClarifications = () => {
      qc.invalidateQueries({ queryKey: ['my-clarifications', id] });
    };
    socket.on('clarification', refreshClarifications);
    return () => {
      socket.off('clarification', refreshClarifications);
    };
  }, [id, qc]);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const askMutation = useMutation({
    mutationFn: (d: FormData) => api.post(`/contests/${id}/clarifications`, d),
    onSuccess: () => {
      toast.success('Question submitted!');
      qc.invalidateQueries({ queryKey: ['my-clarifications'] });
      reset();
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed'),
  });

  const problems: any[] = [...(contest?.problems ?? contest?.contestProblems ?? [])]
    .sort((a, b) => (a?.orderIndex ?? 0) - (b?.orderIndex ?? 0));

  return (
    <AppShell>
      <div className="oj-page">
        {id && <ParticipantContestHeader contestId={id} />}
        {id && <ParticipantContestNav contestId={id} />}

        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="oj-panel p-5">
          <p className="oj-kicker"><Send size={14} /> Clarifications</p>
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-slate-950">Ask a Question</h1>
          <p className="mt-1 text-sm font-semibold text-slate-500">Send a private clarification to the judge panel.</p>
          <form onSubmit={handleSubmit(d => askMutation.mutate(d))} className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-bold text-slate-700">Problem (optional)</label>
              <select {...register('contestProblemId')} className="oj-select">
                <option value="">General question</option>
                {problems.map((cp: any, index: number) => {
                  const label = cp?.label ? String(cp.label).trim() : String.fromCharCode(65 + index);
                  return <option key={cp.id} value={cp.id}>{label}. {cp.problem?.title}</option>;
                })}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-bold text-slate-700">Your Question</label>
              <textarea {...register('question')} rows={3}
                className="oj-textarea resize-none"
                placeholder="Describe your question clearly..." />
              {errors.question && <p className="text-red-500 text-xs mt-1">{errors.question.message}</p>}
            </div>
            <button type="submit" disabled={isSubmitting}
              className="oj-btn-primary disabled:opacity-50">
              Submit Question
            </button>
          </form>
        </div>

        <div className="oj-panel p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-extrabold text-slate-950">My Questions</h2>
            <span className="oj-chip bg-slate-100 text-slate-600">{(myClarifications as any[]).length} total</span>
          </div>
        <div className="max-h-[640px] space-y-3 overflow-auto pr-1 oj-scrollbar">
          {(myClarifications as any[]).map((c: any) => (
            <div key={c.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <p className="text-sm font-medium text-slate-800">{c.question}</p>
                <span className={`ml-3 inline-flex flex-shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-extrabold ${
                  c.status === 'answered' ? 'bg-teal-100 text-teal-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {c.status === 'answered' && <CheckCircle2 size={12} />}
                  {c.status === 'answered' ? 'Answered' : c.status}
                </span>
              </div>
              {c.contestProblemLabel && (
                <p className="text-xs text-slate-500 mt-0.5">
                  Re: Problem {c.contestProblemLabel}. {c.contestProblemTitle ?? 'Untitled Problem'}
                </p>
              )}
              {c.answer ? (
                <div className="mt-3 rounded-2xl bg-teal-50 p-3 text-sm text-teal-900">
                  <p className="mb-0.5 flex flex-wrap items-center gap-2 text-xs font-bold text-teal-700">
                    <span>Judge's Answer{c.isBroadcast ? ' (Broadcast)' : ''}:</span>
                    {c.answerEditedAt && <span className="text-amber-700">edited</span>}
                  </p>
                  {c.answer}
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate-400 italic">Awaiting response…</p>
              )}
            </div>
          ))}
          {!(myClarifications as any[]).length && (
            <p className="rounded-3xl border border-dashed border-slate-200 bg-white/70 py-10 text-center text-sm font-semibold text-slate-400">No questions asked yet</p>
          )}
        </div>
        </div>
        </div>
      </div>
    </AppShell>
  );
}
