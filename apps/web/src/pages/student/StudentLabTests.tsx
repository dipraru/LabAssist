import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import AceEditor from 'react-ace';
import 'ace-builds/src-noconflict/mode-c_cpp';
import 'ace-builds/src-noconflict/mode-java';
import 'ace-builds/src-noconflict/mode-python';
import 'ace-builds/src-noconflict/mode-javascript';
import 'ace-builds/src-noconflict/theme-monokai';
import toast from 'react-hot-toast';
import { Upload, Clock } from 'lucide-react';

function courseCode(course: any): string {
  return course?.courseCode ?? course?.code ?? 'N/A';
}

function courseTitle(course: any): string {
  return course?.title ?? course?.name ?? 'Untitled Course';
}

const LANG_MODES: Record<string, string> = {
  c: 'c_cpp', cpp: 'c_cpp', java: 'java',
  python: 'python', python3: 'python', javascript: 'javascript',
};

const LANGUAGES = ['c', 'cpp', 'java', 'python', 'python3', 'javascript'];

function Countdown({ endTime }: { endTime: string }) {
  const [remaining, setRemaining] = useState('');
  useEffect(() => {
    const tick = () => {
      const diff = new Date(endTime).getTime() - Date.now();
      if (diff <= 0) { setRemaining('Ended'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${h}h ${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endTime]);
  return <span className="font-mono text-sm font-bold text-indigo-700">{remaining}</span>;
}

export function StudentLabTests() {
  const qc = useQueryClient();
  const [filterCourse, setFilterCourse] = useState('');
  const [selectedTest, setSelectedTest] = useState<any>(null);
  const [selectedProblem, setSelectedProblem] = useState<any>(null);
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('cpp');
  const [file, setFile] = useState<File | null>(null);
  const [useFile, setUseFile] = useState(false);

  const { data: courses = [], isLoading: coursesLoading } = useQuery({
    queryKey: ['student-courses'],
    queryFn: () => api.get('/courses/my').then(r => r.data),
  });

  const { data: labTests = [], isLoading: labTestsLoading } = useQuery({
    queryKey: ['student-lab-tests', filterCourse],
    queryFn: () => api.get(`/lab-tests/course/${filterCourse}`).then(r => r.data),
    enabled: !!filterCourse,
  });

  useEffect(() => {
    if (!filterCourse && (courses as any[]).length > 0) {
      setFilterCourse((courses as any[])[0].id);
    }
  }, [courses, filterCourse]);

  const { data: problems = [] } = useQuery({
    queryKey: ['lab-test-problems', selectedTest?.id],
    queryFn: () => api.get(`/lab-tests/${selectedTest.id}/problems`).then(r => r.data),
    enabled: !!selectedTest,
  });

  const { data: mySubmissions = [] } = useQuery({
    queryKey: ['student-lab-submissions', selectedTest?.id],
    queryFn: () => api.get(`/lab-tests/${selectedTest.id}/my-submissions`).then(r => r.data),
    enabled: !!selectedTest,
  });

  const submitMutation = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('language', language);
      if (useFile && file) {
        fd.append('file', file);
      } else {
        fd.append('code', code);
      }
      return api.post(`/lab-tests/${selectedTest.id}/problems/${selectedProblem.id}/submit`, fd,
        { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: () => {
      toast.success('Submitted!');
      qc.invalidateQueries({ queryKey: ['student-lab-submissions'] });
      setCode('');
      setFile(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Submission failed'),
  });

  const statusColor = (s: string) => ({
    running: 'bg-green-100 text-green-700',
    ended: 'bg-slate-100 text-slate-600',
    scheduled: 'bg-amber-100 text-amber-700',
  }[s] ?? 'bg-slate-100 text-slate-600');

  return (
    <AppShell>
      <div className="max-w-5xl">
        <h1 className="text-2xl font-bold text-slate-900 mb-6">Lab Tests</h1>

        <div className="mb-4">
          {coursesLoading ? (
            <div className="h-10 w-64 bg-slate-100 rounded-lg animate-pulse" />
          ) : (
            <select value={filterCourse} onChange={e => setFilterCourse(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm">
              <option value="">- select course -</option>
              {(courses as any[]).map((c: any) => <option key={c.id} value={c.id}>{courseCode(c)} - {courseTitle(c)}</option>)}
            </select>
          )}
        </div>

        {!selectedTest ? (
          <div className="space-y-3">
            {labTestsLoading && !!filterCourse && (
              <>
                {[1, 2].map((k) => (
                  <div key={k} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 animate-pulse">
                    <div className="h-4 w-48 bg-slate-100 rounded mb-2" />
                    <div className="h-3 w-40 bg-slate-100 rounded" />
                  </div>
                ))}
              </>
            )}
            {(labTests as any[]).map((t: any) => (
              <button key={t.id} onClick={() => { setSelectedTest(t); setSelectedProblem(null); }}
                className="w-full text-left bg-white rounded-xl border border-slate-100 shadow-sm p-4 hover:border-indigo-300 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-800">{t.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{t.type} · {t.totalMarks} marks</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${statusColor(t.status)}`}>{t.status}</span>
                    {t.status === 'running' && (
                      <div className="flex items-center gap-1 text-indigo-600">
                        <Clock size={14} />
                        <Countdown endTime={t.endTime} />
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))}
            {filterCourse && !(labTests as any[]).length && <p className="text-center text-slate-400 py-6">No lab tests</p>}
            {!filterCourse && <p className="text-center text-slate-400 py-6">Select a course</p>}
          </div>
        ) : (
          <div>
            <button onClick={() => { setSelectedTest(null); setSelectedProblem(null); }}
              className="flex items-center gap-1 text-sm text-indigo-600 hover:underline mb-4">
              ← Back to tests
            </button>

            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-800">{selectedTest.title}</h2>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${statusColor(selectedTest.status)}`}>{selectedTest.status}</span>
                {selectedTest.status === 'running' && <Countdown endTime={selectedTest.endTime} />}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4">
              {/* Problem list */}
              <div className="col-span-1 space-y-2">
                {(problems as any[]).map((p: any, i: number) => {
                  const mySub = (mySubmissions as any[]).find((s: any) => s.problemId === p.id);
                  return (
                    <button key={p.id} onClick={() => setSelectedProblem(p)}
                      className={`w-full text-left p-3 rounded-lg border text-sm transition-colors ${
                        selectedProblem?.id === p.id ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-700">P{i + 1}</span>
                        {mySub && <span className="w-2 h-2 bg-green-500 rounded-full" />}
                      </div>
                      <p className="truncate text-xs text-slate-500 mt-0.5">{p.title}</p>
                      <p className="text-xs text-slate-400">{p.marks} marks</p>
                    </button>
                  );
                })}
              </div>

              {/* Problem + editor */}
              <div className="col-span-3">
                {!selectedProblem ? (
                  <div className="bg-white rounded-xl border border-slate-100 p-6 text-center text-slate-400">
                    Select a problem to view and submit
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Statement */}
                    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
                      <h3 className="font-semibold text-slate-800 mb-1">{selectedProblem.title}</h3>
                      <p className="text-xs text-slate-500 mb-3">{selectedProblem.marks} marks · {selectedProblem.timeLimitMs}ms · {selectedProblem.memoryLimitKb}KB</p>
                      <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans">{selectedProblem.statement}</pre>

                      {selectedProblem.sampleTestCases?.length > 0 && (
                        <div className="mt-3 space-y-2">
                          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Sample Cases</p>
                          {selectedProblem.sampleTestCases.map((tc: any, i: number) => (
                            <div key={i} className="grid grid-cols-2 gap-2 text-xs">
                              <div className="bg-slate-50 rounded p-2 font-mono">
                                <p className="text-slate-400 mb-1">Input:</p>
                                <pre>{tc.input}</pre>
                              </div>
                              <div className="bg-slate-50 rounded p-2 font-mono">
                                <p className="text-slate-400 mb-1">Output:</p>
                                <pre>{tc.output}</pre>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Submission */}
                    {selectedTest.status === 'running' ? (
                      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="font-semibold text-slate-800">Submit Solution</h3>
                          <span className="px-2 py-0.5 bg-amber-50 text-amber-700 text-xs rounded-full font-medium">
                            📝 Editor only — no code execution in MVP
                          </span>
                        </div>
                        <div className="flex items-center gap-4 mb-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Language</label>
                            <select value={language} onChange={e => setLanguage(e.target.value)}
                              className="px-3 py-1.5 border border-slate-300 rounded text-sm">
                              {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                            </select>
                          </div>
                          <div className="flex items-center gap-2 mt-4">
                            <button type="button" onClick={() => setUseFile(false)}
                              className={`px-3 py-1.5 text-xs rounded ${!useFile ? 'bg-indigo-600 text-white' : 'border border-slate-300 text-slate-700'}`}>
                              Code Editor
                            </button>
                            <button type="button" onClick={() => setUseFile(true)}
                              className={`px-3 py-1.5 text-xs rounded ${useFile ? 'bg-indigo-600 text-white' : 'border border-slate-300 text-slate-700'}`}>
                              Upload File
                            </button>
                          </div>
                        </div>

                        {!useFile ? (
                          <AceEditor
                            mode={LANG_MODES[language] ?? 'c_cpp'}
                            theme="monokai"
                            value={code}
                            onChange={setCode}
                            name="lab-editor"
                            width="100%"
                            height="300px"
                            fontSize={13}
                            setOptions={{ useWorker: false, showPrintMargin: false }}
                          />
                        ) : (
                          <label className={`flex items-center gap-2 px-4 py-4 border-2 border-dashed rounded-lg cursor-pointer ${file ? 'border-indigo-400 bg-indigo-50' : 'border-slate-300'}`}>
                            <Upload size={16} className="text-slate-400" />
                            <span className="text-sm text-slate-600">{file ? file.name : 'Choose file (max 256KB)…'}</span>
                            <input type="file" className="hidden"
                              onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f); }} />
                          </label>
                        )}

                        <button
                          disabled={submitMutation.isPending || (!useFile && !code.trim()) || (useFile && !file)}
                          onClick={() => submitMutation.mutate()}
                          className="mt-3 px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                          {submitMutation.isPending ? 'Submitting…' : 'Submit'}
                        </button>

                        {/* My submissions for this problem */}
                        {(mySubmissions as any[]).filter((s: any) => s.problemId === selectedProblem.id).length > 0 && (
                          <div className="mt-4 border-t border-slate-100 pt-4">
                            <p className="text-xs font-semibold text-slate-600 mb-2">My submissions</p>
                            {(mySubmissions as any[]).filter((s: any) => s.problemId === selectedProblem.id).map((s: any) => (
                              <div key={s.id} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-50">
                                <span className="text-slate-500">{s.submittedAt?.slice(0,16).replace('T',' ')}</span>
                                <span>{s.manualVerdict ?? s.submissionStatus}</span>
                                <span>{s.score ?? '—'} pts</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-500">
                        {selectedTest.status === 'ended' ? 'Lab test has ended. Submissions closed.' : 'Lab test has not started yet.'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
