import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { AnnouncementModal } from '../../components/AnnouncementModal';
import { Clock, BookOpen } from 'lucide-react';

function Countdown({ endTime }: { endTime: string }) {
  const [remaining, setRemaining] = useState('');
  const [urgent, setUrgent] = useState(false);
  useEffect(() => {
    const tick = () => {
      const diff = new Date(endTime).getTime() - Date.now();
      if (diff <= 0) { setRemaining('Contest Ended'); return; }
      setUrgent(diff < 10 * 60 * 1000);
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endTime]);
  return (
    <div className={`font-mono text-3xl font-bold ${urgent ? 'text-red-600 animate-pulse' : 'text-indigo-700'}`}>
      {remaining}
    </div>
  );
}

export function ContestView() {
  const { id } = useParams<{ id: string }>();

  const { data: contest } = useQuery({
    queryKey: ['contest', id],
    queryFn: () => api.get(`/contests/${id}`).then(r => r.data),
  });

  const problems: any[] = contest?.contestProblems ?? [];

  return (
    <AppShell>
      <AnnouncementModal contestId={id!} />
      <div className="max-w-4xl">
        {contest ? (
          <>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6 text-center">
              <h1 className="text-3xl font-bold text-slate-900 mb-1">{contest.title}</h1>
              <p className="text-slate-500 text-sm mb-4">{contest.type === 'icpc' ? 'ICPC Style' : 'Score Based'}</p>
              {contest.status === 'running' && (
                <div>
                  <p className="text-sm text-slate-500 mb-1 flex items-center justify-center gap-1">
                    <Clock size={14} /> Time Remaining
                  </p>
                  <Countdown endTime={contest.endTime} />
                  {contest.isStandingFrozen && (
                    <span className="mt-2 inline-block px-3 py-1 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">❄ Standings Frozen</span>
                  )}
                </div>
              )}
              {contest.status === 'ended' && <p className="text-red-600 font-semibold">Contest Ended</p>}
              {contest.status === 'scheduled' && <p className="text-amber-600 font-semibold">Starting soon…</p>}
            </div>

            <div className="grid grid-cols-4 gap-3 mb-6">
              {[
                { label: 'Problems', href: 'problems', icon: <BookOpen size={20} className="text-indigo-500" /> },
                { label: 'Submit', href: 'submit', icon: <span className="text-green-600 font-bold text-lg">⌨</span> },
                { label: 'Standings', href: 'standings', icon: <span className="text-amber-500 font-bold text-lg">🏆</span> },
                { label: 'Clarifications', href: 'clarifications', icon: <span className="text-purple-500 font-bold text-lg">💬</span> },
              ].map(item => (
                <Link key={item.label} to={item.href}
                  className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 text-center hover:border-indigo-300 transition-colors">
                  <div className="flex justify-center mb-2">{item.icon}</div>
                  <p className="text-sm font-semibold text-slate-700">{item.label}</p>
                </Link>
              ))}
            </div>

            <h2 className="text-lg font-semibold text-slate-800 mb-3">Problems</h2>
            <div className="space-y-2">
              {problems.map((cp: any) => (
                <Link key={cp.id} to={`problems/${cp.problem?.id}`}
                  className="flex items-center justify-between bg-white rounded-xl border border-slate-100 shadow-sm p-4 hover:border-indigo-300 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 bg-indigo-100 text-indigo-700 rounded-lg flex items-center justify-center font-bold text-sm">
                      {cp.label}
                    </span>
                    <p className="font-semibold text-slate-800">{cp.problem?.title}</p>
                  </div>
                  {contest.type === 'score_based' && cp.score != null && (
                    <span className="text-sm text-slate-500">{cp.score} pts</span>
                  )}
                </Link>
              ))}
              {!problems.length && <p className="text-center text-slate-400 py-4">No problems available yet</p>}
            </div>
          </>
        ) : (
          <div className="text-center py-12 text-slate-400">Loading contest…</div>
        )}
      </div>
    </AppShell>
  );
}
