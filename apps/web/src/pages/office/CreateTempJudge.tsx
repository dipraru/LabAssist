import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { Modal } from '../../components/Modal';
import { WheelDateTimeInput } from '../../components/WheelDateInput';
import { Plus, Download, Clock, ShieldCheck, RefreshCw } from 'lucide-react';

const createSchema = z.object({
  notes: z.string().optional(),
  accessUntil: z.string().min(1, 'Required'),
});
type CreateData = z.infer<typeof createSchema>;

const extendSchema = z.object({
  newAccessUntil: z.string().min(1, 'Required'),
});
type ExtendData = z.infer<typeof extendSchema>;

const inputClass = "w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:bg-white transition-all";
const labelClass = "block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5";

function formatDateTime(dt: string) {
  if (!dt) return '—';
  const d = new Date(dt);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function isExpired(dt: string) {
  return new Date(dt) < new Date();
}

function getAccessStatus(accessUntil: string) {
  if (!accessUntil) return null;
  if (isExpired(accessUntil)) {
    return { label: 'Expired', class: 'bg-red-50 text-red-600 ring-red-200' };
  }
  const hoursLeft = (new Date(accessUntil).getTime() - Date.now()) / 3600000;
  if (hoursLeft < 24) return { label: 'Expiring soon', class: 'bg-amber-50 text-amber-600 ring-amber-200' };
  return { label: 'Active', class: 'bg-emerald-50 text-emerald-600 ring-emerald-200' };
}

export function CreateTempJudge() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [extendId, setExtendId] = useState<string | null>(null);
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);

  const { data: judges = [] } = useQuery({
    queryKey: ['temp-judges'],
    queryFn: () => api.get('/office/judges').then(r => r.data),
  });

  const createForm = useForm<CreateData>({
    resolver: zodResolver(createSchema),
    defaultValues: { accessUntil: '' },
  });
  const extendForm = useForm<ExtendData>({
    resolver: zodResolver(extendSchema),
    defaultValues: { newAccessUntil: '' },
  });

  const downloadPdf = (base64: string) => {
    const link = document.createElement('a');
    link.href = `data:application/pdf;base64,${base64}`;
    link.download = 'judge-credentials.pdf';
    link.click();
  };

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
    mutationFn: ({ id, data }: { id: string; data: ExtendData }) => api.patch(`/office/judges/${id}/extend`, data),
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
      if (res.data.credentialsPdf) downloadPdf(res.data.credentialsPdf);
      toast.success('Credentials downloaded');
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed to download credentials'),
  });

  const resetCredentialsMutation = useMutation({
    mutationFn: (judgeId: string) => api.post(`/office/judges/${judgeId}/credentials/reset`),
    onSuccess: (res) => {
      toast.success('Credentials regenerated');
      if (res.data.credentialsPdf) downloadPdf(res.data.credentialsPdf);
      qc.invalidateQueries({ queryKey: ['temp-judges'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed to regenerate credentials'),
  });

  return (
    <AppShell>
      <div className="min-h-screen bg-slate-50">
        {/* Page Header */}
        <div className="bg-white border-b border-slate-200 px-8 py-6 mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-rose-50 rounded-xl">
                <ShieldCheck size={18} className="text-rose-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">Temp Judges</h1>
                <p className="text-xs text-slate-400 mt-0.5">Temporary evaluator access management</p>
              </div>
            </div>
            <button
              onClick={() => setShowForm(!showForm)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 shadow-sm shadow-indigo-200 transition-all"
            >
              <Plus size={16} /> Create Judge
            </button>
          </div>
        </div>

        <div className="px-8 pb-10 space-y-4">
          {/* PDF Ready Banner */}
          {pdfBase64 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 rounded-xl">
                  <Download size={16} className="text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-emerald-800">Credentials PDF is ready</p>
                  <p className="text-xs text-emerald-600 mt-0.5">Download and share with the judge</p>
                </div>
              </div>
              <button
                onClick={() => { downloadPdf(pdfBase64); setPdfBase64(null); }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-all"
              >
                <Download size={14} /> Download PDF
              </button>
            </div>
          )}

          {/* Create Modal */}
          <Modal open={showForm} onClose={() => { setShowForm(false); createForm.reset(); }} title="Create Temporary Judge">
            <form onSubmit={createForm.handleSubmit(d => createMutation.mutate(d))} className="space-y-5">
              <div>
                <label className={labelClass}>Access Until</label>
                <Controller
                  control={createForm.control}
                  name="accessUntil"
                  render={({ field }) => (
                    <WheelDateTimeInput
                      value={field.value ?? ''}
                      onChange={field.onChange}
                    />
                  )}
                />
                {createForm.formState.errors.accessUntil && (
                  <p className="text-red-500 text-xs mt-1.5">{createForm.formState.errors.accessUntil.message}</p>
                )}
              </div>
              <div>
                <label className={labelClass}>Notes <span className="text-slate-300 normal-case">(optional)</span></label>
                <textarea
                  {...createForm.register('notes')}
                  rows={3}
                  className={inputClass + ' resize-none'}
                  placeholder="Purpose of access, lab session details…"
                />
              </div>
              <div className="flex gap-3 pt-2 border-t border-slate-100">
                <button
                  type="submit"
                  disabled={createForm.formState.isSubmitting}
                  className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-all"
                >
                  {createForm.formState.isSubmitting ? 'Creating…' : 'Create & Generate Credentials'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForm(false); createForm.reset(); }}
                  className="px-5 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
              </div>
            </form>
          </Modal>

          {/* Judges Table */}
          <div className="bg-white rounded-2xl shadow-sm ring-1 ring-black/5 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Judge','Username','Access From','Access Until','Status','Actions'].map(h => (
                    <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {judges.map((j: any) => {
                  const status = getAccessStatus(j.accessUntil);
                  return (
                    <tr key={j.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-400 to-rose-600 flex items-center justify-center text-white flex-shrink-0">
                            <ShieldCheck size={16} />
                          </div>
                          <span className="font-mono text-xs text-slate-500">{j.judgeId}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 font-semibold text-slate-800">{j.user?.username ?? '—'}</td>
                      <td className="px-5 py-4 text-slate-500 text-xs">{formatDateTime(j.accessFrom)}</td>
                      <td className="px-5 py-4 text-slate-500 text-xs">{formatDateTime(j.accessUntil)}</td>
                      <td className="px-5 py-4">
                        {status && (
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${status.class}`}>
                            {status.label}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {extendId === j.id ? (
                          <form
                            onSubmit={extendForm.handleSubmit(d => extendMutation.mutate({ id: j.id, data: d }))}
                            className="flex items-center gap-2"
                          >
                            <Controller
                              control={extendForm.control}
                              name="newAccessUntil"
                              render={({ field }) => (
                                <WheelDateTimeInput
                                  value={field.value ?? ''}
                                  onChange={field.onChange}
                                />
                              )}
                            />
                            <button type="submit" className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-all">
                              Save
                            </button>
                            <button type="button" onClick={() => setExtendId(null)} className="px-3 py-1.5 border border-slate-200 text-slate-500 rounded-lg text-xs hover:bg-slate-50 transition-all">
                              ✕
                            </button>
                          </form>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setExtendId(j.id)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600 transition-all"
                            >
                              <Clock size={11} /> Extend
                            </button>
                            <button
                              type="button"
                              onClick={() => downloadCredentialsMutation.mutate(j.id)}
                              title="Download credentials"
                              className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600 transition-all"
                            >
                              <Download size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => resetCredentialsMutation.mutate(j.id)}
                              title="Regenerate password"
                              className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-amber-200 text-amber-500 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700 transition-all"
                            >
                              <RefreshCw size={13} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!judges.length && (
                  <tr>
                    <td colSpan={6} className="px-5 py-16 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <ShieldCheck size={32} className="text-slate-200" />
                        <p className="text-sm text-slate-400">No temporary judges created yet</p>
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
