import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Download, FileText, KeyRound, Plus, Users } from 'lucide-react';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';

function parseNames(rawText: string): string[] {
  const lines = rawText
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    throw new Error('Add at least one participant name');
  }
  if (lines.length > 200) {
    throw new Error('Maximum 200 participants are allowed per batch');
  }
  if (lines.some((line) => line.includes(','))) {
    throw new Error('Use one participant name per line, without commas');
  }
  return lines;
}

function downloadPdfBase64(base64: string, fileName: string) {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i += 1) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function ContestParticipants() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [namesText, setNamesText] = useState('');
  const [latestPdfBase64, setLatestPdfBase64] = useState<string | null>(null);

  const { data: contest } = useQuery({
    queryKey: ['contest', id],
    queryFn: () => api.get(`/contests/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  const { data: participants = [] } = useQuery({
    queryKey: ['contest-participants', id],
    queryFn: () => api.get(`/contests/${id}/participants`).then((r) => r.data),
    enabled: !!id,
  });

  const parsedPreview = useMemo(() => {
    try {
      return parseNames(namesText);
    } catch {
      return [];
    }
  }, [namesText]);

  const createMutation = useMutation({
    mutationFn: () => {
      if (!id) throw new Error('Contest not selected');
      const names = parseNames(namesText);
      return api.post('/contests/participants/bulk', { contestId: id, names });
    },
    onSuccess: (res) => {
      const pdf = res.data?.credentialsPdfBase64;
      const created = res.data?.participants?.length ?? 0;
      toast.success(`${created} participants created`);
      if (pdf) {
        setLatestPdfBase64(pdf);
        downloadPdfBase64(pdf, `contest-${id}-latest-credentials.pdf`);
      }
      setNamesText('');
      qc.invalidateQueries({ queryKey: ['contest-participants', id] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? e.message ?? 'Failed'),
  });

  const downloadAllMutation = useMutation({
    mutationFn: () => api.get(`/contests/${id}/participants/credentials-pdf`),
    onSuccess: (res) => {
      const pdf = res.data?.credentialsPdfBase64;
      if (!pdf) {
        toast.error('No credentials PDF returned');
        return;
      }
      downloadPdfBase64(pdf, `contest-${id}-all-credentials.pdf`);
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed to download credentials'),
  });

  const onCsvSelected = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const names = parseNames(text);
      setNamesText(names.join('\n'));
      toast.success(`${names.length} names loaded`);
    } catch (error: any) {
      toast.error(error?.message ?? 'Failed to parse CSV');
    }
  };

  return (
    <AppShell>
      <div className="oj-page space-y-6">
        <section className="oj-hero p-6 sm:p-7">
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-5">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.18em] text-teal-50 ring-1 ring-white/20">
                <Users size={14} />
                Participants
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight">{contest?.title ?? 'Contest Participants'}</h1>
              <p className="mt-2 text-sm font-semibold text-teal-50/85">Create temporary accounts from real names and immediately download secure credentials.</p>
            </div>
            <button
              type="button"
              onClick={() => downloadAllMutation.mutate()}
              disabled={downloadAllMutation.isPending || !(participants as any[]).length}
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-extrabold text-teal-800 shadow-xl shadow-slate-950/10 disabled:opacity-50"
            >
              <Download size={16} />
              Download All Credentials
            </button>
          </div>
          <div className="relative z-10 mt-7 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-white/12 p-4 ring-1 ring-white/20">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-50/70">Registered</p>
              <p className="mt-1 text-2xl font-extrabold">{(participants as any[]).length}</p>
            </div>
            <div className="rounded-2xl bg-white/12 p-4 ring-1 ring-white/20">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-50/70">Ready To Create</p>
              <p className="mt-1 text-2xl font-extrabold">{parsedPreview.length}</p>
            </div>
            <div className="rounded-2xl bg-white/12 p-4 ring-1 ring-white/20">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-50/70">Batch Limit</p>
              <p className="mt-1 text-2xl font-extrabold">200</p>
            </div>
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="oj-panel p-5">
            <p className="oj-kicker"><Plus size={14} /> Bulk Create</p>
            <h2 className="mt-3 text-xl font-extrabold text-slate-950">Create Participant Accounts</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">Paste one name per line or upload a one-column CSV file.</p>

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-1 block text-sm font-bold text-slate-700">Participant names</span>
                <textarea
                  value={namesText}
                  onChange={(event) => setNamesText(event.target.value)}
                  rows={12}
                  placeholder={'Ayesha Rahman\nNafis Ahmed\nMaliha Karim'}
                  className="oj-textarea resize-y"
                />
              </label>

              <label className="flex cursor-pointer items-center gap-3 rounded-3xl border-2 border-dashed border-slate-200 bg-white/70 p-4 transition-colors hover:border-teal-300 hover:bg-teal-50">
                <FileText size={22} className="text-teal-700" />
                <span>
                  <span className="block text-sm font-extrabold text-slate-800">Upload CSV</span>
                  <span className="block text-xs font-semibold text-slate-500">One column only, participant name per row.</span>
                </span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(event) => void onCsvSelected(event.target.files?.[0] ?? null)}
                />
              </label>

              <button
                type="button"
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || parsedPreview.length === 0}
                className="oj-btn-primary w-full disabled:opacity-50"
              >
                <KeyRound size={16} />
                {createMutation.isPending ? 'Creating...' : 'Create & Download Credentials'}
              </button>

              {latestPdfBase64 && (
                <button
                  type="button"
                  onClick={() => downloadPdfBase64(latestPdfBase64, `contest-${id}-latest-credentials.pdf`)}
                  className="oj-btn-secondary w-full"
                >
                  <Download size={16} />
                  Download Latest Batch Again
                </button>
              )}
            </div>
          </section>

          <section className="oj-panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-extrabold text-slate-950">Registered Participants</h2>
              <span className="oj-chip bg-slate-100 text-slate-600">{(participants as any[]).length} total</span>
            </div>
            <div className="max-h-[620px] overflow-auto oj-scrollbar">
              <table className="oj-table">
                <thead>
                  <tr>
                    {['Participant ID', 'Username', 'Full Name', 'Access Until'].map((heading) => (
                      <th key={heading}>{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(participants as any[]).map((participant: any) => (
                    <tr key={participant.id}>
                      <td className="font-mono text-xs">{participant.participantId}</td>
                      <td className="font-semibold">{participant.user?.username ?? '—'}</td>
                      <td>{participant.fullName}</td>
                      <td className="text-slate-500">{participant.accessUntil?.slice(0, 16).replace('T', ' ') ?? '—'}</td>
                    </tr>
                  ))}
                  {!(participants as any[]).length && (
                    <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">No participants yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
