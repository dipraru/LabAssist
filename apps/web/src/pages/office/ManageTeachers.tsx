import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { Modal } from '../../components/Modal';
import { Plus, Download, Trash2, Users } from 'lucide-react';

const schema = z.object({
  fullName: z.string().min(1),
  teacherId: z.string().min(1),
  designation: z.enum(['Lecturer','Senior Lecturer','Assistant Professor','Associate Professor','Professor','Head of Department']),
  email: z.string().email(),
  phone: z.string().min(1, 'Phone number is required'),
  gender: z.enum(['male','female','other']).optional(),
});
type FormData = z.infer<typeof schema>;

const designationColor: Record<string, string> = {
  'Lecturer': 'bg-sky-50 text-sky-700 ring-sky-200',
  'Senior Lecturer': 'bg-blue-50 text-blue-700 ring-blue-200',
  'Assistant Professor': 'bg-violet-50 text-violet-700 ring-violet-200',
  'Associate Professor': 'bg-purple-50 text-purple-700 ring-purple-200',
  'Professor': 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  'Head of Department': 'bg-amber-50 text-amber-700 ring-amber-200',
};

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
}

const avatarColors = [
  'bg-blue-500', 'bg-violet-500', 'bg-emerald-500',
  'bg-rose-500', 'bg-amber-500', 'bg-cyan-500',
];

const inputClass = "w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:bg-white transition-all";
const labelClass = "block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5";

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
      <div className="min-h-screen bg-slate-50">
        {/* Page Header */}
        <div className="bg-white border-b border-slate-200 px-8 py-6 mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 rounded-xl">
                <Users size={18} className="text-blue-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">Manage Teachers</h1>
                <p className="text-xs text-slate-400 mt-0.5">{teachers.length} faculty member{teachers.length !== 1 ? 's' : ''} registered</p>
              </div>
            </div>
            <button
              onClick={() => setShowForm(!showForm)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 active:bg-indigo-800 shadow-sm shadow-indigo-200 transition-all"
            >
              <Plus size={16} /> Add Teacher
            </button>
          </div>
        </div>

        <div className="px-8 pb-10">
          <Modal open={showForm} onClose={() => { setShowForm(false); reset(); }} title="New Teacher">
            <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="grid grid-cols-2 gap-5">
              {[
                { name: 'fullName', label: 'Full Name', type: 'text', placeholder: 'Dr. John Smith' },
                { name: 'teacherId', label: 'Teacher ID', type: 'text', placeholder: 'T-001' },
                { name: 'email', label: 'Email Address', type: 'email', placeholder: 'john@university.edu' },
                { name: 'phone', label: 'Phone Number', type: 'text', placeholder: '+880 1XXX-XXXXXX' },
              ].map(f => (
                <div key={f.name}>
                  <label className={labelClass}>{f.label}</label>
                  <input
                    {...register(f.name as keyof FormData)}
                    type={f.type}
                    placeholder={f.placeholder}
                    className={inputClass}
                  />
                  {errors[f.name as keyof FormData] && (
                    <p className="text-red-500 text-xs mt-1.5">{errors[f.name as keyof FormData]?.message}</p>
                  )}
                </div>
              ))}

              <div>
                <label className={labelClass}>Gender</label>
                <select {...register('gender')} className={inputClass}>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className={labelClass}>Designation</label>
                <select {...register('designation')} className={inputClass}>
                  {['Lecturer','Senior Lecturer','Assistant Professor','Associate Professor','Professor','Head of Department'].map(d => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </div>

              <div className="col-span-2 flex gap-3 pt-2 border-t border-slate-100">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-all"
                >
                  {isSubmitting ? 'Creating…' : 'Create & Download Credentials'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForm(false); reset(); }}
                  className="px-5 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
              </div>
            </form>
          </Modal>

          {/* Table */}
          <div className="bg-white rounded-2xl shadow-sm ring-1 ring-black/5 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Teacher','Designation','Email','Phone','Actions'].map(h => (
                    <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {teachers.map((t: any, i: number) => (
                  <tr key={t.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl ${avatarColors[i % avatarColors.length]} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                          {getInitials(t.fullName)}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800">{t.fullName}</p>
                          <p className="text-xs text-slate-400 font-mono">{t.teacherId}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${designationColor[t.designation] ?? 'bg-slate-100 text-slate-600 ring-slate-200'}`}>
                        {t.designation}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-600">{t.email}</td>
                    <td className="px-5 py-4 text-slate-500">{t.phone ?? <span className="text-slate-300">—</span>}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => resetCredentialsMutation.mutate(t.id)}
                          title="Download credentials"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600 transition-all"
                        >
                          <Download size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => { if (window.confirm(`Delete teacher ${t.teacherId}?`)) deleteMutation.mutate(t.id); }}
                          title="Delete teacher"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-100 text-red-400 hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!teachers.length && (
                  <tr>
                    <td colSpan={5} className="px-5 py-16 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Users size={32} className="text-slate-200" />
                        <p className="text-sm text-slate-400">No teachers registered yet</p>
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
