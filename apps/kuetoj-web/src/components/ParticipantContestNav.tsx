import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

type ParticipantContestNavProps = {
  contestId: string;
};

const tabs = [
  { label: 'Problems', href: (contestId: string) => `/contest/${contestId}/problems` },
  { label: 'My Submissions', href: (contestId: string) => `/contest/${contestId}/submissions` },
  { label: 'Status', href: (contestId: string) => `/contest/${contestId}/status` },
  { label: 'Standings', href: (contestId: string) => `/contest/${contestId}/standings` },
  { label: 'Clarifications', href: (contestId: string) => `/contest/${contestId}/clarifications` },
];

export function ParticipantContestNav({ contestId }: ParticipantContestNavProps) {
  const location = useLocation();
  const { data: contest } = useQuery({
    queryKey: ['contest', contestId],
    queryFn: () => api.get(`/contests/${contestId}`).then((response) => response.data),
    enabled: !!contestId,
    staleTime: 60_000,
  });

  const contestPathId = contest?.contestNumber != null
    ? String(contest.contestNumber)
    : contestId;

  return (
    <div className="mb-6 overflow-x-auto">
      <div className="inline-flex min-w-full gap-2 rounded-xl border border-slate-200 bg-white p-2">
        {tabs.map((tab) => {
          const href = tab.href(contestPathId);
          const active = tab.label === 'Status'
            ? location.pathname === href
            : location.pathname === href || location.pathname.startsWith(`${href}/`);

          return (
            <Link
              key={tab.label}
              to={href}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
