import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { BarChart3, ClipboardList, HelpCircle, ListChecks, Trophy } from 'lucide-react';

type ParticipantContestNavProps = {
  contestId: string;
};

const tabs = [
  { label: 'Problems', icon: <ClipboardList size={16} />, href: (contestId: string) => `/contests/${contestId}/problems` },
  { label: 'My Submissions', icon: <ListChecks size={16} />, href: (contestId: string) => `/contests/${contestId}/submissions` },
  { label: 'Status', icon: <BarChart3 size={16} />, href: (contestId: string) => `/contests/${contestId}/status` },
  { label: 'Standings', icon: <Trophy size={16} />, href: (contestId: string) => `/contests/${contestId}/standings` },
  { label: 'Clarifications', icon: <HelpCircle size={16} />, href: (contestId: string) => `/contests/${contestId}/clarifications` },
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
    <div className="mb-6 overflow-x-auto oj-scrollbar">
      <div className="inline-flex min-w-full gap-2 rounded-3xl border border-white/80 bg-white/80 p-2 shadow-lg shadow-slate-900/5 backdrop-blur">
        {tabs.map((tab) => {
          const href = tab.href(contestPathId);
          const active = tab.label === 'Status'
            ? location.pathname === href
            : location.pathname === href || location.pathname.startsWith(`${href}/`);

          return (
            <Link
              key={tab.label}
              to={href}
              className={`inline-flex items-center gap-2 whitespace-nowrap rounded-2xl px-4 py-2.5 text-sm font-extrabold transition-all ${
                active
                  ? 'bg-teal-700 text-white shadow-lg shadow-teal-900/15'
                  : 'text-slate-600 hover:bg-white hover:text-teal-700'
              }`}
            >
              {tab.icon}
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
