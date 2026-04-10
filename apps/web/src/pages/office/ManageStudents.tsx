import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { Modal } from '../../components/Modal';
import { CheckSquare, Download, Pencil, Plus, Trash2, Upload, X, GraduationCap, Search } from 'lucide-react';

const MAX_BATCH_YEAR = new Date().getFullYear() + 1;

function isValidBatchYear(value: string): boolean {
  if (!/^\d{4}$/.test(value)) return false;
  const year = Number(value);
  return year >= 2000 && year <= MAX_BATCH_YEAR;
}

const singleSchema = z.object({
  studentId: z.string().min(7).max(7),
  batchYear: z.string()
    .regex(/^\d{4}$/, 'Batch must be a 4-digit year')
    .refine((value) => Number(value) >= 2000 && Number(value) <= MAX_BATCH_YEAR, `Batch must be between 2000 and ${MAX_BATCH_YEAR}`),
  fullName: z.string().optional(),
});
type SingleForm = z.infer<typeof singleSchema>;

type PreviewRow = { id: number; studentId: string; fullName: string };

function parseCsvRows(text: string): PreviewRow[] {
  const cleaned = text.replace(/^\uFEFF/, '');
  const lines = cleaned.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (!lines.length) return [];

  const split = (line: string): string[] => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i += 1; }
        else inQuotes = !inQuotes;
        continue;
      }
      if (char === ',' && !inQuotes) { values.push(current.trim()); current = ''; continue; }
      current += char;
    }
    values.push(current.trim());
    return values;
  };

  const header = split(lines[0]).map(v => v.toLowerCase().replace(/\s+/g, ''));
  const studentIdHeaderIndex = header.findIndex(v => ['studentid','student_id','id'].includes(v));
  const hasHeader = studentIdHeaderIndex !== -1;
  const studentIdIndex = hasHeader ? studentIdHeaderIndex : 0;
  const fullNameHeaderIndex = header.findIndex(v => ['fullname','full_name','name'].includes(v));
  const fullNameIndex = hasHeader ? fullNameHeaderIndex : 1;

  const rows: PreviewRow[] = [];
  for (let index = hasHeader ? 1 : 0; index < lines.length; index++) {
    const columns = split(lines[index]);
    const studentId = (columns[studentIdIndex] ?? '').trim();
    if (!studentId) continue;
    rows.push({ id: index, studentId, fullName: fullNameIndex >= 0 ? (columns[fullNameIndex] ?? '').trim() : '' });
  }
  return rows;
}

const inputClass = "w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:bg-white transition-all";
const labelClass = "block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5";

