import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { Modal } from '../../components/Modal';
import { Plus, CheckCircle, Pencil, Trash2, CalendarDays } from 'lucide-react';

const MAX_BATCH_YEAR = new Date().getFullYear() + 1;

function isValidBatchYear(value: string): boolean {
  if (!/^\d{4}$/.test(value)) return false;
  const year = Number(value);
  return year >= 2000 && year <= MAX_BATCH_YEAR;
}

const schema = z.object({
  name: z.string().min(1, 'Name required'),
  batchYear: z.string()
    .regex(/^\d{4}$/, 'Batch must be a 4-digit year')
    .refine(v => Number(v) >= 2000 && Number(v) <= MAX_BATCH_YEAR, `Batch must be between 2000 and ${MAX_BATCH_YEAR}`),
  startDate: z.string().min(1, 'Start date required'),
  endDate: z.string().min(1, 'End date required'),
});
type FormData = z.infer<typeof schema>;

const semesterLabels: Record<string, string> = {
  semester_1: '1st Semester', semester_2: '2nd Semester', semester_3: '3rd Semester',
  semester_4: '4th Semester', semester_5: '5th Semester', semester_6: '6th Semester',
  semester_7: '7th Semester', semester_8: '8th Semester',
};

const semesterAccent = [
  'from-blue-500 to-blue-600', 'from-violet-500 to-violet-600', 'from-cyan-500 to-cyan-600',
  'from-emerald-500 to-emerald-600', 'from-amber-500 to-amber-600', 'from-rose-500 to-rose-600',
  'from-indigo-500 to-indigo-600', 'from-teal-500 to-teal-600',
];

function getSemesterIndex(name: string): number {
  const match = name.match(/semester_(\d)/);
  return match ? parseInt(match[1]) - 1 : 0;
}

const inputClass = "w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:bg-white transition-all";
const labelClass = "block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5";

function SemesterForm({ initialData, semesters: _s, onSubmit, onCancel, submitLabel = 'Create', isPending = false }: {
  initialData?: any;
  semesters?: any[];
  onSubmit: (data: any) => void;
  onCancel: () => void;
  submitLabel?: string;
  isPending?: boolean;
}) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: initialData ? {
      name: initialData.name,
      batchYear: String(initialData.batchYear),
      startDate: initialData.startDate?.slice(0, 10),
      endDate: initialData.endDate?.slice(0, 10),
    } : undefined,
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-2 gap-5">
      <div>
        <label className={labelClass}>Semester Name</label>
        <select {...register('name')} className={inputClass}>
          <option value="">— select —</option>
          {['semester_1','semester_2','semester_3','semester_4','semester_5','semester_6','semester_7','semester_8'].map(s => (
            <option key={s} value={s}>{semesterLabels[s]}</option>
          ))}
        </select>
        {errors.name && <p className="text-red-500 text-xs mt-1.5">{errors.name.message}</p>}
      </div>
      <div>
        <label className={labelClass}>Batch Year</label>
        <input {...register('batchYear')} className={inputClass} placeholder="2021" />
        {errors.batchYear && <p className="text-red-500 text-xs mt-1.5">{errors.batchYear.message}</p>}
      </div>
      <div>
        <label className={labelClass}>Start Date</label>
        <input type="date" {...register('startDate')} className={inputClass} />
        {errors.startDate && <p className="text-red-500 text-xs mt-1.5">{errors.startDate.message}</p>}
      </div>
      <div>
        <label className={labelClass}>End Date</label>
        <input type="date" {...register('endDate')} className={inputClass} />
        {errors.endDate && <p className="text-red-500 text-xs mt-1.5">{errors.endDate.message}</p>}
      </div>
      <div className="col-span-2 flex gap-3 pt-2 border-t border-slate-100">
        <button type="submit" disabled={isSubmitting || isPending} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-all">
          {isSubmitting || isPending ? 'Saving…' : submitLabel}
        </button>
        <button type="button" onClick={onCancel} className="px-5 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-50 transition-all">
          Cancel
        </button>
      </div>
    </form>
  );
}

