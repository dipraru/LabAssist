import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { Plus, CheckCircle } from 'lucide-react';

const schema = z.object({
  name: z.string().min(1, 'Name required'),
  batchYear: z.string().min(4, 'Year required'),
  startDate: z.string().min(1, 'Start date required'),
  endDate: z.string().min(1, 'End date required'),
});
type FormData = z.infer<typeof schema>;

export function ManageSemesters() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data: semesters = [] } = useQuery({
    queryKey: ['semesters'],
    queryFn: () => api.get('/office/semesters').then(r => r.data),
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const createMutation = useMutation({
    mutationFn: (d: FormData) => api.post('/office/semesters', d),
    onSuccess: () => {
      toast.success('Semester created');
      qc.invalidateQueries({ queryKey: ['semesters'] });
      reset();
      setShowForm(false);
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed'),
  });

  const setCurrentMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/office/semesters/${id}/set-current`),
    onSuccess: () => {
      toast.success('Current semester updated');
      qc.invalidateQueries({ queryKey: ['semesters'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed'),
  });

  return (
    <AppShell>
      <div className="max-w-3xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Semesters</h1>
          <button onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
            <Plus size={16} /> New Semester
          </button>
        </div>

        {showForm && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 mb-6">
            <h2 className="font-semibold mb-4">New Semester</h2>
            <form onSubmit={handleSubmit(d => createMutation.mutate(d))} className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Semester Name</label>
                <select {...register('name')} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
                  <option value="">— select —</option>
                  {['semester_1','semester_2','semester_3','semester_4','semester_5','semester_6','semester_7','semester_8'].map(s => (
                    <option key={s} value={s}>{s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                  ))}
                </select>
                {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Batch Year</label>
                <input {...register('batchYear')} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="2021" />
                {errors.batchYear && <p className="text-red-500 text-xs mt-1">{errors.batchYear.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
                <input type="date" {...register('startDate')} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                {errors.startDate && <p className="text-red-500 text-xs mt-1">{errors.startDate.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
                <input type="date" {...register('endDate')} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                {errors.endDate && <p className="text-red-500 text-xs mt-1">{errors.endDate.message}</p>}
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

        <div className="space-y-3">
          {semesters.map((s: any) => (
            <div key={s.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-800">{s.name?.replace('_', ' ')}</span>
                  {s.isCurrent && <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full font-medium">Current</span>}
                </div>
                <p className="text-sm text-slate-500 mt-0.5">Batch {s.year} · {s.startDate?.slice(0,10)} → {s.endDate?.slice(0,10)}</p>
              </div>
              {!s.isCurrent && (
                <button onClick={() => setCurrentMutation.mutate(s.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-700">
                  <CheckCircle size={14} /> Set Current
                </button>
              )}
            </div>
          ))}
          {!semesters.length && (
            <p className="text-center text-slate-400 py-8">No semesters yet</p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