export function ManageStudents() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<'list' | 'single' | 'bulk'>('list');
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkBatchYear, setBulkBatchYear] = useState('');
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [editingRowId, setEditingRowId] = useState<number | null>(null);
  const [selectionMode, setSelectionMode] = useState<'download' | 'delete' | null>(null);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
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
      if (!bulkFile || !previewRows.length) return null;
      const fd = new FormData();
      const csvContent = ['studentId,fullName', ...previewRows.map(r => `${r.studentId},${r.fullName}`)].join('\n');
      const csvBlob = new Blob([csvContent], { type: 'text/csv' });
      const processedFile = new File([csvBlob], bulkFile.name || 'students.csv', { type: 'text/csv' });
      fd.append('file', processedFile);
      fd.append('batchYear', bulkBatchYear);
      return (await api.post('/office/students/bulk', fd)).data;
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
      setBulkFile(null); setBulkBatchYear(''); setPreviewRows([]); setEditingRowId(null); setMode('list');
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Bulk import failed'),
  });

  const bulkCredentialDownloadMutation = useMutation({
    mutationFn: async (studentIds: string[]) => {
      const resetResponses = await Promise.all(studentIds.map(id => api.post(`/office/students/${id}/credentials/reset`)));
      const credentials = resetResponses.map(r => ({
        username: r.data?.credentials?.username,
        password: r.data?.credentials?.password,
        name: r.data?.student?.fullName || r.data?.credentials?.username || 'Student',
      }));
      const pdfResponse = await api.post('/office/credentials/pdf', { credentials });
      return { pdf: pdfResponse.data?.pdf, count: credentials.length };
    },
    onSuccess: (data) => {
      if (data?.pdf) {
        const link = document.createElement('a');
        link.href = `data:application/pdf;base64,${data.pdf}`;
        link.download = 'student_credentials_selected.pdf';
        link.click();
      }
      toast.success(`Downloaded credentials for ${data?.count ?? 0} students`);
      setSelectedStudentIds([]); setSelectionMode(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed to download selected credentials'),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (studentIds: string[]) => {
      await Promise.all(studentIds.map(id => api.delete(`/office/students/${id}`)));
    },
    onSuccess: () => {
      toast.success('Selected students deleted');
      qc.invalidateQueries({ queryKey: ['students'] });
      setSelectedStudentIds([]); setSelectionMode(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed to delete selected students'),
  });

  const toggleStudentSelection = (studentId: string) => {
    setSelectedStudentIds(prev => prev.includes(studentId) ? prev.filter(id => id !== studentId) : [...prev, studentId]);
  };

  const toggleSelectAllVisible = () => {
    const visibleIds = filtered.map((s: any) => s.id as string);
    const isAllSelected = visibleIds.every((id: string) => selectedStudentIds.includes(id));
    setSelectedStudentIds(prev => isAllSelected ? prev.filter(id => !visibleIds.includes(id)) : Array.from(new Set([...prev, ...visibleIds])));
  };

  const filtered = students.filter((s: any) =>
    !search || s.studentId?.includes(search) || s.fullName?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppShell>
      <div className="min-h-screen bg-slate-50">
        {/* Page Header */}
        <div className="bg-white border-b border-slate-200 px-8 py-6 mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-50 rounded-xl">
                <GraduationCap size={18} className="text-emerald-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">Manage Students</h1>
                <p className="text-xs text-slate-400 mt-0.5">{students.length} student{students.length !== 1 ? 's' : ''} enrolled</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setMode('single')}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 shadow-sm shadow-indigo-200 transition-all"
              >
                <Plus size={16} /> Add Student
              </button>
              <button
                onClick={() => setMode('bulk')}
                className="inline-flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-all"
              >
                <Upload size={16} /> Bulk Import
              </button>
            </div>
          </div>
        </div>

        <div className="px-8 pb-10 space-y-4">
          {/* Add Single Student Modal */}
          <Modal open={mode === 'single'} onClose={() => { setMode('list'); reset(); }} title="Add New Student" maxWidthClass="max-w-2xl">
            <form onSubmit={handleSubmit(d => createSingle.mutate(d))} className="grid grid-cols-3 gap-5">
              <div>
                <label className={labelClass}>Student ID <span className="text-slate-300 normal-case">(7 digits)</span></label>
                <input {...register('studentId')} className={inputClass} placeholder="2107070" />
                {errors.studentId && <p className="text-red-500 text-xs mt-1.5">{errors.studentId.message}</p>}
              </div>
              <div>
                <label className={labelClass}>Batch Year</label>
                <input {...register('batchYear')} className={inputClass} placeholder="2021" />
                {errors.batchYear && <p className="text-red-500 text-xs mt-1.5">{errors.batchYear.message}</p>}
              </div>
              <div>
                <label className={labelClass}>Full Name <span className="text-slate-300 normal-case">(optional)</span></label>
                <input {...register('fullName')} className={inputClass} placeholder="John Doe" />
              </div>
              <div className="col-span-3 flex gap-3 pt-2 border-t border-slate-100">
                <button type="submit" disabled={isSubmitting} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-all">
                  {isSubmitting ? 'Creating…' : 'Create & Download Credentials'}
                </button>
                <button type="button" onClick={() => setMode('list')} className="px-5 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-50 transition-all">
                  Cancel
                </button>
              </div>
            </form>
          </Modal>

          {/* Bulk Import Modal */}
          <Modal
            open={mode === 'bulk'}
            onClose={() => { setMode('list'); setBulkFile(null); setBulkBatchYear(''); setPreviewRows([]); setEditingRowId(null); }}
            title="Bulk Import Students"
            maxWidthClass="max-w-5xl"
          >
            <div className="space-y-6">
              <p className="text-sm text-slate-500">
                Upload a CSV with columns: <code className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded-md text-xs font-mono">studentId, fullName</code> (fullName optional)
              </p>

              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className={labelClass}>Batch Year</label>
                  <input
                    value={bulkBatchYear}
                    onChange={e => setBulkBatchYear(e.target.value)}
                    className={inputClass}
                    placeholder="2021"
                  />
                  {bulkBatchYear && !isValidBatchYear(bulkBatchYear) && (
                    <p className="text-red-500 text-xs mt-1.5">Must be a year between 2000 and {MAX_BATCH_YEAR}</p>
                  )}
                </div>
                <div>
                  <label className={labelClass}>CSV File</label>
                  <label className="flex items-center justify-between gap-3 border border-dashed border-slate-300 rounded-xl px-4 py-2.5 bg-slate-50 hover:bg-white hover:border-indigo-300 cursor-pointer transition-all">
                    <span className="text-sm text-slate-500 truncate">{bulkFile?.name ?? 'No file chosen'}</span>
                    <span className="text-xs font-semibold px-3 py-1 bg-white border border-slate-200 rounded-lg text-slate-600 flex-shrink-0">Browse</span>
                    <input
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={async e => {
                        const file = e.target.files?.[0] ?? null;
                        setBulkFile(file);
                        setEditingRowId(null);
                        if (!file) { setPreviewRows([]); return; }
                        try {
                          const text = await file.text();
                          const parsed = parseCsvRows(text);
                          if (!parsed.length) { toast.error('No valid student rows found in CSV'); setPreviewRows([]); return; }
                          setPreviewRows(parsed);
                        } catch { toast.error('Failed to parse CSV file'); }
                      }}
                    />
                  </label>
                </div>
              </div>

              {!!previewRows.length && (
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Preview</span>
                    <span className="text-xs text-slate-400">{previewRows.length} students</span>
                  </div>
                  <div className="max-h-64 overflow-auto">
                    <table className="w-full text-sm min-w-[600px]">
                      <thead className="bg-white sticky top-0 border-b border-slate-100">
                        <tr>
                          {['Student ID','Full Name','Actions'].map(h => (
                            <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {previewRows.map(row => {
                          const isEditing = editingRowId === row.id;
                          return (
                            <tr key={row.id} className="hover:bg-slate-50/70">
                              <td className="px-5 py-3">
                                {isEditing ? (
                                  <input
                                    value={row.studentId}
                                    onChange={e => setPreviewRows(prev => prev.map(r => r.id === row.id ? { ...r, studentId: e.target.value } : r))}
                                    className="w-36 px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                  />
                                ) : <span className="font-mono text-slate-700">{row.studentId}</span>}
                              </td>
                              <td className="px-5 py-3">
                                {isEditing ? (
                                  <input
                                    value={row.fullName}
                                    onChange={e => setPreviewRows(prev => prev.map(r => r.id === row.id ? { ...r, fullName: e.target.value } : r))}
                                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                  />
                                ) : <span className="text-slate-700">{row.fullName || <span className="text-slate-300">—</span>}</span>}
                              </td>
                              <td className="px-5 py-3">
                                <div className="flex items-center justify-end gap-2">
                                  <button type="button" onClick={() => setEditingRowId(isEditing ? null : row.id)}
                                    className="h-7 w-7 inline-flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600 transition-all">
                                    <Pencil size={12} />
                                  </button>
                                  <button type="button" onClick={() => { setPreviewRows(prev => prev.filter(r => r.id !== row.id)); if (editingRowId === row.id) setEditingRowId(null); }}
                                    className="h-7 w-7 inline-flex items-center justify-center rounded-lg border border-red-100 text-red-400 hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition-all">
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2 border-t border-slate-100">
                <button
                  onClick={() => {
                    if (!isValidBatchYear(bulkBatchYear.trim())) { toast.error(`Batch must be a valid year between 2000 and ${MAX_BATCH_YEAR}`); return; }
                    if (!previewRows.length) { toast.error('Please upload a CSV with at least one student row'); return; }
                    bulkMutation.mutate();
                  }}
                  disabled={bulkMutation.isPending}
                  className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-all"
                >
                  {bulkMutation.isPending ? 'Importing…' : 'Import & Download PDF'}
                </button>
                <button onClick={() => setMode('list')} className="px-5 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-50 transition-all">
                  Cancel
                </button>
              </div>
            </div>
          </Modal>

          {/* Toolbar */}
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by ID or name…"
                className="pl-9 pr-4 py-2.5 border border-slate-200 bg-white rounded-xl text-sm w-72 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setSelectionMode(selectionMode === 'download' ? null : 'download'); setSelectedStudentIds([]); }}
                className={`inline-flex items-center gap-2 px-3.5 py-2.5 text-sm rounded-xl border font-medium transition-all ${selectionMode === 'download' ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
              >
                <Download size={14} /> Credentials
              </button>
              <button
                type="button"
                onClick={() => { setSelectionMode(selectionMode === 'delete' ? null : 'delete'); setSelectedStudentIds([]); }}
                className={`inline-flex items-center gap-2 px-3.5 py-2.5 text-sm rounded-xl border font-medium transition-all ${selectionMode === 'delete' ? 'bg-red-50 border-red-300 text-red-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
              >
                <Trash2 size={14} /> Delete
              </button>
              {selectionMode && (
                <button
                  type="button"
                  onClick={() => { setSelectionMode(null); setSelectedStudentIds([]); }}
                  className="inline-flex items-center gap-1.5 px-3 py-2.5 text-sm rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Bulk Action Bar */}
          {selectionMode && (
            <div className={`flex items-center justify-between rounded-xl border px-4 py-3 ${selectionMode === 'download' ? 'bg-indigo-50 border-indigo-200' : 'bg-red-50 border-red-200'}`}>
              <button
                type="button"
                onClick={toggleSelectAllVisible}
                className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900"
              >
                <CheckSquare size={14} /> Toggle Select All Visible
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!selectedStudentIds.length) { toast.error('Select at least one student'); return; }
                  if (selectionMode === 'download') { bulkCredentialDownloadMutation.mutate(selectedStudentIds); return; }
                  if (window.confirm(`Delete ${selectedStudentIds.length} selected students?`)) bulkDeleteMutation.mutate(selectedStudentIds);
                }}
                className={`px-4 py-2 text-sm font-semibold rounded-xl text-white transition-all ${selectionMode === 'download' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-red-600 hover:bg-red-700'}`}
              >
                {selectionMode === 'download' ? `Download (${selectedStudentIds.length})` : `Delete (${selectedStudentIds.length})`}
              </button>
            </div>
          )}

          {/* Table */}
          <div className="bg-white rounded-2xl shadow-sm ring-1 ring-black/5 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {selectionMode && <th className="px-5 py-3.5 w-12" />}
                  {['Student ID','Name','Batch','Roll','Profile'].map(h => (
                    <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((s: any) => (
                  <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                    {selectionMode && (
                      <td className="px-5 py-4">
                        <input
                          type="checkbox"
                          checked={selectedStudentIds.includes(s.id)}
                          onChange={() => toggleStudentSelection(s.id)}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      </td>
                    )}
                    <td className="px-5 py-4 font-mono font-medium text-slate-700">{s.studentId}</td>
                    <td className="px-5 py-4 text-slate-800">{s.fullName ?? <span className="text-slate-300">—</span>}</td>
                    <td className="px-5 py-4 text-slate-500">{s.batchYear}</td>
                    <td className="px-5 py-4 text-slate-500">{s.rollNumber}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${s.profileCompleted ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-amber-200'}`}>
                        {s.profileCompleted ? 'Complete' : 'Incomplete'}
                      </span>
                    </td>
                  </tr>
                ))}
                {!filtered.length && (
                  <tr>
                    <td colSpan={selectionMode ? 6 : 5} className="px-5 py-16 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <GraduationCap size={32} className="text-slate-200" />
                        <p className="text-sm text-slate-400">{search ? 'No students match your search' : 'No students enrolled yet'}</p>
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
