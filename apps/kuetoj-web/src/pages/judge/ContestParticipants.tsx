import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { Users, Download, Plus } from 'lucide-react';

const schema = z.object({ count: z.coerce.number().int().min(1).max(100) });
type FormInput = z.input<typeof schema>;
type FormData = z.output<typeof schema>;

export function ContestParticipants() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);

  const { data: participants = [] } = useQuery({
    queryKey: ['contest-participants', id],
    queryFn: () => api.get(`/contests/${id}/participants`).then(r => r.data),
  });

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormInput, unknown, FormData>({
    resolver: zodResolver(schema),
    defaultValues: { count: 10 },
  });

  const createMutation = useMutation({
    mutationFn: (d: FormData) => api.post('/contests/participants/bulk', { contestId: id, count: d.count }),
    onSuccess: (res) => {
      toast.success('Participants created!');
      if (res.data.pdf) setPdfBase64(res.data.pdf);
      qc.invalidateQueries({ queryKey: ['contest-participants'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed'),
  });

  const downloadPdf = () => {
    if (!pdfBase64) return;
    const link = document.createElement('a');
    link.href = `data:application/pdf;base64,${pdfBase64}`;
    link.download = `contest-${id}-participants.pdf`;
    link.click();
  };

  return (
    <AppShell>
      <div className="max-w-3xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Participants</h1>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Users size={16} />
            <span>{(participants as any[]).length} registered</span>
          </div>
        </div>

        {pdfBase64 && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4 flex items-center justify-between">
            <p className="text-sm text-green-800 font-medium">Credentials PDF ready — download and distribute</p>
            <button onClick={downloadPdf}
              className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
              <Download size={14} /> Download PDF
            </button>
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 mb-6">
          <h2 className="font-semibold mb-3 flex items-center gap-2"><Plus size={16} /> Bulk Create Participants</h2>
          <form onSubmit={handleSubmit(d => createMutation.mutate(d))} className="flex gap-3 items-end">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Number to create</label>
              <input type="number" {...register('count')} min={1} max={100}
                className="w-28 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
              {errors.count && <p className="text-red-500 text-xs mt-1">{errors.count.message}</p>}
            </div>
            <button type="submit" disabled={isSubmitting}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              Create & Generate PDF
            </button>
          </form>
          <p className="text-xs text-slate-400 mt-2">
            Creates temp participant accounts with auto-generated credentials. PDF contains 2-column cut sheets.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Participant ID', 'Username', 'Full Name', 'Access Until'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-slate-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(participants as any[]).map((p: any) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs">{p.participantId}</td>
                  <td className="px-4 py-3 font-medium">{p.user?.username ?? '—'}</td>
                  <td className="px-4 py-3">{p.fullName}</td>
                  <td className="px-4 py-3 text-slate-500">{p.accessUntil?.slice(0,16).replace('T',' ')}</td>
                </tr>
              ))}
              {!(participants as any[]).length && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">No participants yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
