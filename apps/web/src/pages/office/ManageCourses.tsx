import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { Modal } from '../../components/Modal';
import { Pencil, Plus, Trash2, BookOpen, FlaskConical } from 'lucide-react';

const schema = z.object({
  semesterId: z.string().uuid('Select a semester'),
  title: z.string().min(2, 'Course title is required'),
  courseCode: z.string().min(2, 'Course code is required'),
  type: z.enum(['theory', 'lab']),
  teacherIds: z.array(z.string()).optional(),
});
type FormData = z.infer<typeof schema>;

const inputClass = "w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:bg-white transition-all";
const labelClass = "block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5";

export function ManageCourses() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingCourse, setEditingCourse] = useState<any | null>(null);

  const { data: courses = [] } = useQuery({
    queryKey: ['courses-office'],
    queryFn: () => api.get('/courses').then(r => r.data),
  });
  const { data: semesters = [] } = useQuery({
    queryKey: ['semesters'],
    queryFn: () => api.get('/office/semesters').then(r => r.data),
  });
  const { data: teachers = [] } = useQuery({
    queryKey: ['teachers'],
    queryFn: () => api.get('/office/teachers').then(r => r.data),
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { teacherIds: [], type: 'theory' },
  });

  const createMutation = useMutation({
    mutationFn: async (d: FormData) => {
      const courseRes = await api.post('/courses', {
        semesterId: d.semesterId,
        courseCode: d.courseCode,
        title: d.title,
        type: d.type,
      });
      if (d.teacherIds?.length) {
        await Promise.all(d.teacherIds.map(teacherId => api.post('/courses/teachers', { courseId: courseRes.data.id, teacherId })));
      }
      return courseRes.data;
    },
    onSuccess: () => {
      toast.success('Course created!');
      qc.invalidateQueries({ queryKey: ['courses-office'] });
      reset();
      setShowForm(false);
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Omit<FormData, 'teacherIds'> }) => api.patch(`/courses/${id}`, payload),
    onSuccess: () => {
      toast.success('Course updated');
      qc.invalidateQueries({ queryKey: ['courses-office'] });
      setEditingCourse(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed to update course'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/courses/${id}`),
    onSuccess: () => {
      toast.success('Course deleted');
      qc.invalidateQueries({ queryKey: ['courses-office'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed to delete course'),
  });

  const labCourses = courses.filter((c: any) => c.type === 'lab');
  const theoryCourses = courses.filter((c: any) => c.type === 'theory');

  return (
    <AppShell>
      <div className="min-h-screen bg-slate-50">
        {/* Page Header */}
        <div className="bg-white border-b border-slate-200 px-8 py-6 mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-violet-50 rounded-xl">
                <BookOpen size={18} className="text-violet-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">Manage Courses</h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  {theoryCourses.length} theory · {labCourses.length} lab
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowForm(!showForm)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 shadow-sm shadow-indigo-200 transition-all"
            >
              <Plus size={16} /> New Course
            </button>
          </div>
        </div>

        <div className="px-8 pb-10">
          {/* Create Modal */}
          <Modal open={showForm} onClose={() => { setShowForm(false); reset(); }} title="New Course">
            <form onSubmit={handleSubmit(d => createMutation.mutate(d))} className="grid grid-cols-2 gap-5">
              <div>
                <label className={labelClass}>Semester</label>
                <select {...register('semesterId')} className={inputClass}>
                  <option value="">— select semester —</option>
                  {semesters.map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.batchYear})</option>)}
                </select>
                {errors.semesterId && <p className="text-red-500 text-xs mt-1.5">{errors.semesterId.message}</p>}
              </div>
              <div>
                <label className={labelClass}>Course Type</label>
                <select {...register('type')} className={inputClass}>
                  <option value="theory">Theory</option>
                  <option value="lab">Lab</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Course Title</label>
                <input {...register('title')} className={inputClass} placeholder="Data Structures & Algorithms" />
                {errors.title && <p className="text-red-500 text-xs mt-1.5">{errors.title.message}</p>}
              </div>
              <div>
                <label className={labelClass}>Course Code</label>
                <input {...register('courseCode')} className={inputClass} placeholder="CSE-4111" />
                {errors.courseCode && <p className="text-red-500 text-xs mt-1.5">{errors.courseCode.message}</p>}
              </div>

              <div className="col-span-2">
                <label className={labelClass}>Assign Teachers <span className="text-slate-300 normal-case">(optional)</span></label>
                <div className="max-h-40 overflow-auto border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2">
                  {teachers.map((teacher: any) => (
                    <label key={teacher.id} className="flex items-center gap-3 text-sm text-slate-700 py-1 cursor-pointer hover:text-slate-900">
                      <input type="checkbox" value={teacher.id} {...register('teacherIds')} className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                      <span>{teacher.fullName} <span className="text-slate-400 font-mono text-xs">({teacher.teacherId})</span></span>
                    </label>
                  ))}
                  {!teachers.length && <p className="text-sm text-slate-400">No teachers available</p>}
                </div>
              </div>

              <div className="col-span-2 flex gap-3 pt-2 border-t border-slate-100">
                <button type="submit" disabled={isSubmitting} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-all">
                  {isSubmitting ? 'Creating…' : 'Create Course'}
                </button>
                <button type="button" onClick={() => { setShowForm(false); reset(); }} className="px-5 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-50 transition-all">
                  Cancel
                </button>
              </div>
            </form>
          </Modal>

          {/* Edit Modal */}
          <Modal open={!!editingCourse} onClose={() => setEditingCourse(null)} title="Edit Course">
            {editingCourse && (
              <form
                onSubmit={e => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  const payload = {
                    semesterId: String(fd.get('semesterId') || ''),
                    type: String(fd.get('type') || 'theory') as 'theory' | 'lab',
                    title: String(fd.get('title') || ''),
                    courseCode: String(fd.get('courseCode') || ''),
                  };
                  if (!payload.semesterId || !payload.title || !payload.courseCode) { toast.error('Semester, title and course code are required'); return; }
                  updateMutation.mutate({ id: editingCourse.id, payload });
                }}
                className="grid grid-cols-2 gap-5"
              >
                <div>
                  <label className={labelClass}>Semester</label>
                  <select name="semesterId" defaultValue={editingCourse.semesterId} className={inputClass}>
                    {semesters.map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.batchYear})</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Course Type</label>
                  <select name="type" defaultValue={editingCourse.type} className={inputClass}>
                    <option value="theory">Theory</option>
                    <option value="lab">Lab</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Course Title</label>
                  <input name="title" defaultValue={editingCourse.title} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Course Code</label>
                  <input name="courseCode" defaultValue={editingCourse.courseCode} className={inputClass} />
                </div>
                <div className="col-span-2 flex gap-3 pt-2 border-t border-slate-100">
                  <button type="submit" className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-all">Save Changes</button>
                  <button type="button" onClick={() => setEditingCourse(null)} className="px-5 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-50 transition-all">Cancel</button>
                </div>
              </form>
            )}
          </Modal>

          {/* Table */}
          <div className="bg-white rounded-2xl shadow-sm ring-1 ring-black/5 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Code','Course Name','Type','Semester','Enrolled','Actions'].map(h => (
                    <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {courses.map((c: any) => (
                  <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-5 py-4">
                      <span className="font-mono font-semibold text-slate-700">{c.courseCode}</span>
                    </td>
                    <td className="px-5 py-4 font-medium text-slate-800">{c.title}</td>
                    <td className="px-5 py-4">
                      {c.type === 'lab' ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-50 text-amber-700 ring-1 ring-amber-200">
                          <FlaskConical size={11} /> Lab
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 ring-1 ring-blue-200">
                          <BookOpen size={11} /> Theory
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-slate-500">{c.semester?.name?.replace('_', ' ') ?? <span className="text-slate-300">—</span>}</td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center justify-center min-w-[2rem] rounded-lg bg-slate-100 text-slate-600 text-xs font-semibold py-0.5 px-2">
                        {c.enrollments?.length ?? 0}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingCourse(c)}
                          title="Edit course"
                          className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600 transition-all"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => { if (window.confirm(`Delete course ${c.courseCode}?`)) deleteMutation.mutate(c.id); }}
                          title="Delete course"
                          className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-red-100 text-red-400 hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!courses.length && (
                  <tr>
                    <td colSpan={6} className="px-5 py-16 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <BookOpen size={32} className="text-slate-200" />
                        <p className="text-sm text-slate-400">No courses created yet</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
