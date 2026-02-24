import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { Plus, Download } from 'lucide-react';

const schema = z.object({
  fullName: z.string().min(1),
  teacherId: z.string().min(1),
  designation: z.enum(['Lecturer','Senior Lecturer','Assistant Professor','Associate Professor','Professor','Head of Department']),
  email: z.string().email(),
  phone: z.string().optional(),
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

        {showForm && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 mb-6">
            <h2 className="font-semibold text-slate-800 mb-4">New Teacher</h2>
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
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Teacher ID','Name','Designation','Email','Phone'].map(h => (
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
                </tr>
              ))}
              {!teachers.length && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No teachers yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
