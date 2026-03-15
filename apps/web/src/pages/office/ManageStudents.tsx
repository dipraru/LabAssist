import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { Modal } from '../../components/Modal';
import { Download, Pencil, Plus, Trash2, Upload } from 'lucide-react';

const singleSchema = z.object({
  studentId: z.string().min(7).max(7),
  batchYear: z.string().min(2, 'Batch is required'),
  fullName: z.string().optional(),
});
type SingleForm = z.infer<typeof singleSchema>;

type PreviewRow = {
  id: number;
  studentId: string;
  fullName: string;
};

function parseCsvRows(text: string): PreviewRow[] {
  const cleaned = text.replace(/^\uFEFF/, '');
  const lines = cleaned
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (!lines.length) return [];

  const split = (line: string): string[] => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
        continue;
      }
      current += char;
    }
    values.push(current.trim());
    return values;
  };

  const header = split(lines[0]).map((value) => value.toLowerCase().replace(/\s+/g, ''));
  const studentIdHeaderIndex = header.findIndex((value) => ['studentid', 'student_id', 'id'].includes(value));
  const hasHeader = studentIdHeaderIndex !== -1;
  const studentIdIndex = hasHeader ? studentIdHeaderIndex : 0;
  const fullNameHeaderIndex = header.findIndex((value) => ['fullname', 'full_name', 'name'].includes(value));
  const fullNameIndex = hasHeader ? fullNameHeaderIndex : 1;

  const rows: PreviewRow[] = [];
  for (let index = hasHeader ? 1 : 0; index < lines.length; index++) {
    const columns = split(lines[index]);
    const studentId = (columns[studentIdIndex] ?? '').trim();
    if (!studentId) continue;
    rows.push({
      id: index,
      studentId,
      fullName: fullNameIndex >= 0 ? (columns[fullNameIndex] ?? '').trim() : '',
    });
  }
  return rows;
}

