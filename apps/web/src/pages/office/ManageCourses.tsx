import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { Plus } from 'lucide-react';

const schema = z.object({
  semesterId: z.string().uuid('Select a semester'),
  name: z.string().min(2),
  code: z.string().min(2),
  teacherIds: z.string(), // comma-separated UUIDs
});
type FormData = z.infer<typeof schema>;

export function ManageCourses() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);

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
    defaultValues: { teacherIds: '' },
  });

  const createMutation = useMutation({
    mutationFn: (d: FormData) => api.post('/courses', {
      semesterId: d.semesterId,
      name: d.name,
      code: d.code,
      teacherIds: d.teacherIds.split(',').map(s => s.trim()).filter(Boolean),
    }),
    onSuccess: () => {
      toast.success('Course created!');
      qc.invalidateQueries({ queryKey: ['courses-office'] });
      reset();
      setShowForm(false);
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed'),
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

        {showForm && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 mb-6">
            <h2 className="font-semibold mb-4">New Course</h2>
            <form onSubmit={handleSubmit(d => createMutation.mutate(d))} className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Semester</label>
                <select {...register('semesterId')} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
                  <option value="">— select —</option>
                  {semesters.map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.year})</option>)}
                </select>
                {errors.semesterId && <p className="text-red-500 text-xs mt-1">{errors.semesterId.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Course Name</label>
                <input {...register('name')} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Course Code</label>
                <input {...register('code')} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="CSE-4111" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Teachers (comma-sep UUIDs)</label>
                <input {...register('teacherIds')} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="uuid1, uuid2" />
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
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Code','Name','Semester','Enrolled'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-slate-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {courses.map((c: any) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono font-medium">{c.code}</td>
                  <td className="px-4 py-3">{c.name}</td>
                  <td className="px-4 py-3">{c.semester?.name ?? '—'}</td>
                  <td className="px-4 py-3">{c.enrollmentCount ?? '—'}</td>
                </tr>
              ))}
              {!courses.length && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">No courses yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
