import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';

export function ContestProblem() {
  const { id, problemId } = useParams<{ id: string; problemId: string }>();

  const { data: contest } = useQuery({
    queryKey: ['contest', id],
    queryFn: () => api.get(`/contests/${id}`).then(r => r.data),
  });

  const cp = contest?.contestProblems?.find((p: any) => p.problem?.id === problemId);
  const problem = cp?.problem;

  if (!problem) return (
    <AppShell>
      <div className="text-center py-12 text-slate-400">Loading problem…</div>
    </AppShell>
  );

  return (
    <AppShell>
      <div className="max-w-3xl">
        <Link to={`/contest/${id}`} className="text-sm text-indigo-600 hover:underline mb-4 inline-block">
          ← Back to contest
        </Link>

        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 mb-4">
          <div className="flex items-start gap-3 mb-4">
            <span className="w-10 h-10 bg-indigo-100 text-indigo-700 rounded-lg flex items-center justify-center font-bold">
              {cp.label}
            </span>
            <div>
              <h1 className="text-xl font-bold text-slate-900">{problem.title}</h1>
              <p className="text-sm text-slate-500">
                Time: {problem.timeLimitMs}ms · Memory: {problem.memoryLimitKb}KB
                {contest?.type === 'score_based' && cp.score != null && ` · ${cp.score} points`}
              </p>
            </div>
          </div>

          <div className="prose prose-sm max-w-none text-slate-700">
            <pre className="whitespace-pre-wrap font-sans">{problem.statement}</pre>
          </div>

          {problem.sampleTestCases?.length > 0 && (
            <div className="mt-6">
              <h3 className="font-semibold text-slate-700 mb-3 text-sm uppercase tracking-wide">Sample Test Cases</h3>
              <div className="space-y-3">
                {problem.sampleTestCases.map((tc: any, i: number) => (
                  <div key={i} className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-1">Input {i + 1}</p>
                      <pre className="bg-slate-50 rounded-lg p-3 font-mono text-sm text-slate-800 overflow-auto">{tc.input}</pre>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-1">Output {i + 1}</p>
                      <pre className="bg-slate-50 rounded-lg p-3 font-mono text-sm text-slate-800 overflow-auto">{tc.output}</pre>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <Link to={`/contest/${id}/submit`}
          state={{ problemLabel: cp.label, problemId: problem.id, contestProblemId: cp.id }}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors">
          Submit for {cp.label}
        </Link>
      </div>
    </AppShell>
  );
}
