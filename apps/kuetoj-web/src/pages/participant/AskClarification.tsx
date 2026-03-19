import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { Send } from 'lucide-react';
import { ParticipantContestNav } from '../../components/ParticipantContestNav';
import { ParticipantContestHeader } from '../../components/ParticipantContestHeader';

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
      <div className="w-full">
        {id && <ParticipantContestHeader contestId={id} />}
        {id && <ParticipantContestNav contestId={id} />}
        <h1 className="text-2xl font-bold text-slate-900 mb-6">Clarifications</h1>

        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 mb-6">
          <h2 className="font-semibold mb-4 flex items-center gap-2"><Send size={16} /> Ask a Question</h2>
          <form onSubmit={handleSubmit(d => askMutation.mutate(d))} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Problem (optional)</label>
              <select {...register('contestProblemId')} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
                <option value="">General question</option>
                {problems.map((cp: any, index: number) => {
                  const label = cp?.label ? String(cp.label).trim() : String.fromCharCode(65 + index);
                  return <option key={cp.id} value={cp.id}>{label}. {cp.problem?.title}</option>;
                })}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Your Question</label>
              <textarea {...register('question')} rows={3}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Describe your question clearly…" />
              {errors.question && <p className="text-red-500 text-xs mt-1">{errors.question.message}</p>}
            </div>
            <button type="submit" disabled={isSubmitting}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              Submit Question
            </button>
          </form>
        </div>

        <h2 className="font-semibold text-slate-800 mb-3">My Questions</h2>
        <div className="space-y-3">
          {(myClarifications as any[]).map((c: any) => (
            <div key={c.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
              <div className="flex items-start justify-between">
                <p className="text-sm font-medium text-slate-800">{c.question}</p>
                <span className={`ml-3 px-2 py-0.5 text-xs rounded-full flex-shrink-0 ${
                  c.status === 'answered' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                }`}>{c.status}</span>
              </div>
              {c.contestProblem && <p className="text-xs text-slate-500 mt-0.5">Re: Problem {c.contestProblem.label}</p>}
              {c.answer ? (
                <div className="mt-2 bg-green-50 rounded-lg p-3 text-sm text-green-800">
                  <p className="font-medium text-xs text-green-600 mb-0.5">Judge's Answer{c.isBroadcast ? ' (Broadcast)' : ''}:</p>
                  {c.answer}
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate-400 italic">Awaiting response…</p>
              )}
            </div>
          ))}
          {!(myClarifications as any[]).length && (
            <p className="text-center text-slate-400 py-6">No questions asked yet</p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
