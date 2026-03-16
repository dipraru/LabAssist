import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

type AssignedContest = {
  contest: {
    id: string;
  };
};

export function ParticipantContestEntry() {
  const { data: assigned = [], isLoading } = useQuery({
    queryKey: ['participant-assigned-contests'],
    queryFn: () => api.get('/contests/assigned/mine').then((response) => response.data),
  });

  if (!isLoading && (assigned as AssignedContest[]).length > 0) {
    return <Navigate to={`/contest/${(assigned as AssignedContest[])[0].contest.id}`} replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="rounded-xl border border-slate-200 bg-white px-6 py-5 text-center shadow-sm">
        {isLoading ? (
          <p className="text-sm text-slate-500">Opening your contest…</p>
        ) : (
          <p className="text-sm text-slate-500">No assigned contest found for this participant account.</p>
        )}
      </div>
    </div>
  );
}
