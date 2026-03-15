import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { Modal } from '../../components/Modal';
import { Pencil, Plus, Trash2 } from 'lucide-react';

const schema = z.object({
  semesterId: z.string().uuid('Select a semester'),
  title: z.string().min(2, 'Course title is required'),
  courseCode: z.string().min(2, 'Course code is required'),
  type: z.enum(['theory', 'lab']),
  teacherIds: z.array(z.string()).optional(),
});
type FormData = z.infer<typeof schema>;

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
        await Promise.all(
          d.teacherIds.map((teacherId) => api.post('/courses/teachers', {
            courseId: courseRes.data.id,
            teacherId,
          })),
        );
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

  return (
    <AppShell>
      <div className="max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Courses</h1>
          <button onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
            <Plus size={16} /> New Course
          </button>
        </div>

        <Modal open={showForm} onClose={() => { setShowForm(false); reset(); }} title="New Course">
          <form onSubmit={handleSubmit(d => createMutation.mutate(d))} className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Semester</label>
                <select {...register('semesterId')} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
                  <option value="">— select —</option>
                  {semesters.map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.batchYear})</option>)}
                </select>
                {errors.semesterId && <p className="text-red-500 text-xs mt-1">{errors.semesterId.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Course Type</label>
                <select {...register('type')} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
                  <option value="theory">Theory</option>
                  <option value="lab">Lab</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Course Title</label>
                <input {...register('title')} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Course Code</label>
                <input {...register('courseCode')} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="CSE-4111" />
                {errors.courseCode && <p className="text-red-500 text-xs mt-1">{errors.courseCode.message}</p>}
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-2">Assign Teachers (optional)</label>
                <div className="max-h-40 overflow-auto border border-slate-300 rounded-lg p-3 grid grid-cols-1 gap-2">
                  {teachers.map((teacher: any) => (
                    <label key={teacher.id} className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" value={teacher.id} {...register('teacherIds')} />
                      <span>{teacher.fullName} ({teacher.teacherId})</span>
                    </label>
                  ))}
                  {!teachers.length && <p className="text-sm text-slate-400">No teachers available</p>}
                </div>
              </div>

              <div className="col-span-2 flex gap-3">
                <button type="submit" disabled={isSubmitting}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                  Create
                </button>
                <button type="button" onClick={() => { setShowForm(false); reset(); }}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">
                  Cancel
                </button>
              </div>
          </form>
        </Modal>

        <Modal
          open={!!editingCourse}
          onClose={() => setEditingCourse(null)}
          title="Edit Course"
        >
          {editingCourse && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const formData = new FormData(event.currentTarget);
                const payload = {
                  semesterId: String(formData.get('semesterId') || ''),
                  type: String(formData.get('type') || 'theory') as 'theory' | 'lab',
                  title: String(formData.get('title') || ''),
                  courseCode: String(formData.get('courseCode') || ''),
                };
                if (!payload.semesterId || !payload.title || !payload.courseCode) {
                  toast.error('Semester, title and course code are required');
                  return;
                }
                updateMutation.mutate({ id: editingCourse.id, payload });
              }}
              className="grid grid-cols-2 gap-4"
            >
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Semester</label>
                <select name="semesterId" defaultValue={editingCourse.semesterId} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
                  {semesters.map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.batchYear})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Course Type</label>
                <select name="type" defaultValue={editingCourse.type} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
                  <option value="theory">Theory</option>
                  <option value="lab">Lab</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Course Title</label>
                <input name="title" defaultValue={editingCourse.title} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Course Code</label>
                <input name="courseCode" defaultValue={editingCourse.courseCode} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
              </div>
              <div className="col-span-2 flex gap-3">
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
                  Save Changes
                </button>
                <button type="button" onClick={() => setEditingCourse(null)} className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">
                  Cancel
                </button>
              </div>
            </form>
          )}
        </Modal>

        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Code','Name','Semester','Enrolled','Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-slate-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {courses.map((c: any) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono font-medium">{c.courseCode}</td>
                  <td className="px-4 py-3">{c.title}</td>
                  <td className="px-4 py-3">{c.semester?.name ?? '—'}</td>
                  <td className="px-4 py-3">{c.enrollments?.length ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingCourse(c)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
                        title="Edit course"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Delete course ${c.courseCode}?`)) {
                            deleteMutation.mutate(c.id);
                          }
                        }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 text-red-600 hover:bg-red-50"
                        title="Delete course"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!courses.length && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No courses yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
