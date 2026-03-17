import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { Modal } from '../../components/Modal';
import { Plus, Download, Clock } from 'lucide-react';

const createSchema = z.object({
  notes: z.string().optional(),
  accessUntil: z.string().min(1, 'Required'),
});
type CreateData = z.infer<typeof createSchema>;

const extendSchema = z.object({
  newAccessUntil: z.string().min(1, 'Required'),
});
type ExtendData = z.infer<typeof extendSchema>;

export function CreateTempJudge() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [extendId, setExtendId] = useState<string | null>(null);
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);

  const { data: judges = [] } = useQuery({
    queryKey: ['temp-judges'],
    queryFn: () => api.get('/office/judges').then(r => r.data),
  });

  const createForm = useForm<CreateData>({ resolver: zodResolver(createSchema) });
  const extendForm = useForm<ExtendData>({ resolver: zodResolver(extendSchema) });

  const createMutation = useMutation({
    mutationFn: (d: CreateData) => api.post('/office/judges', d),
    onSuccess: (res) => {
      toast.success('Temp judge created!');
      if (res.data.credentialsPdf) setPdfBase64(res.data.credentialsPdf);
      qc.invalidateQueries({ queryKey: ['temp-judges'] });
      createForm.reset();
      setShowForm(false);
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed'),
  });

  const extendMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ExtendData }) =>
      api.patch(`/office/judges/${id}/extend`, data),
    onSuccess: () => {
      toast.success('Access extended');
      qc.invalidateQueries({ queryKey: ['temp-judges'] });
      setExtendId(null);
      extendForm.reset();
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed'),
  });

  const downloadCredentialsMutation = useMutation({
    mutationFn: (judgeId: string) => api.get(`/office/judges/${judgeId}/credentials`),
    onSuccess: (res) => {
      if (res.data.credentialsPdf) {
        downloadPdf(res.data.credentialsPdf);
      }
      toast.success('Credentials downloaded');
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed to download credentials'),
  });

  const resetCredentialsMutation = useMutation({
    mutationFn: (judgeId: string) => api.post(`/office/judges/${judgeId}/credentials/reset`),
    onSuccess: (res) => {
      toast.success('Credentials regenerated');
      if (res.data.credentialsPdf) {
        downloadPdf(res.data.credentialsPdf);
      }
      qc.invalidateQueries({ queryKey: ['temp-judges'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed to regenerate credentials'),
  });

  const downloadPdf = (base64: string) => {
    const link = document.createElement('a');
    link.href = `data:application/pdf;base64,${base64}`;
    link.download = 'judge-credentials.pdf';
    link.click();
  };

  return (
    <AppShell>
      <div className="max-w-3xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Temp Judges</h1>
          <button onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
            <Plus size={16} /> Create Temp Judge
          </button>
        </div>

        {pdfBase64 && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4 flex items-center justify-between">
            <p className="text-sm text-green-800 font-medium">Credentials PDF ready</p>
            <button onClick={() => { downloadPdf(pdfBase64); setPdfBase64(null); }}
              className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
              <Download size={14} /> Download
            </button>
          </div>
        )}

        <Modal open={showForm} onClose={() => { setShowForm(false); createForm.reset(); }} title="New Temp Judge">
          <form onSubmit={createForm.handleSubmit(d => createMutation.mutate(d))} className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Access Until</label>
                <input type="datetime-local" {...createForm.register('accessUntil')}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                {createForm.formState.errors.accessUntil && <p className="text-red-500 text-xs mt-1">{createForm.formState.errors.accessUntil.message}</p>}
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes (optional)</label>
                <textarea {...createForm.register('notes')} rows={2}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none" />
              </div>
              <div className="col-span-2 flex gap-3">
                <button type="submit" disabled={createForm.formState.isSubmitting}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                  Create & Generate PDF
                </button>
                <button type="button" onClick={() => { setShowForm(false); createForm.reset(); }}
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
                {['Judge ID','Username','Access From','Access Until','Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-slate-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {judges.map((j: any) => (
                <tr key={j.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs">{j.judgeId}</td>
                  <td className="px-4 py-3 font-medium">{j.user?.username ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{j.accessFrom?.slice(0,16).replace('T',' ')}</td>
                  <td className="px-4 py-3 text-slate-600">{j.accessUntil?.slice(0,16).replace('T',' ')}</td>
                  <td className="px-4 py-3">
                    {extendId === j.id ? (
                      <form onSubmit={extendForm.handleSubmit(d => extendMutation.mutate({ id: j.id, data: d }))}
                        className="flex gap-2 items-center">
                        <input type="datetime-local" {...extendForm.register('newAccessUntil')}
                          className="px-2 py-1 border border-slate-300 rounded text-xs" />
                        <button type="submit" className="px-2 py-1 bg-indigo-600 text-white rounded text-xs">Save</button>
                        <button type="button" onClick={() => setExtendId(null)} className="px-2 py-1 border border-slate-300 rounded text-xs">✕</button>
                      </form>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button onClick={() => setExtendId(j.id)}
                          className="flex items-center gap-1 px-2 py-1 border border-slate-300 rounded text-xs hover:bg-slate-50">
                          <Clock size={12} /> Extend
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadCredentialsMutation.mutate(j.id)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-300 text-slate-600 hover:bg-slate-50"
                          title="Download credentials"
                        >
                          <Download size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => resetCredentialsMutation.mutate(j.id)}
                          className="px-2 py-1 border border-amber-300 text-amber-700 rounded text-xs hover:bg-amber-50"
                          title="Regenerate password and download"
                        >
                          Regenerate
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!judges.length && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No temp judges yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
