import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { Plus, PlayCircle, StopCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { courseCode, courseTitle, studentDisplayName } from '../../lib/display';

const testSchema = z.object({
  courseId: z.string().uuid('Select a course'),
  title: z.string().min(2),
  type: z.enum(['verdict_based', 'non_verdict']),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  totalMarks: z.number().positive(),
});
type TestData = z.infer<typeof testSchema>;

const problemSchema = z.object({
  title: z.string().min(1),
  statement: z.string().min(1),
  marks: z.number().positive(),
  timeLimitMs: z.number().positive().optional(),
  memoryLimitKb: z.number().positive().optional(),
});
type ProblemData = z.infer<typeof problemSchema>;

const gradeSchema = z.object({
  score: z.number().min(0),
  manualVerdict: z.string().optional(),
  instructorNote: z.string().optional(),
});
type GradeData = z.infer<typeof gradeSchema>;

export function LabTestManage() {
  const qc = useQueryClient();
  const [showTestForm, setShowTestForm] = useState(false);
  const [selectedTest, setSelectedTest] = useState<any>(null);
  const [showProblemForm, setShowProblemForm] = useState(false);
  const [gradingSubId, setGradingSubId] = useState<string | null>(null);
  const [filterCourse, setFilterCourse] = useState('');

  const { data: courses = [] } = useQuery({ queryKey: ['my-courses'], queryFn: () => api.get('/courses/my').then(r => r.data) });

  const { data: labTests = [] } = useQuery({
    queryKey: ['lab-tests-teacher', filterCourse],
    queryFn: () => api.get(`/lab-tests/course/${filterCourse}`).then(r => r.data),
    enabled: !!filterCourse,
  });

  const { data: problems = [] } = useQuery({
    queryKey: ['lab-test-problems', selectedTest?.id],
    queryFn: () => api.get(`/lab-tests/${selectedTest.id}/problems`).then(r => r.data),
    enabled: !!selectedTest,
  });

  const { data: submissions = [] } = useQuery({
    queryKey: ['lab-test-submissions', selectedTest?.id],
    queryFn: () => api.get(`/lab-tests/${selectedTest.id}/submissions`).then(r => r.data),
    enabled: !!selectedTest,
  });

  const testForm = useForm<TestData>({ resolver: zodResolver(testSchema) });
  const problemForm = useForm<ProblemData>({ resolver: zodResolver(problemSchema) });
  const gradeForm = useForm<GradeData>({ resolver: zodResolver(gradeSchema) });

  const createTestMutation = useMutation({
    mutationFn: (d: TestData) => api.post('/lab-tests', { ...d, startTime: new Date(d.startTime).toISOString(), endTime: new Date(d.endTime).toISOString() }),
    onSuccess: () => { toast.success('Lab test created'); qc.invalidateQueries({ queryKey: ['lab-tests-teacher'] }); testForm.reset(); setShowTestForm(false); },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed'),
  });

  const addProblemMutation = useMutation({
    mutationFn: (d: ProblemData) => api.post(`/lab-tests/${selectedTest.id}/problems`, d),
    onSuccess: () => { toast.success('Problem added'); qc.invalidateQueries({ queryKey: ['lab-test-problems'] }); problemForm.reset(); setShowProblemForm(false); },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed'),
  });

  const startMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/lab-tests/${id}/start`),
    onSuccess: () => { toast.success('Lab test started!'); qc.invalidateQueries({ queryKey: ['lab-tests-teacher'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed'),
  });

  const endMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/lab-tests/${id}/end`),
    onSuccess: () => { toast.success('Lab test ended'); qc.invalidateQueries({ queryKey: ['lab-tests-teacher'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed'),
  });

  const gradeMutation = useMutation({
    mutationFn: ({ id, d }: { id: string; d: GradeData }) => api.post(`/lab-tests/submissions/${id}/grade`, d),
    onSuccess: () => { toast.success('Graded!'); qc.invalidateQueries({ queryKey: ['lab-test-submissions'] }); setGradingSubId(null); gradeForm.reset(); },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed'),
  });

  const statusColor = (s: string) => s === 'running' ? 'bg-green-100 text-green-700' : s === 'ended' ? 'bg-slate-100 text-slate-600' : 'bg-amber-100 text-amber-700';

  return (
    <AppShell>
      <div className="max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Lab Tests</h1>
          <button onClick={() => setShowTestForm(!showTestForm)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
            <Plus size={16} /> New Lab Test
          </button>
        </div>

        <div className="mb-4">
          <select value={filterCourse} onChange={e => setFilterCourse(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm">
            <option value="">— filter by course —</option>
            {(courses as any[]).map((c: any) => <option key={c.id} value={c.id}>{courseCode(c)} - {courseTitle(c)}</option>)}
          </select>
        </div>

        {showTestForm && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 mb-6">
            <h2 className="font-semibold mb-4">New Lab Test</h2>
            <form onSubmit={testForm.handleSubmit(d => createTestMutation.mutate(d))} className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Course</label>
                <select {...testForm.register('courseId')} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
                  <option value="">— select —</option>
                  {(courses as any[]).map((c: any) => <option key={c.id} value={c.id}>{courseCode(c)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                <select {...testForm.register('type')} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
                  <option value="verdict_based">Verdict Based</option>
                  <option value="non_verdict">Non-Verdict</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
                <input {...testForm.register('title')} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Total Marks</label>
                <input type="number" {...testForm.register('totalMarks', { valueAsNumber: true })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Start Time</label>
                <input type="datetime-local" {...testForm.register('startTime')} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">End Time</label>
                <input type="datetime-local" {...testForm.register('endTime')} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
              </div>
              <div className="col-span-2 flex gap-3">
                <button type="submit" disabled={testForm.formState.isSubmitting}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">Create</button>
                <button type="button" onClick={() => setShowTestForm(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">Cancel</button>
              </div>
            </form>
          </div>
        )}

        <div className="space-y-3">
          {(labTests as any[]).map((t: any) => (
            <div key={t.id} className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4">
                <button onClick={() => setSelectedTest(selectedTest?.id === t.id ? null : t)} className="flex items-center gap-3 text-left">
                  {selectedTest?.id === t.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <div>
                    <p className="font-semibold text-slate-800">{t.title}</p>
                    <p className="text-xs text-slate-500">{t.type} · {t.totalMarks} marks</p>
                  </div>
                </button>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${statusColor(t.status)}`}>{t.status}</span>
                  {t.status === 'scheduled' && (
                    <button onClick={() => startMutation.mutate(t.id)}
                      className="flex items-center gap-1 px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700">
                      <PlayCircle size={12} /> Start
                    </button>
                  )}
                  {t.status === 'running' && (
                    <button onClick={() => endMutation.mutate(t.id)}
                      className="flex items-center gap-1 px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600">
                      <StopCircle size={12} /> End
                    </button>
                  )}
                </div>
              </div>

              {selectedTest?.id === t.id && (
                <div className="border-t border-slate-100 p-5 space-y-5">
                  {/* Problems */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-medium text-sm">Problems ({(problems as any[]).length})</h3>
                      <button onClick={() => setShowProblemForm(!showProblemForm)}
                        className="flex items-center gap-1 px-2 py-1 border border-slate-300 rounded text-xs hover:bg-slate-50">
                        <Plus size={12} /> Add Problem
                      </button>
                    </div>
                    {showProblemForm && (
                      <form onSubmit={problemForm.handleSubmit(d => addProblemMutation.mutate(d))} className="grid grid-cols-2 gap-3 mb-3 p-3 bg-slate-50 rounded-lg">
                        <div className="col-span-2">
                          <input {...problemForm.register('title')} placeholder="Problem title" className="w-full px-3 py-2 border border-slate-300 rounded text-sm" />
                        </div>
                        <div className="col-span-2">
                          <textarea {...problemForm.register('statement')} placeholder="Problem statement" rows={3}
                            className="w-full px-3 py-2 border border-slate-300 rounded text-sm resize-none" />
                        </div>
                        <input type="number" {...problemForm.register('marks', { valueAsNumber: true })} placeholder="Marks" className="px-3 py-2 border border-slate-300 rounded text-sm" />
                        <input type="number" {...problemForm.register('timeLimitMs', { setValueAs: (value) => value === '' ? undefined : Number(value) })} placeholder="Time limit (ms)" className="px-3 py-2 border border-slate-300 rounded text-sm" />
                        <div className="col-span-2 flex gap-2">
                          <button type="submit" className="px-3 py-1.5 bg-indigo-600 text-white rounded text-xs">Add</button>
                          <button type="button" onClick={() => setShowProblemForm(false)} className="px-3 py-1.5 border border-slate-300 rounded text-xs">Cancel</button>
                        </div>
                      </form>
                    )}
                    {(problems as any[]).map((p: any, i: number) => (
                      <div key={p.id} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
                        <span className="w-6 h-6 bg-indigo-100 text-indigo-700 rounded text-xs flex items-center justify-center font-bold">{i + 1}</span>
                        <div>
                          <p className="text-sm font-medium">{p.title}</p>
                          <p className="text-xs text-slate-500">{p.marks} marks · {p.timeLimitMs}ms</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Submissions */}
                  <div>
                    <h3 className="font-medium text-sm mb-3">Submissions ({(submissions as any[]).length})</h3>
                    {(submissions as any[]).length === 0 ? <p className="text-sm text-slate-400">No submissions yet</p> : (
                      <table className="w-full text-xs">
                        <thead><tr className="text-slate-500 uppercase text-xs">
                          <th className="pb-2 text-left">Student</th><th className="pb-2 text-left">Problem</th>
                          <th className="pb-2 text-left">Verdict</th><th className="pb-2 text-left">Score</th><th className="pb-2 text-left">Action</th>
                        </tr></thead>
                        <tbody className="divide-y divide-slate-100">
                          {(submissions as any[]).map((sub: any) => (
                            <tr key={sub.id}>
                              <td className="py-2">{studentDisplayName(sub)}</td>
                              <td className="py-2">{sub.problem?.title ?? '—'}</td>
                              <td className="py-2">{sub.manualVerdict ?? sub.submissionStatus}</td>
                              <td className="py-2">{sub.score ?? '—'}</td>
                              <td className="py-2">
                                {gradingSubId === sub.id ? (
                                  <form onSubmit={gradeForm.handleSubmit(d => gradeMutation.mutate({ id: sub.id, d }))}
                                    className="flex gap-1 items-center">
                                    <input type="number" {...gradeForm.register('score', { valueAsNumber: true })} placeholder="Score"
                                      className="w-14 px-2 py-0.5 border border-slate-300 rounded text-xs" />
                                    <select {...gradeForm.register('manualVerdict')} className="px-1 py-0.5 border border-slate-300 rounded text-xs">
                                      <option value="">—</option>
                                      <option value="accepted">Accepted</option>
                                      <option value="wrong_answer">Wrong</option>
                                      <option value="partial">Partial</option>
                                    </select>
                                    <button type="submit" className="px-2 py-0.5 bg-indigo-600 text-white rounded text-xs">✓</button>
                                    <button type="button" onClick={() => setGradingSubId(null)} className="px-1 py-0.5 border rounded text-xs">✕</button>
                                  </form>
                                ) : (
                                  <button onClick={() => setGradingSubId(sub.id)} className="px-2 py-0.5 border border-slate-300 rounded text-xs hover:bg-slate-50">Grade</button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
          {!filterCourse && <p className="text-slate-400 text-center py-6">Select a course to view lab tests</p>}
        </div>
      </div>
    </AppShell>
  );
}
