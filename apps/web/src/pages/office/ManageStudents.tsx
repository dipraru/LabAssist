import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import {
  CheckSquare,
  Download,
  GraduationCap,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { Modal } from '../../components/Modal';
import type { BatchRecord } from './officeAdmin.shared';

const MAX_BATCH_YEAR = new Date().getFullYear() + 1;

function isValidBatchYear(value: string): boolean {
  if (!/^\d{4}$/.test(value)) return false;
  const year = Number(value);
  return year >= 2000 && year <= MAX_BATCH_YEAR;
}

const singleSchema = z.object({
  studentId: z.string().min(7).max(7),
  batchYear: z
    .string()
    .regex(/^\d{4}$/, 'Batch must be a 4-digit year')
    .refine(
      (value) => Number(value) >= 2000 && Number(value) <= MAX_BATCH_YEAR,
      `Batch must be between 2000 and ${MAX_BATCH_YEAR}`,
    ),
  fullName: z.string().optional(),
});

type SingleForm = z.infer<typeof singleSchema>;

type PreviewRow = {
  id: number;
  studentId: string;
  fullName: string;
};

type StudentRecord = {
  id: string;
  studentId: string;
  fullName?: string | null;
  batchYear: string;
  rollNumber: string;
  profileCompleted: boolean;
  canDelete: boolean;
  deleteBlockReason?: string | null;
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
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"') {
        if (inQuotes && line[index + 1] === '"') {
          current += '"';
          index += 1;
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

  const header = split(lines[0]).map((value) =>
    value.toLowerCase().replace(/\s+/g, ''),
  );
  const studentIdHeaderIndex = header.findIndex((value) =>
    ['studentid', 'student_id', 'id'].includes(value),
  );
  const hasHeader = studentIdHeaderIndex !== -1;
  const studentIdIndex = hasHeader ? studentIdHeaderIndex : 0;
  const fullNameHeaderIndex = header.findIndex((value) =>
    ['fullname', 'full_name', 'name'].includes(value),
  );
  const fullNameIndex = hasHeader ? fullNameHeaderIndex : 1;

  const rows: PreviewRow[] = [];
  for (let index = hasHeader ? 1 : 0; index < lines.length; index += 1) {
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

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:bg-white transition-all';
const labelClass =
  'block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5';

export function ManageStudents() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'list' | 'single' | 'bulk'>('list');
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkBatchYear, setBulkBatchYear] = useState('');
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [editingRowId, setEditingRowId] = useState<number | null>(null);
  const [selectionMode, setSelectionMode] = useState<'download' | 'delete' | null>(null);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [selectedBatchYear, setSelectedBatchYear] = useState('');

  const { data: students = [] } = useQuery<StudentRecord[]>({
    queryKey: ['students', selectedBatchYear],
    queryFn: () =>
      api
        .get('/office/students', {
          params: selectedBatchYear ? { batch: selectedBatchYear } : undefined,
        })
        .then((response) => response.data),
  });

  const { data: batches = [] } = useQuery<BatchRecord[]>({
    queryKey: ['batches'],
    queryFn: () => api.get('/office/batches').then((response) => response.data),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SingleForm>({
    resolver: zodResolver(singleSchema),
  });

  const createSingle = useMutation({
    mutationFn: (data: SingleForm) => api.post('/office/students', data),
    onSuccess: (response) => {
      toast.success('Student created');
      if (response.data.credentialsPdf) {
        const link = document.createElement('a');
        link.href = `data:application/pdf;base64,${response.data.credentialsPdf}`;
        link.download = `credentials_${response.data.student?.studentId ?? 'student'}.pdf`;
        link.click();
      }
      queryClient.invalidateQueries({ queryKey: ['students'] });
      reset();
      setMode('list');
    },
    onError: (error: any) => toast.error(error.response?.data?.message ?? 'Failed'),
  });

  const bulkMutation = useMutation({
    mutationFn: async () => {
      if (!bulkFile || !previewRows.length) return null;
      const formData = new FormData();
      const csvContent = [
        'studentId,fullName',
        ...previewRows.map((row) => `${row.studentId},${row.fullName}`),
      ].join('\n');
      const csvBlob = new Blob([csvContent], { type: 'text/csv' });
      const processedFile = new File([csvBlob], bulkFile.name || 'students.csv', {
        type: 'text/csv',
      });
      formData.append('file', processedFile);
      formData.append('batchYear', bulkBatchYear);
      return (await api.post('/office/students/bulk', formData)).data;
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
      toast.success(
        `Bulk import complete. Created ${created}${skipped ? `, skipped ${skipped}` : ''}.`,
      );
      queryClient.invalidateQueries({ queryKey: ['students'] });
      setBulkFile(null);
      setBulkBatchYear('');
      setPreviewRows([]);
      setEditingRowId(null);
      setMode('list');
    },
    onError: (error: any) =>
      toast.error(error.response?.data?.message ?? 'Bulk import failed'),
  });

  const bulkCredentialDownloadMutation = useMutation({
    mutationFn: async (studentIds: string[]) => {
      const resetResponses = await Promise.all(
        studentIds.map((id) => api.post(`/office/students/${id}/credentials/reset`)),
      );
      const credentials = resetResponses.map((response) => ({
        username: response.data?.credentials?.username,
        password: response.data?.credentials?.password,
        name:
          response.data?.student?.fullName ||
          response.data?.credentials?.username ||
          'Student',
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
      setSelectedStudentIds([]);
      setSelectionMode(null);
    },
    onError: (error: any) =>
      toast.error(
        error.response?.data?.message ?? 'Failed to download selected credentials',
      ),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (studentIds: string[]) => {
      await Promise.all(studentIds.map((id) => api.delete(`/office/students/${id}`)));
    },
    onSuccess: () => {
      toast.success('Selected students deleted');
      queryClient.invalidateQueries({ queryKey: ['students'] });
      setSelectedStudentIds([]);
      setSelectionMode(null);
    },
    onError: (error: any) =>
      toast.error(error.response?.data?.message ?? 'Failed to delete selected students'),
  });

  const filteredStudents = students.filter((student) => {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return (
      student.studentId?.includes(search) ||
      student.fullName?.toLowerCase().includes(needle)
    );
  });

  const visibleSelectableStudents = filteredStudents.filter((student) =>
    selectionMode === 'delete' ? student.canDelete : true,
  );

  const totalSelectedVisible = visibleSelectableStudents.filter((student) =>
    selectedStudentIds.includes(student.id),
  ).length;
  const allVisibleSelected =
    visibleSelectableStudents.length > 0 &&
    totalSelectedVisible === visibleSelectableStudents.length;

  const incompleteCount = students.filter((student) => !student.profileCompleted).length;
  const completeCount = students.filter((student) => student.profileCompleted).length;

  const toggleStudentSelection = (studentId: string) => {
    setSelectedStudentIds((previous) =>
      previous.includes(studentId)
        ? previous.filter((id) => id !== studentId)
        : [...previous, studentId],
    );
  };

  const toggleSelectAllVisible = () => {
    const visibleIds = visibleSelectableStudents.map((student) => student.id);
    setSelectedStudentIds((previous) =>
      allVisibleSelected
        ? previous.filter((id) => !visibleIds.includes(id))
        : Array.from(new Set([...previous, ...visibleIds])),
    );
  };

  const closeBulkModal = () => {
    setMode('list');
    setBulkFile(null);
    setBulkBatchYear('');
    setPreviewRows([]);
    setEditingRowId(null);
  };

  return (
    <AppShell>
      <div className="min-h-screen bg-slate-50">
        <div className="mb-8 border-b border-slate-200 bg-white px-8 py-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-emerald-50 p-2">
                <GraduationCap size={18} className="text-emerald-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">Manage Students</h1>
                <p className="mt-0.5 text-xs text-slate-400">
                  {selectedBatchYear ? `Batch ${selectedBatchYear}` : 'All batches'} ·{' '}
                  {students.length} student{students.length === 1 ? '' : 's'} loaded
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode('single')}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-200 transition-all hover:bg-indigo-700"
              >
                <Plus size={16} />
                Add Student
              </button>
              <button
                type="button"
                onClick={() => setMode('bulk')}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:bg-slate-50"
              >
                <Upload size={16} />
                Bulk Import
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4 px-8 pb-10">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Visible Students
              </p>
              <p className="mt-3 text-3xl font-bold text-slate-900">{students.length}</p>
              <p className="mt-2 text-sm text-slate-500">
                {selectedBatchYear ? `Filtered to batch ${selectedBatchYear}` : 'Across every batch'}
              </p>
            </div>
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Incomplete Profiles
              </p>
              <p className="mt-3 text-3xl font-bold text-amber-700">{incompleteCount}</p>
              <p className="mt-2 text-sm text-slate-500">
                Only these accounts can be deleted by office
              </p>
            </div>
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Completed Profiles
              </p>
              <p className="mt-3 text-3xl font-bold text-emerald-700">{completeCount}</p>
              <p className="mt-2 text-sm text-slate-500">
                Protected from deletion once profile setup is finished
              </p>
            </div>
          </div>

          <Modal
            open={mode === 'single'}
            onClose={() => {
              setMode('list');
              reset();
            }}
            title="Add New Student"
            maxWidthClass="max-w-2xl"
          >
            <form
              onSubmit={handleSubmit((data) => createSingle.mutate(data))}
              className="grid grid-cols-3 gap-5"
            >
              <div>
                <label className={labelClass}>
                  Student ID <span className="normal-case text-slate-300">(7 digits)</span>
                </label>
                <input
                  {...register('studentId')}
                  className={inputClass}
                  placeholder="2107070"
                />
                {errors.studentId && (
                  <p className="mt-1.5 text-xs text-red-500">{errors.studentId.message}</p>
                )}
              </div>

              <div>
                <label className={labelClass}>Batch Year</label>
                <select
                  {...register('batchYear')}
                  className={inputClass}
                  disabled={!batches.length}
                >
                  <option value="">
                    {batches.length ? 'Select batch' : 'No batches available'}
                  </option>
                  {batches.map((batch) => (
                    <option key={batch.id} value={batch.year}>
                      {batch.year}
                    </option>
                  ))}
                </select>
                {errors.batchYear && (
                  <p className="mt-1.5 text-xs text-red-500">{errors.batchYear.message}</p>
                )}
              </div>

              <div>
                <label className={labelClass}>
                  Full Name <span className="normal-case text-slate-300">(optional)</span>
                </label>
                <input
                  {...register('fullName')}
                  className={inputClass}
                  placeholder="John Doe"
                />
              </div>

              <div className="col-span-3 flex gap-3 border-t border-slate-100 pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting || !batches.length}
                  className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white transition-all hover:bg-indigo-700 disabled:opacity-50"
                >
                  {isSubmitting ? 'Creating…' : 'Create & Download Credentials'}
                </button>
                <button
                  type="button"
                  onClick={() => setMode('list')}
                  className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </Modal>

          <Modal
            open={mode === 'bulk'}
            onClose={closeBulkModal}
            title="Bulk Import Students"
            maxWidthClass="max-w-5xl"
          >
            <div className="space-y-6">
              <p className="text-sm text-slate-500">
                Upload a CSV with columns:{' '}
                <code className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-slate-700">
                  studentId, fullName
                </code>{' '}
                where full name is optional.
              </p>

              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className={labelClass}>Batch Year</label>
                  <select
                    value={bulkBatchYear}
                    onChange={(event) => setBulkBatchYear(event.target.value)}
                    className={inputClass}
                    disabled={!batches.length}
                  >
                    <option value="">
                      {batches.length ? 'Select batch' : 'No batches available'}
                    </option>
                    {batches.map((batch) => (
                      <option key={batch.id} value={batch.year}>
                        {batch.year}
                      </option>
                    ))}
                  </select>
                  {bulkBatchYear && !isValidBatchYear(bulkBatchYear) ? (
                    <p className="mt-1.5 text-xs text-red-500">
                      Must be a year between 2000 and {MAX_BATCH_YEAR}
                    </p>
                  ) : null}
                </div>

                <div>
                  <label className={labelClass}>CSV File</label>
                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-2.5 transition-all hover:border-indigo-300 hover:bg-white">
                    <span className="truncate text-sm text-slate-500">
                      {bulkFile?.name ?? 'No file chosen'}
                    </span>
                    <span className="flex-shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                      Browse
                    </span>
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

              {previewRows.length ? (
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Preview
                    </span>
                    <span className="text-xs text-slate-400">{previewRows.length} students</span>
                  </div>

                  <div className="max-h-64 overflow-auto">
                    <table className="w-full min-w-[600px] text-sm">
                      <thead className="sticky top-0 border-b border-slate-100 bg-white">
                        <tr>
                          {['Student ID', 'Full Name', 'Actions'].map((heading) => (
                            <th
                              key={heading}
                              className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400"
                            >
                              {heading}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {previewRows.map((row) => {
                          const isEditing = editingRowId === row.id;
                          return (
                            <tr key={row.id} className="hover:bg-slate-50/70">
                              <td className="px-5 py-3">
                                {isEditing ? (
                                  <input
                                    value={row.studentId}
                                    onChange={(event) =>
                                      setPreviewRows((previous) =>
                                        previous.map((item) =>
                                          item.id === row.id
                                            ? { ...item, studentId: event.target.value }
                                            : item,
                                        ),
                                      )
                                    }
                                    className="w-36 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                  />
                                ) : (
                                  <span className="font-mono text-slate-700">{row.studentId}</span>
                                )}
                              </td>
                              <td className="px-5 py-3">
                                {isEditing ? (
                                  <input
                                    value={row.fullName}
                                    onChange={(event) =>
                                      setPreviewRows((previous) =>
                                        previous.map((item) =>
                                          item.id === row.id
                                            ? { ...item, fullName: event.target.value }
                                            : item,
                                        ),
                                      )
                                    }
                                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                  />
                                ) : (
                                  <span className="text-slate-700">
                                    {row.fullName || <span className="text-slate-300">—</span>}
                                  </span>
                                )}
                              </td>
                              <td className="px-5 py-3">
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setEditingRowId(isEditing ? null : row.id)}
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-all hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
                                  >
                                    <Pencil size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPreviewRows((previous) =>
                                        previous.filter((item) => item.id !== row.id),
                                      );
                                      if (editingRowId === row.id) setEditingRowId(null);
                                    }}
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-red-100 text-red-400 transition-all hover:border-red-300 hover:bg-red-50 hover:text-red-600"
                                  >
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
              ) : null}

              <div className="flex gap-3 border-t border-slate-100 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!isValidBatchYear(bulkBatchYear.trim())) {
                      toast.error(
                        `Batch must be a valid year between 2000 and ${MAX_BATCH_YEAR}`,
                      );
                      return;
                    }
                    if (!previewRows.length) {
                      toast.error('Please upload a CSV with at least one student row');
                      return;
                    }
                    bulkMutation.mutate();
                  }}
                  disabled={bulkMutation.isPending}
                  className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white transition-all hover:bg-indigo-700 disabled:opacity-50"
                >
                  {bulkMutation.isPending ? 'Importing…' : 'Import & Download PDF'}
                </button>
                <button
                  type="button"
                  onClick={closeBulkModal}
                  className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </Modal>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="relative block">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by ID or name…"
                  className="w-72 rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </label>

              <select
                value={selectedBatchYear}
                onChange={(event) => {
                  setSelectedBatchYear(event.target.value);
                  setSelectedStudentIds([]);
                }}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                <option value="">All batches</option>
                {batches.map((batch) => (
                  <option key={batch.id} value={batch.year}>
                    Batch {batch.year}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelectionMode(selectionMode === 'download' ? null : 'download');
                  setSelectedStudentIds([]);
                }}
                className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-medium transition-all ${
                  selectionMode === 'download'
                    ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Download size={14} />
                Credentials
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectionMode(selectionMode === 'delete' ? null : 'delete');
                  setSelectedStudentIds([]);
                }}
                className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-medium transition-all ${
                  selectionMode === 'delete'
                    ? 'border-red-300 bg-red-50 text-red-700'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Trash2 size={14} />
                Delete Incomplete
              </button>
              {selectionMode ? (
                <button
                  type="button"
                  onClick={() => {
                    setSelectionMode(null);
                    setSelectedStudentIds([]);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-500 transition-all hover:bg-slate-50"
                >
                  <X size={14} />
                </button>
              ) : null}
            </div>
          </div>

          {selectionMode ? (
            <div
              className={`space-y-3 rounded-xl border px-4 py-3 ${
                selectionMode === 'download'
                  ? 'border-indigo-200 bg-indigo-50'
                  : 'border-red-200 bg-red-50'
              }`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={toggleSelectAllVisible}
                  className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900"
                >
                  <CheckSquare size={14} />
                  {allVisibleSelected ? 'Clear visible selection' : 'Select all visible'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!selectedStudentIds.length) {
                      toast.error('Select at least one student');
                      return;
                    }

                    if (selectionMode === 'download') {
                      bulkCredentialDownloadMutation.mutate(selectedStudentIds);
                      return;
                    }

                    const protectedSelection = students.filter(
                      (student) =>
                        selectedStudentIds.includes(student.id) && !student.canDelete,
                    );

                    if (protectedSelection.length) {
                      toast.error('Only incomplete student accounts can be deleted');
                      return;
                    }

                    if (
                      window.confirm(
                        `Delete ${selectedStudentIds.length} selected incomplete student accounts?`,
                      )
                    ) {
                      bulkDeleteMutation.mutate(selectedStudentIds);
                    }
                  }}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold text-white transition-all ${
                    selectionMode === 'download'
                      ? 'bg-indigo-600 hover:bg-indigo-700'
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {selectionMode === 'download'
                    ? `Download (${selectedStudentIds.length})`
                    : `Delete (${selectedStudentIds.length})`}
                </button>
              </div>

              {selectionMode === 'delete' ? (
                <p className="text-xs text-slate-600">
                  Complete profiles are protected and cannot be selected for deletion.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {selectionMode ? <th className="w-12 px-5 py-3.5" /> : null}
                  {['Student ID', 'Name', 'Batch', 'Roll', 'Profile'].map((heading) => (
                    <th
                      key={heading}
                      className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-50">
                {filteredStudents.map((student) => {
                  const selectable = selectionMode !== 'delete' || student.canDelete;
                  return (
                    <tr key={student.id} className="transition-colors hover:bg-slate-50/70">
                      {selectionMode ? (
                        <td className="px-5 py-4">
                          <input
                            type="checkbox"
                            disabled={!selectable}
                            checked={selectedStudentIds.includes(student.id)}
                            onChange={() => toggleStudentSelection(student.id)}
                            title={
                              selectable
                                ? 'Select student'
                                : student.deleteBlockReason ?? 'Student cannot be deleted'
                            }
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
                          />
                        </td>
                      ) : null}

                      <td className="px-5 py-4 font-mono font-medium text-slate-700">
                        {student.studentId}
                      </td>
                      <td className="px-5 py-4 text-slate-800">
                        {student.fullName ?? <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-5 py-4 text-slate-500">{student.batchYear}</td>
                      <td className="px-5 py-4 text-slate-500">{student.rollNumber}</td>
                      <td className="px-5 py-4">
                        <div className="space-y-1.5">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${
                              student.profileCompleted
                                ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                                : 'bg-amber-50 text-amber-700 ring-amber-200'
                            }`}
                          >
                            {student.profileCompleted ? 'Complete' : 'Incomplete'}
                          </span>
                          <p className="text-xs text-slate-500">
                            {student.canDelete
                              ? 'Eligible for deletion if needed'
                              : student.deleteBlockReason ?? 'Protected account'}
                          </p>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {!filteredStudents.length ? (
                  <tr>
                    <td colSpan={selectionMode ? 6 : 5} className="px-5 py-16 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <GraduationCap size={32} className="text-slate-200" />
                        <p className="text-sm text-slate-400">
                          {search
                            ? 'No students match your search'
                            : selectedBatchYear
                              ? `No students found in batch ${selectedBatchYear}`
                              : 'No students enrolled yet'}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
