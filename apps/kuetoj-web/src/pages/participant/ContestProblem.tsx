import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { ParticipantContestNav } from '../../components/ParticipantContestNav';
import AceEditor from 'react-ace';
import toast from 'react-hot-toast';
import 'ace-builds/src-noconflict/mode-c_cpp';
import 'ace-builds/src-noconflict/mode-java';
import 'ace-builds/src-noconflict/mode-python';
import 'ace-builds/src-noconflict/mode-javascript';
import 'ace-builds/src-noconflict/theme-monokai';

const LANG_MODES: Record<string, string> = {
  c: 'c_cpp',
  cpp: 'c_cpp',
  java: 'java',
  python: 'python',
  python3: 'python',
  javascript: 'javascript',
};

const LANGUAGES = ['c', 'cpp', 'java', 'python', 'python3', 'javascript'];

export function ContestProblem() {
  const { id, problemId } = useParams<{ id: string; problemId: string }>();
  const queryClient = useQueryClient();
  const [language, setLanguage] = useState('cpp');
  const [code, setCode] = useState('');

  const { data: submissions = [] } = useQuery({
    queryKey: ['my-contest-submissions', id],
    queryFn: () => api.get(`/contests/${id}/my-submissions`).then((response) => response.data),
    enabled: !!id,
  });

  const { data: contest } = useQuery({
    queryKey: ['contest', id],
    queryFn: () => api.get(`/contests/${id}`).then(r => r.data),
  });

  const contestProblems: any[] = contest?.problems ?? contest?.contestProblems ?? [];
  const cp = contestProblems.find((p: any) => p.problem?.id === problemId);
  const problem = cp?.problem;

  const submitMutation = useMutation({
    mutationFn: () => {
      const payload = new FormData();
      payload.append('contestProblemId', cp.id);
      payload.append('language', language);
      payload.append('code', code);
      return api.post(`/contests/${id}/submit`, payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      toast.success('Submitted successfully');
      setCode('');
      queryClient.invalidateQueries({ queryKey: ['my-contest-submissions', id] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message ?? 'Submission failed');
    },
  });

  if (!problem) return (
    <AppShell>
      <div className="text-center py-12 text-slate-400">Problem unavailable right now.</div>
    </AppShell>
  );

  const recentProblemSubmissions = (submissions as any[])
    .filter((submission) => submission.contestProblemId === cp.id)
    .slice(0, 8);

  return (
    <AppShell>
      <div className="max-w-7xl">
        {id && <ParticipantContestNav contestId={id} />}
        <Link to={`/contest/${id}/problems`} className="text-sm text-indigo-600 hover:underline mb-4 inline-block">
          ← Back to problems
        </Link>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
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
                    <div key={i} className="grid grid-cols-1 gap-3 md:grid-cols-2">
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

          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="mb-3 text-lg font-semibold text-slate-900">Submit Solution</h2>
              <div className="mb-3">
                <label className="mb-1 block text-sm font-medium text-slate-700">Language</label>
                <select
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {LANGUAGES.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>

              <AceEditor
                mode={LANG_MODES[language] ?? 'c_cpp'}
                theme="monokai"
                value={code}
                onChange={setCode}
                name="integrated-problem-editor"
                width="100%"
                height="320px"
                fontSize={13}
                setOptions={{ useWorker: false, showPrintMargin: false }}
              />

              <button
                type="button"
                className="mt-3 rounded-lg bg-indigo-600 px-5 py-2.5 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                disabled={submitMutation.isPending || !code.trim()}
                onClick={() => submitMutation.mutate()}
              >
                {submitMutation.isPending ? 'Submitting…' : `Submit for ${cp.label}`}
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold text-slate-800">Recent Submissions</h3>
                <Link to={`/contest/${id}/submissions`} className="text-xs text-indigo-600 hover:underline">See all</Link>
              </div>
              <div className="space-y-2">
                {recentProblemSubmissions.map((submission: any) => (
                  <div key={submission.id} className="rounded-lg border border-slate-100 p-3 text-xs">
                    <p className="font-mono text-slate-500">#{submission.submissionDisplayId}</p>
                    <p className="font-medium text-slate-700">{submission.manualVerdict ?? submission.submissionStatus}</p>
                    <p className="text-slate-400">{new Date(submission.submittedAt).toLocaleString()}</p>
                  </div>
                ))}
                {!recentProblemSubmissions.length && (
                  <p className="text-xs text-slate-400">No submissions for this problem yet.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
