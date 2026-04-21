import { useEffect, useState } from 'react';
import { useParams, useLocation, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import AceEditor from 'react-ace';
import 'ace-builds/src-noconflict/mode-c_cpp';
import 'ace-builds/src-noconflict/mode-java';
import 'ace-builds/src-noconflict/mode-python';
import 'ace-builds/src-noconflict/mode-javascript';
import 'ace-builds/src-noconflict/theme-github';
import toast from 'react-hot-toast';
import { Upload, Code2 } from 'lucide-react';
import { getSocket, joinContest, leaveContest } from '../../lib/socket';
import { getEffectiveVerdict, getVerdictBadgeClass } from '../../lib/verdict';

const LANG_MODES: Record<string, string> = {
  c: 'c_cpp', cpp: 'c_cpp', java: 'java',
  python: 'python', python3: 'python', javascript: 'javascript',
};

const LANGUAGES = ['c', 'cpp', 'java', 'python', 'python3', 'javascript'];

export function ContestSubmit() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const state = location.state as { problemLabel?: string; problemId?: string; contestProblemId?: string } | null;

  const [language, setLanguage] = useState('cpp');
  const [code, setCode] = useState('');
  const [useFile, setUseFile] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [selectedCPId, setSelectedCPId] = useState(state?.contestProblemId ?? '');

  const { data: contest } = useQuery({
    queryKey: ['contest', id],
    queryFn: () => api.get(`/contests/${id}`).then(r => r.data),
    enabled: !!id,
  });

  const contestPathId = contest?.contestNumber != null
    ? String(contest.contestNumber)
    : id;

  const { data: mySubmissions = [] } = useQuery({
    queryKey: ['my-contest-submissions', id],
    queryFn: () => api.get(`/contests/${id}/my-submissions`).then(r => r.data),
    enabled: !!id,
    refetchInterval: 3000,
  });

  useEffect(() => {
    if (!contest?.id || !id) return;

    joinContest(contest.id);
    const socket = getSocket();
    const refreshSubmissions = () => {
      qc.invalidateQueries({ queryKey: ['my-contest-submissions', id] });
    };

    socket.on('verdict', refreshSubmissions);

    return () => {
      socket.off('verdict', refreshSubmissions);
      leaveContest(contest.id);
    };
  }, [contest?.id, id, qc]);

  const submitMutation = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('contestProblemId', selectedCPId);
      fd.append('language', language);
      if (useFile && file) {
        fd.append('file', file);
      } else {
        fd.append('code', code);
      }
      return api.post(`/contests/${id}/submit`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: (response) => {
      toast.success('Submitted!');
      qc.invalidateQueries({ queryKey: ['my-contest-submissions', id] });
      setCode('');
      setFile(null);
      const submissionId = response.data?.id;
      if (submissionId && contestPathId) {
        navigate(`/contests/${contestPathId}/submissions/${submissionId}`);
      }
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Submission failed'),
  });

  const problems: any[] = contest?.problems ?? contest?.contestProblems ?? [];

  return (
    <AppShell>
      <div className="oj-page max-w-5xl">
        <Link to={`/contests/${id}`} className="mb-4 inline-block text-sm font-bold text-teal-700 hover:underline">
          ← Back to contest
        </Link>
        <h1 className="mb-6 text-2xl font-extrabold text-slate-950">Submit Solution</h1>

        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-800">
          <Code2 size={16} />
          <span>Submit inline code or upload a source file. Verdicts update automatically when judging finishes.</span>
        </div>

        <div className="grid grid-cols-3 gap-6">
          <div className="oj-panel col-span-2 space-y-4 p-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Problem</label>
              <select value={selectedCPId} onChange={e => setSelectedCPId(e.target.value)}
                className="oj-select">
                <option value="">— select problem —</option>
                {problems.map((cp: any) => (
                  <option key={cp.id} value={cp.id}>{cp.label}. {cp.problem?.title}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Language</label>
                <select value={language} onChange={e => setLanguage(e.target.value)}
                  className="oj-select w-auto">
                  {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div className="mt-5 flex gap-2">
                <button type="button" onClick={() => setUseFile(false)}
                  className={`flex items-center gap-1.5 rounded-2xl px-3 py-2 text-sm font-extrabold ${!useFile ? 'bg-teal-700 text-white' : 'border border-slate-300 text-slate-700'}`}>
                  <Code2 size={14} /> Editor
                </button>
                <button type="button" onClick={() => setUseFile(true)}
                  className={`flex items-center gap-1.5 rounded-2xl px-3 py-2 text-sm font-extrabold ${useFile ? 'bg-teal-700 text-white' : 'border border-slate-300 text-slate-700'}`}>
                  <Upload size={14} /> File
                </button>
              </div>
            </div>

            {!useFile ? (
              <AceEditor
                mode={LANG_MODES[language] ?? 'c_cpp'}
                theme="github"
                value={code}
                onChange={setCode}
                name="contest-editor"
                width="100%"
                height="380px"
                fontSize={13}
                setOptions={{ useWorker: false, showPrintMargin: false }}
              />
            ) : (
              <label className={`flex items-center gap-3 px-5 py-6 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${file ? 'border-indigo-400 bg-indigo-50' : 'border-slate-300 hover:border-slate-400'}`}>
                <Upload size={20} className="text-slate-400" />
                <div>
                  <p className="text-sm font-medium text-slate-700">{file ? file.name : 'Upload your source file'}</p>
                  <p className="text-xs text-slate-400">Max 256KB</p>
                </div>
                <input type="file" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f); }} />
              </label>
            )}

            <button
              disabled={submitMutation.isPending || !selectedCPId || (!useFile && !code.trim()) || (useFile && !file)}
              onClick={() => submitMutation.mutate()}
              className="oj-btn-primary disabled:opacity-50">
              {submitMutation.isPending ? 'Submitting...' : 'Submit'}
            </button>
          </div>

          {/* My submissions */}
          <div className="oj-panel col-span-1 p-5">
            <h2 className="font-extrabold text-slate-800 mb-3 text-sm">My Submissions</h2>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {(mySubmissions as any[]).length === 0 ? (
                <p className="text-xs text-slate-400">No submissions yet</p>
              ) : (
                (mySubmissions as any[]).map((sub: any) => (
                  <div key={sub.id} className="bg-white rounded-lg border border-slate-100 p-3 text-xs">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-bold text-slate-700">{sub.contestProblem?.label ?? '—'}</span>
                      {(() => {
                        const effectiveVerdict = getEffectiveVerdict(sub);
                        return (
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${getVerdictBadgeClass(effectiveVerdict)}`}>
                            {effectiveVerdict}
                          </span>
                        );
                      })()}
                    </div>
                    <p className="text-slate-400">{sub.language} · {sub.submittedAt?.slice(11,16)}</p>
                    {sub.score != null && <p className="text-slate-600">{sub.score} pts</p>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