export function ManageStudents() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<'list' | 'single' | 'bulk'>('list');
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkBatchYear, setBulkBatchYear] = useState('');
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [editingRowId, setEditingRowId] = useState<number | null>(null);
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
      const csvContent = [
        'studentId,fullName',
        ...previewRows.map((row) => `${row.studentId},${row.fullName}`),
      ].join('\n');
      const csvBlob = new Blob([csvContent], { type: 'text/csv' });
      const processedFile = new File([csvBlob], bulkFile.name || 'students.csv', { type: 'text/csv' });
      fd.append('file', processedFile);
      fd.append('batchYear', bulkBatchYear);
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
      setBulkBatchYear('');
      setPreviewRows([]);
      setEditingRowId(null);
      setMode('list');
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Bulk import failed'),
  });

  const resetCredentialsMutation = useMutation({
    mutationFn: (studentDbId: string) => api.post(`/office/students/${studentDbId}/credentials/reset`),
    onSuccess: (res) => {
      toast.success('Credentials regenerated');
      if (res.data.credentialsPdf) {
        const link = document.createElement('a');
        link.href = `data:application/pdf;base64,${res.data.credentialsPdf}`;
        link.download = `credentials_${res.data.student?.studentId ?? 'student'}.pdf`;
        link.click();
      }
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed to regenerate credentials'),
  });

  const deleteMutation = useMutation({
    mutationFn: (studentDbId: string) => api.delete(`/office/students/${studentDbId}`),
    onSuccess: () => {
      toast.success('Student deleted');
      qc.invalidateQueries({ queryKey: ['students'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed to delete student'),
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
                <label className="block text-sm font-medium text-slate-700 mb-1">Batch (required)</label>
                <input {...register('batchYear')} className="w-32 px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="21 or 2021" />
                {errors.batchYear && <p className="text-red-500 text-xs mt-1">{errors.batchYear.message}</p>}
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
          onClose={() => {
            setMode('list');
            setBulkFile(null);
            setBulkBatchYear('');
            setPreviewRows([]);
            setEditingRowId(null);
          }}
          title="Bulk Import Students"
          maxWidthClass="max-w-5xl"
        >
          <div className="space-y-5">
            <p className="text-sm text-slate-500">CSV columns: <code className="bg-slate-100 px-1 rounded">studentId,fullName</code> (fullName optional)</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Batch (required)</label>
                <input
                  value={bulkBatchYear}
                  onChange={(event) => setBulkBatchYear(event.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  placeholder="21 or 2021"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Choose CSV File</label>
                <label className="flex items-center justify-between gap-3 border border-dashed border-slate-300 rounded-lg px-3 py-2 bg-slate-50 hover:bg-slate-100 cursor-pointer">
                  <span className="text-sm text-slate-600 truncate">{bulkFile?.name ?? 'No file selected'}</span>
                  <span className="text-xs font-medium px-2 py-1 bg-white border border-slate-200 rounded-md text-slate-700">Browse</span>
                  <input
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={async (event) => {
                      const file = event.target.files?.[0] ?? null;
                      setBulkFile(file);
                      setEditingRowId(null);
                      if (!file) {
                        setPreviewRows([]);
                        return;
                      }
                      try {
                        const text = await file.text();
                        const parsed = parseCsvRows(text);
                        if (!parsed.length) {
                          toast.error('No valid student rows found in CSV');
                          setPreviewRows([]);
                          return;
                        }
                        setPreviewRows(parsed);
                      } catch {
                        toast.error('Failed to parse CSV file');
                      }
                    }}
                  />
                </label>
              </div>
            </div>

            {!!previewRows.length && (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-sm font-medium text-slate-700">
                  Imported Students Preview ({previewRows.length})
                </div>
                <div className="max-h-72 overflow-auto">
                  <table className="w-full text-sm min-w-[760px]">
                    <thead className="bg-white sticky top-0 border-b border-slate-200 z-10">
                      <tr>
                        <th className="px-4 py-2 text-left text-slate-600 font-medium">Student ID</th>
                        <th className="px-4 py-2 text-left text-slate-600 font-medium">Full Name</th>
                        <th className="px-4 py-2 text-right text-slate-600 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {previewRows.map((row) => {
                        const isEditing = editingRowId === row.id;
                        return (
                          <tr key={row.id} className="hover:bg-slate-50">
                            <td className="px-4 py-2">
                              {isEditing ? (
                                <input
                                  value={row.studentId}
                                  onChange={(event) => {
                                    const value = event.target.value;
                                    setPreviewRows((prev) => prev.map((item) => item.id === row.id ? { ...item, studentId: value } : item));
                                  }}
                                  className="w-40 px-2 py-1 border border-slate-300 rounded-md"
                                />
                              ) : (
                                <span className="font-mono">{row.studentId}</span>
                              )}
                            </td>
                            <td className="px-4 py-2">
                              {isEditing ? (
                                <input
                                  value={row.fullName}
                                  onChange={(event) => {
                                    const value = event.target.value;
                                    setPreviewRows((prev) => prev.map((item) => item.id === row.id ? { ...item, fullName: value } : item));
                                  }}
                                  className="w-full px-2 py-1 border border-slate-300 rounded-md"
                                />
                              ) : (
                                <span>{row.fullName || <span className="text-slate-400">—</span>}</span>
                              )}
                            </td>
                            <td className="px-4 py-2">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setEditingRowId(isEditing ? null : row.id)}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
                                  title="Edit row"
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPreviewRows((prev) => prev.filter((item) => item.id !== row.id));
                                    if (editingRowId === row.id) setEditingRowId(null);
                                  }}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 text-red-600 hover:bg-red-50"
                                  title="Delete row"
                                >
                                  <Trash2 size={14} />
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

            <div className="flex gap-3 items-center">
              <button
                onClick={() => {
                  if (!bulkBatchYear.trim()) {
                    toast.error('Batch is required');
                    return;
                  }
                  if (!previewRows.length) {
                    toast.error('Please upload a CSV with at least one student row');
                    return;
                  }
                  bulkMutation.mutate();
                }}
                disabled={bulkMutation.isPending}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                Import & Download PDF
              </button>
              <button onClick={() => setMode('list')}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">
                Cancel
              </button>
            </div>
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
                {['Student ID','Name','Batch','Roll','Profile','Actions'].map(h => (
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
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => resetCredentialsMutation.mutate(s.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
                        title="Download credentials"
                      >
                        <Download size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Delete student ${s.studentId}?`)) {
                            deleteMutation.mutate(s.id);
                          }
                        }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 text-red-600 hover:bg-red-50"
                        title="Delete student"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No students found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
