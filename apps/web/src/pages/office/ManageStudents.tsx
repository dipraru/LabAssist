import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { Modal } from '../../components/Modal';
import { Plus, Upload } from 'lucide-react';

const singleSchema = z.object({
  studentId: z.string().min(7).max(7),
  fullName: z.string().optional(),
});
type SingleForm = z.infer<typeof singleSchema>;

export function ManageStudents() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<'list' | 'single' | 'bulk'>('list');
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [search, setSearch] = useState('');

  const { data: students = [] } = useQuery({
    queryKey: ['students'],
    queryFn: () => api.get('/office/students').then(r => r.data),
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<SingleForm>({
    resolver: zodResolver(singleSchema),
  });

  const createSingle = useMutation({
    mutationFn: (d: SingleForm) => api.post('/office/students', d),
    onSuccess: (res) => {
      toast.success('Student created!');
      if (res.data.credentialsPdf) {
        const link = document.createElement('a');
        link.href = `data:application/pdf;base64,${res.data.credentialsPdf}`;
        link.download = `credentials_${res.data.student?.studentId ?? 'student'}.pdf`;
        link.click();
      }
      qc.invalidateQueries({ queryKey: ['students'] });
      reset();
      setMode('list');
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed'),
  });

  const bulkMutation = useMutation({
    mutationFn: async () => {
      if (!bulkFile) return null;
      const fd = new FormData();
      fd.append('file', bulkFile);
      const res = await api.post('/office/students/bulk', fd);
      return res.data;
    },
    onSuccess: (data) => {
      if (!data) return;

      if (data.credentialsPdf) {
        const link = document.createElement('a');
        link.href = `data:application/pdf;base64,${data.credentialsPdf}`;
        link.download = 'student_credentials_bulk.pdf';
        link.click();
      }

      const created = data.createdCount ?? data.credentials?.length ?? 0;
      const skipped = data.skippedCount ?? 0;
      toast.success(`Bulk import complete! Created ${created}${skipped ? `, skipped ${skipped}` : ''}.`);
      qc.invalidateQueries({ queryKey: ['students'] });
      setBulkFile(null);
      setMode('list');
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Bulk import failed'),
  });

  const filtered = students.filter((s: any) =>
    !search || s.studentId?.includes(search) || s.fullName?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppShell>
      <div className="max-w-5xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Manage Students</h1>
          <div className="flex gap-2">
            <button onClick={() => setMode('single')}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
              <Plus size={16} /> Add Student
            </button>
            <button onClick={() => setMode('bulk')}
              className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">
              <Upload size={16} /> Bulk Import
            </button>
          </div>
        </div>

        <Modal
          open={mode === 'single'}
          onClose={() => { setMode('list'); reset(); }}
          title="New Student"
          maxWidthClass="max-w-3xl"
        >
          <form onSubmit={handleSubmit((d) => createSingle.mutate(d))} className="flex gap-4 items-end flex-wrap">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Student ID (7 digits)</label>
                <input {...register('studentId')} className="w-36 px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="2107070" />
                {errors.studentId && <p className="text-red-500 text-xs mt-1">{errors.studentId.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Full Name (optional)</label>
                <input {...register('fullName')} className="w-56 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
              </div>
              <button type="submit" disabled={isSubmitting}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                Create
              </button>
              <button type="button" onClick={() => setMode('list')}
                className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
          </form>
        </Modal>

        <Modal
          open={mode === 'bulk'}
          onClose={() => { setMode('list'); setBulkFile(null); }}
          title="Bulk Import Students"
          maxWidthClass="max-w-3xl"
        >
          <p className="text-sm text-slate-500 mb-4">CSV columns: <code className="bg-slate-100 px-1 rounded">studentId,fullName</code> (fullName optional)</p>
          <div className="flex gap-4 items-center">
            <input type="file" accept=".csv" onChange={e => setBulkFile(e.target.files?.[0] ?? null)}
              className="text-sm text-slate-600" />
            <button onClick={() => bulkMutation.mutate()} disabled={!bulkFile || bulkMutation.isPending}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              Import & Download PDF
            </button>
            <button onClick={() => setMode('list')}
              className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </Modal>

        {/* Search */}
        <div className="mb-4">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by ID or name…"
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Student ID','Name','Batch','Roll','Profile'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-slate-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((s: any) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono">{s.studentId}</td>
                  <td className="px-4 py-3">{s.fullName ?? <span className="text-slate-400">—</span>}</td>
                  <td className="px-4 py-3">{s.batchYear}</td>
                  <td className="px-4 py-3">{s.rollNumber}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.profileCompleted ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {s.profileCompleted ? 'Complete' : 'Incomplete'}
                    </span>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No students found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
