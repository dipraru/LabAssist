import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { Plus, Trash2, ExternalLink } from 'lucide-react';
import { courseCode, courseTitle } from '../../lib/display';

const sheetSchema = z.object({
  courseId: z.string().uuid('Select a course'),
  title: z.string().min(2, 'Title required'),
  description: z.string().optional(),
  links: z.array(z.object({ url: z.string().url('Invalid URL'), label: z.string().optional() })).min(1, 'Add at least one link'),
});
type SheetData = z.infer<typeof sheetSchema>;

export function LectureSheets() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [filterCourse, setFilterCourse] = useState('');
  const [editingSheetId, setEditingSheetId] = useState<string | null>(null);

  const { data: courses = [] } = useQuery({ queryKey: ['my-courses'], queryFn: () => api.get('/courses/my').then(r => r.data) });

  const { data: sheets = [] } = useQuery({
    queryKey: ['lecture-sheets', filterCourse],
    queryFn: () => api.get(`/courses/${filterCourse}/lecture-sheets`).then(r => r.data),
    enabled: !!filterCourse,
  });

  const { register, control, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<SheetData>({
    resolver: zodResolver(sheetSchema),
    defaultValues: { links: [{ url: '', label: '' }] },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'links' });

  const createMutation = useMutation({
    mutationFn: (d: SheetData) => api.post('/courses/lecture-sheets', {
      title: d.title,
      description: d.description,
      courseId: d.courseId,
      links: d.links,
    }),
    onSuccess: () => {
      toast.success('Lecture sheet posted!');
      qc.invalidateQueries({ queryKey: ['lecture-sheets'] });
      reset({ links: [{ url: '', label: '' }] });
      setShowForm(false);
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed'),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; data: SheetData }) => api.patch(`/courses/lecture-sheets/${payload.id}`, {
      title: payload.data.title,
      description: payload.data.description,
      links: payload.data.links,
    }),
    onSuccess: () => {
      toast.success('Lecture sheet updated');
      qc.invalidateQueries({ queryKey: ['lecture-sheets'] });
      reset({ links: [{ url: '', label: '' }] });
      setShowForm(false);
      setEditingSheetId(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed to update'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/courses/lecture-sheets/${id}`),
    onSuccess: () => {
      toast.success('Lecture sheet deleted');
      qc.invalidateQueries({ queryKey: ['lecture-sheets'] });
      if (editingSheetId) {
        reset({ links: [{ url: '', label: '' }] });
        setShowForm(false);
        setEditingSheetId(null);
      }
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed to delete'),
  });

  const onEdit = (sheet: any) => {
    setEditingSheetId(sheet.id);
    setShowForm(true);
    reset({
      courseId: sheet.courseId,
      title: sheet.title,
      description: sheet.description ?? '',
      links: Array.isArray(sheet.links) && sheet.links.length ? sheet.links : [{ url: '', label: '' }],
    });
  };

  const onCancel = () => {
    setShowForm(false);
    setEditingSheetId(null);
    reset({ links: [{ url: '', label: '' }] });
  };

  return (
    <AppShell>
      <div className="max-w-3xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Lecture Sheets</h1>
          <button onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
            <Plus size={16} /> Post Sheet
          </button>
        </div>

        <div className="mb-4">
          <select value={filterCourse} onChange={e => setFilterCourse(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm">
            <option value="">— select course —</option>
            {(courses as any[]).map((c: any) => <option key={c.id} value={c.id}>{courseCode(c)} - {courseTitle(c)}</option>)}
          </select>
        </div>

        {showForm && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 mb-6">
            <h2 className="font-semibold mb-4">{editingSheetId ? 'Edit Lecture Sheet' : 'New Lecture Sheet'}</h2>
            <form
              onSubmit={handleSubmit((d) => {
                if (editingSheetId) {
                  updateMutation.mutate({ id: editingSheetId, data: d });
                  return;
                }
                createMutation.mutate(d);
              })}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Course</label>
                <select
                  {...register('courseId')}
                  disabled={!!editingSheetId}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-100 disabled:text-slate-500"
                >
                  <option value="">— select —</option>
                  {(courses as any[]).map((c: any) => <option key={c.id} value={c.id}>{courseCode(c)}</option>)}
                </select>
                {errors.courseId && <p className="text-red-500 text-xs mt-1">{errors.courseId.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
                <input {...register('title')} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description (optional)</label>
                <textarea {...register('description')} rows={2} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-slate-700">Links</label>
                  <button type="button" onClick={() => append({ url: '', label: '' })}
                    className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800">
                    <Plus size={12} /> Add link
                  </button>
                </div>
                {fields.map((field, idx) => (
                  <div key={field.id} className="flex gap-2 mb-2">
                    <input {...register(`links.${idx}.url`)} placeholder="https://..." className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                    <input {...register(`links.${idx}.label`)} placeholder="Label (opt.)" className="w-32 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                    {fields.length > 1 && (
                      <button type="button" onClick={() => remove(idx)} className="p-2 text-red-400 hover:text-red-600">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                ))}
                {errors.links && <p className="text-red-500 text-xs mt-1">{errors.links.message as string}</p>}
              </div>
              <div className="flex gap-3">
                <button type="submit" disabled={isSubmitting}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">{editingSheetId ? 'Save Changes' : 'Post'}</button>
                <button type="button" onClick={onCancel}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">Cancel</button>
              </div>
            </form>
          </div>
        )}

        <div className="space-y-3">
          {(sheets as any[]).map((s: any) => (
            <div key={s.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold text-slate-800">{s.title}</p>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onEdit(s)}
                    className="px-2 py-1 text-xs border border-slate-300 rounded hover:bg-slate-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Delete this lecture sheet?')) {
                        deleteMutation.mutate(s.id);
                      }
                    }}
                    className="px-2 py-1 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
              {s.description && <p className="text-sm text-slate-500 mt-0.5">{s.description}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                {(s.links ?? []).map((l: any, i: number) => (
                  <a key={i} href={l.url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium hover:bg-indigo-100">
                    <ExternalLink size={11} /> {l.label || l.url}
                  </a>
                ))}
              </div>
            </div>
          ))}
          {filterCourse && !(sheets as any[]).length && <p className="text-center text-slate-400 py-6">No sheets posted for this course</p>}
          {!filterCourse && <p className="text-center text-slate-400 py-6">Select a course to see lecture sheets</p>}
        </div>
      </div>
    </AppShell>
  );
}
