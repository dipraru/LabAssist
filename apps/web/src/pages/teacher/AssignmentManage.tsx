import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { Plus, ChevronDown, ChevronRight } from 'lucide-react';

const assignSchema = z.object({
  courseId: z.string().uuid('Select a course'),
  title: z.string().min(2),
  caption: z.string().optional(),
  deadline: z.string().min(1, 'Deadline required'),
  totalMarks: z.coerce.number().positive(),
  allowLateSubmission: z.boolean().optional(),
});
type AssignData = z.infer<typeof assignSchema>;

const gradeSchema = z.object({ score: z.coerce.number().min(0), feedback: z.string().optional() });
type GradeData = z.infer<typeof gradeSchema>;

export function AssignmentManage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<any>(null);
  const [gradingId, setGradingId] = useState<string | null>(null);

  const { data: courses = [] } = useQuery({ queryKey: ['my-courses'], queryFn: () => api.get('/courses/my').then(r => r.data) });
  const [filterCourse, setFilterCourse] = useState('');

  const { data: assignments = [] } = useQuery({
    queryKey: ['assignments-teacher', filterCourse],
    queryFn: () => api.get(`/assignments/course/${filterCourse}`).then(r => r.data),
    enabled: !!filterCourse,
  });

  const { data: submissions = [] } = useQuery({
    queryKey: ['assignment-submissions', selectedAssignment?.id],
    queryFn: () => api.get(`/assignments/${selectedAssignment.id}/submissions`).then(r => r.data),
    enabled: !!selectedAssignment,
  });

  const assignForm = useForm<AssignData>({ resolver: zodResolver(assignSchema) });
  const gradeForm = useForm<GradeData>({ resolver: zodResolver(gradeSchema) });

  const createMutation = useMutation({
    mutationFn: (d: AssignData) => api.post('/assignments', {
      ...d,
      deadline: new Date(d.deadline).toISOString(),
      allowLateSubmission: d.allowLateSubmission ?? false,
    }),
    onSuccess: () => {
      toast.success('Assignment created');
      qc.invalidateQueries({ queryKey: ['assignments-teacher'] });
      assignForm.reset();
      setShowForm(false);
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed'),
  });

  const gradeMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: GradeData }) =>
      api.post(`/assignments/submissions/${id}/grade`, data),
    onSuccess: () => {
      toast.success('Graded!');
      qc.invalidateQueries({ queryKey: ['assignment-submissions'] });
      setGradingId(null);
      gradeForm.reset();
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed'),
  });

  return (
    <AppShell>
      <div className="max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Assignments</h1>
          <button onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
            <Plus size={16} /> New Assignment
          </button>
        </div>

        <div className="mb-4">
          <select value={filterCourse} onChange={e => setFilterCourse(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm">
            <option value="">— filter by course —</option>
            {(courses as any[]).map((c: any) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
          </select>
        </div>

        {showForm && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 mb-6">
            <h2 className="font-semibold mb-4">New Assignment</h2>
            <form onSubmit={assignForm.handleSubmit(d => createMutation.mutate(d))} className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Course</label>
                <select {...assignForm.register('courseId')} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
                  <option value="">— select —</option>
                  {(courses as any[]).map((c: any) => <option key={c.id} value={c.id}>{c.code}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
                <input {...assignForm.register('title')} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Caption</label>
                <textarea {...assignForm.register('caption')} rows={2} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Deadline</label>
                <input type="datetime-local" {...assignForm.register('deadline')} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Total Marks</label>
                <input type="number" {...assignForm.register('totalMarks')} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <input type="checkbox" id="late" {...assignForm.register('allowLateSubmission')} />
                <label htmlFor="late" className="text-sm text-slate-700">Allow late submission</label>
              </div>
              <div className="col-span-2 flex gap-3">
                <button type="submit" disabled={assignForm.formState.isSubmitting}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">Create</button>
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">Cancel</button>
              </div>
            </form>
          </div>
        )}

        <div className="space-y-3">
          {(assignments as any[]).map((a: any) => (
            <div key={a.id} className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
              <button onClick={() => setSelectedAssignment(selectedAssignment?.id === a.id ? null : a)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50">
                <div className="text-left">
                  <p className="font-semibold text-slate-800">{a.title}</p>
                  <p className="text-xs text-slate-500">Due: {a.deadline?.slice(0,16).replace('T',' ')} · {a.totalMarks} marks</p>
                </div>
                {selectedAssignment?.id === a.id ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              </button>

              {selectedAssignment?.id === a.id && (
                <div className="border-t border-slate-100 px-5 py-4">
                  <h3 className="font-medium text-sm mb-3">Submissions</h3>
                  {(submissions as any[]).length === 0
                    ? <p className="text-sm text-slate-400">No submissions yet</p>
                    : (
                      <table className="w-full text-sm">
                        <thead><tr className="text-xs text-slate-500 uppercase">
                          <th className="pb-2 text-left">Student</th><th className="pb-2 text-left">Status</th>
                          <th className="pb-2 text-left">Score</th><th className="pb-2 text-left">Action</th>
                        </tr></thead>
                        <tbody className="divide-y divide-slate-100">
                          {(submissions as any[]).map((sub: any) => (
                            <tr key={sub.id}>
                              <td className="py-2">{sub.student?.user?.username ?? sub.studentId}</td>
                              <td className="py-2"><span className={`px-2 py-0.5 rounded-full text-xs ${sub.status === 'graded' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{sub.status}</span></td>
                              <td className="py-2">{sub.score ?? '—'} / {a.totalMarks}</td>
                              <td className="py-2">
                                {gradingId === sub.id ? (
                                  <form onSubmit={gradeForm.handleSubmit(d => gradeMutation.mutate({ id: sub.id, data: d }))}
                                    className="flex gap-2 items-center">
                                    <input type="number" {...gradeForm.register('score')} placeholder="Score"
                                      className="w-16 px-2 py-1 border border-slate-300 rounded text-xs" />
                                    <input {...gradeForm.register('feedback')} placeholder="Feedback"
                                      className="w-24 px-2 py-1 border border-slate-300 rounded text-xs" />
                                    <button type="submit" className="px-2 py-1 bg-indigo-600 text-white rounded text-xs">Grade</button>
                                    <button type="button" onClick={() => setGradingId(null)} className="px-2 py-1 border border-slate-300 rounded text-xs">✕</button>
                                  </form>
                                ) : (
                                  <div className="flex gap-2">
                                    {sub.fileUrl && <a href={`/uploads/${sub.fileUrl}`} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:underline">Download</a>}
                                    <button onClick={() => setGradingId(sub.id)} className="text-xs px-2 py-1 border border-slate-300 rounded hover:bg-slate-50">Grade</button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                </div>
              )}
            </div>
          ))}
          {filterCourse && !(assignments as any[]).length && <p className="text-slate-400 text-center py-6">No assignments for this course</p>}
          {!filterCourse && <p className="text-slate-400 text-center py-6">Select a course to view assignments</p>}
        </div>
      </div>
    </AppShell>
  );
}
