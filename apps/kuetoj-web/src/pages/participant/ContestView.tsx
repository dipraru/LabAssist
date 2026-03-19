import { useParams } from 'react-router-dom';
import { AppShell } from '../../components/AppShell';
import { AnnouncementModal } from '../../components/AnnouncementModal';
import { ParticipantContestNav } from '../../components/ParticipantContestNav';
import { ParticipantContestHeader } from '../../components/ParticipantContestHeader';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

const VERDICT_COLOR: Record<string, string> = {
  accepted: 'text-green-600',
  wrong_answer: 'text-red-600',
  pending: 'text-amber-600',
  manual_review: 'text-blue-600',
};

export function ContestView() {
  const { id } = useParams<{ id: string }>();

  const { data: contest } = useQuery({
    queryKey: ['contest', id],
    queryFn: () => api.get(`/contests/${id}`).then(r => r.data),
  });

  const { data: submissions = [] } = useQuery({
    queryKey: ['my-contest-submissions', id],
    queryFn: () => api.get(`/contests/${id}/my-submissions`).then((response) => response.data),
    enabled: !!id,
  });

  return (
    <AppShell>
      <AnnouncementModal />
      <div className="w-full">
        {contest ? (
          <>
            {id && <ParticipantContestHeader contestId={id} />}

            {id && <ParticipantContestNav contestId={id} />}

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left">ID</th>
                    <th className="px-4 py-3 text-left">Who</th>
                    <th className="px-4 py-3 text-left">Problem</th>
                    <th className="px-4 py-3 text-left">When</th>
                    <th className="px-4 py-3 text-left">Lang</th>
                    <th className="px-4 py-3 text-left">Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {(submissions as any[]).map((submission: any) => (
                    <tr key={submission.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-mono text-xs">#{submission.submissionDisplayId}</td>
                      <td className="px-4 py-3">{submission.participantName ?? submission.participantId ?? '—'}</td>
                      <td className="px-4 py-3">{submission.contestProblem?.label ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-500">{new Date(submission.submittedAt).toLocaleString()}</td>
                      <td className="px-4 py-3">{submission.language ?? '—'}</td>
                      <td className={`px-4 py-3 font-medium ${VERDICT_COLOR[submission.manualVerdict ?? submission.submissionStatus] ?? 'text-slate-600'}`}>
                        {submission.manualVerdict ?? submission.submissionStatus}
                      </td>
                    </tr>
                  ))}
                  {!(submissions as any[]).length && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-slate-400">No status rows yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="text-center py-12 text-slate-400">Loading contest…</div>
        )}
      </div>
    </AppShell>
  );
}