export function ManageSemesters() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingSemester, setEditingSemester] = useState<any | null>(null);

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
    onSuccess: () => { toast.success('Current semester updated'); qc.invalidateQueries({ queryKey: ['semesters'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: FormData }) => api.patch(`/office/semesters/${id}`, payload),
    onSuccess: () => { toast.success('Semester updated'); qc.invalidateQueries({ queryKey: ['semesters'] }); setEditingSemester(null); },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed to update semester'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/office/semesters/${id}`),
    onSuccess: () => { toast.success('Semester deleted'); qc.invalidateQueries({ queryKey: ['semesters'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed to delete semester'),
  });

  const formatDate = (d: string) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <AppShell>
      <div className="min-h-screen bg-slate-50">
        {/* Page Header */}
        <div className="bg-white border-b border-slate-200 px-8 py-6 mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-cyan-50 rounded-xl">
                <CalendarDays size={18} className="text-cyan-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">Semesters</h1>
                <p className="text-xs text-slate-400 mt-0.5">{semesters.length} semester{semesters.length !== 1 ? 's' : ''} configured</p>
              </div>
            </div>
            <button
              onClick={() => setShowForm(!showForm)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 shadow-sm shadow-indigo-200 transition-all"
            >
              <Plus size={16} /> New Semester
            </button>
          </div>
        </div>

        <div className="px-8 pb-10">
          <Modal open={showForm} onClose={() => { setShowForm(false); reset(); }} title="New Semester">
            <form onSubmit={handleSubmit(d => createMutation.mutate(d))} className="grid grid-cols-2 gap-5">
              <div>
                <label className={labelClass}>Semester Name</label>
                <select {...register('name')} className={inputClass}>
                  <option value="">— select —</option>
                  {['semester_1','semester_2','semester_3','semester_4','semester_5','semester_6','semester_7','semester_8'].map(s => (
                    <option key={s} value={s}>{semesterLabels[s]}</option>
                  ))}
                </select>
                {errors.name && <p className="text-red-500 text-xs mt-1.5">{errors.name.message}</p>}
              </div>
              <div>
                <label className={labelClass}>Batch Year</label>
                <input {...register('batchYear')} className={inputClass} placeholder="2021" />
                {errors.batchYear && <p className="text-red-500 text-xs mt-1.5">{errors.batchYear.message}</p>}
              </div>
              <div>
                <label className={labelClass}>Start Date</label>
                <input type="date" {...register('startDate')} className={inputClass} />
                {errors.startDate && <p className="text-red-500 text-xs mt-1.5">{errors.startDate.message}</p>}
              </div>
              <div>
                <label className={labelClass}>End Date</label>
                <input type="date" {...register('endDate')} className={inputClass} />
                {errors.endDate && <p className="text-red-500 text-xs mt-1.5">{errors.endDate.message}</p>}
              </div>
              <div className="col-span-2 flex gap-3 pt-2 border-t border-slate-100">
                <button type="submit" disabled={isSubmitting} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-all">
                  {isSubmitting ? 'Creating…' : 'Create Semester'}
                </button>
                <button type="button" onClick={() => { setShowForm(false); reset(); }} className="px-5 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-50 transition-all">Cancel</button>
              </div>
            </form>
          </Modal>

          <Modal open={!!editingSemester} onClose={() => setEditingSemester(null)} title="Edit Semester">
            {editingSemester && (
              <SemesterForm
                initialData={editingSemester}
                onSubmit={d => {
                  if (!isValidBatchYear(d.batchYear)) { toast.error(`Batch must be a valid year between 2000 and ${MAX_BATCH_YEAR}`); return; }
                  updateMutation.mutate({ id: editingSemester.id, payload: d });
                }}
                onCancel={() => setEditingSemester(null)}
                submitLabel="Save Changes"
                isPending={updateMutation.isPending}
              />
            )}
          </Modal>

          {/* Semester Cards */}
          <div className="space-y-3">
            {semesters.map((s: any) => {
              const idx = getSemesterIndex(s.name);
              const accent = semesterAccent[idx % semesterAccent.length];
              return (
                <div key={s.id} className={`bg-white rounded-2xl ring-1 ring-black/5 shadow-sm overflow-hidden flex items-stretch ${s.isCurrent ? 'ring-2 ring-indigo-400' : ''}`}>
                  {/* Left accent stripe */}
                  <div className={`w-1.5 bg-gradient-to-b ${accent} flex-shrink-0`} />

                  <div className="flex items-center justify-between w-full px-6 py-5">
                    <div className="flex items-center gap-5">
                      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${accent} flex items-center justify-center text-white font-bold text-lg flex-shrink-0`}>
                        {idx + 1}
                      </div>
                      <div>
                        <div className="flex items-center gap-2.5">
                          <span className="font-bold text-slate-800 text-base">
                            {semesterLabels[s.name] ?? s.name.replace('_', ' ')}
                          </span>
                          {s.isCurrent && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold rounded-full bg-indigo-600 text-white">
                              ● Active
                            </span>
                          )}
                          <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full font-medium">
                            Batch {s.batchYear}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                          <CalendarDays size={11} />
                          {formatDate(s.startDate)} → {formatDate(s.endDate)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {!s.isCurrent && (
                        <button
                          onClick={() => setCurrentMutation.mutate(s.id)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border border-indigo-200 text-indigo-600 rounded-xl hover:bg-indigo-50 transition-all"
                        >
                          <CheckCircle size={13} /> Set Active
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setEditingSemester(s)}
                        title="Edit semester"
                        className="h-9 w-9 inline-flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600 transition-all"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => { if (window.confirm(`Delete ${s.name} (${s.batchYear})?`)) deleteMutation.mutate(s.id); }}
                        title="Delete semester"
                        className="h-9 w-9 inline-flex items-center justify-center rounded-xl border border-red-100 text-red-400 hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {!semesters.length && (
              <div className="py-20 flex flex-col items-center gap-3 bg-white rounded-2xl ring-1 ring-black/5">
                <CalendarDays size={36} className="text-slate-200" />
                <p className="text-sm text-slate-400">No semesters configured yet</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
