import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { Modal } from '../../components/Modal';
import { Plus, Download, Trash2 } from 'lucide-react';

const schema = z.object({
  fullName: z.string().min(1),
  teacherId: z.string().min(1),
  designation: z.enum(['Lecturer','Senior Lecturer','Assistant Professor','Associate Professor','Professor','Head of Department']),
  email: z.string().email(),
  phone: z.string().optional(),
  gender: z.enum(['male','female','other']).optional(),
});
type FormData = z.infer<typeof schema>;

export function ManageTeachers() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data: teachers = [] } = useQuery({
    queryKey: ['teachers'],
    queryFn: () => api.get('/office/teachers').then(r => r.data),
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const createMutation = useMutation({
    mutationFn: (data: FormData) => api.post('/office/teachers', data),
    onSuccess: (res) => {
      toast.success('Teacher created!');
      qc.invalidateQueries({ queryKey: ['teachers'] });
      // Download PDF
      if (res.data.credentialsPdf) {
        const link = document.createElement('a');
        link.href = `data:application/pdf;base64,${res.data.credentialsPdf}`;
        link.download = `credentials_${res.data.teacher?.teacherId ?? 'teacher'}.pdf`;
        link.click();
      }
      reset();
      setShowForm(false);
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed'),
  });

  const resetCredentialsMutation = useMutation({
    mutationFn: (teacherId: string) => api.post(`/office/teachers/${teacherId}/credentials/reset`),
    onSuccess: (res) => {
      toast.success('Credentials regenerated');
      if (res.data.credentialsPdf) {
        const link = document.createElement('a');
        link.href = `data:application/pdf;base64,${res.data.credentialsPdf}`;
        link.download = `credentials_${res.data.teacher?.teacherId ?? 'teacher'}.pdf`;
        link.click();
      }
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed to regenerate credentials'),
  });

  const deleteMutation = useMutation({
    mutationFn: (teacherId: string) => api.delete(`/office/teachers/${teacherId}`),
    onSuccess: () => {
      toast.success('Teacher deleted');
      qc.invalidateQueries({ queryKey: ['teachers'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed to delete teacher'),
  });

  return (
    <AppShell>
      <div className="max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Manage Teachers</h1>
          <button onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
            <Plus size={16} /> Add Teacher
          </button>
        </div>

        <Modal open={showForm} onClose={() => { setShowForm(false); reset(); }} title="New Teacher">
          <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="grid grid-cols-2 gap-4">
              {[
                { name: 'fullName', label: 'Full Name', type: 'text' },
                { name: 'teacherId', label: 'Teacher ID', type: 'text' },
                { name: 'email', label: 'Email', type: 'email' },
                { name: 'phone', label: 'Phone (optional)', type: 'text' },
              ].map(f => (
                <div key={f.name}>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{f.label}</label>
                  <input {...register(f.name as keyof FormData)} type={f.type}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  {errors[f.name as keyof FormData] && (
                    <p className="text-red-500 text-xs mt-1">{errors[f.name as keyof FormData]?.message}</p>
                  )}
                </div>
              ))}

              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Gender</label>
                <select {...register('gender')}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Designation</label>
                <select {...register('designation')}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                  {['Lecturer','Senior Lecturer','Assistant Professor','Associate Professor','Professor','Head of Department'].map(d => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </div>

              <div className="col-span-2 flex gap-3">
                <button type="submit" disabled={isSubmitting}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                  Create & Download Credentials
                </button>
                <button type="button" onClick={() => { setShowForm(false); reset(); }}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">
                  Cancel
                </button>
              </div>
          </form>
        </Modal>

        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Teacher ID','Name','Designation','Email','Phone','Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-slate-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {teachers.map((t: any) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono">{t.teacherId}</td>
                  <td className="px-4 py-3">{t.fullName}</td>
                  <td className="px-4 py-3">{t.designation}</td>
                  <td className="px-4 py-3">{t.email}</td>
                  <td className="px-4 py-3">{t.phone ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => resetCredentialsMutation.mutate(t.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
                        title="Download credentials"
                      >
                        <Download size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Delete teacher ${t.teacherId}?`)) {
                            deleteMutation.mutate(t.id);
                          }
                        }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 text-red-600 hover:bg-red-50"
                        title="Delete teacher"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!teachers.length && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No teachers yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
