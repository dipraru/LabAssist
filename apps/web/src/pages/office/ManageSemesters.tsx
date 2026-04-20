import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Pencil, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { Modal } from '../../components/Modal';
import { WheelDateInput } from '../../components/WheelDateInput';
import {
  formatShortDate,
  getNextSemesterName,
  getSemesterIndex,
  inputClass,
  isFutureDate,
  labelClass,
  semesterAccent,
  semesterLabels,
} from './officeAdmin.shared';
import type { BatchRecord, SemesterRecord } from './officeAdmin.shared';

const createSchema = z.object({
  batchYear: z.string().min(1, 'Batch is required'),
  name: z.string().min(1, 'Semester is required'),
  startDate: z.string().min(1, 'Start date is required'),
});

const editSchema = z.object({
  startDate: z.string().min(1, 'Start date is required'),
});

type CreateSemesterForm = z.infer<typeof createSchema>;
type EditSemesterForm = z.infer<typeof editSchema>;

function DeterminedField({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div
        className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
          muted
            ? 'border-dashed border-slate-200 bg-slate-50 text-slate-400'
            : 'border-indigo-200 bg-indigo-50 text-indigo-900'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function SemesterStatusBadge({ semester }: { semester: SemesterRecord }) {
  if (semester.isCurrent) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white">
        <span className="h-1.5 w-1.5 rounded-full bg-white" />
        Active
      </span>
    );
  }

  if (isFutureDate(semester.startDate)) {
    return (
      <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
        Upcoming
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
      Inactive
    </span>
  );
}

export function ManageSemesters() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingSemester, setEditingSemester] = useState<SemesterRecord | null>(null);

  const { data: semesters = [] } = useQuery<SemesterRecord[]>({
    queryKey: ['semesters'],
    queryFn: () => api.get('/office/semesters').then((response) => response.data),
  });
  const { data: batches = [] } = useQuery<BatchRecord[]>({
    queryKey: ['batches'],
    queryFn: () => api.get('/office/batches').then((response) => response.data),
  });

  const createForm = useForm<CreateSemesterForm>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      batchYear: '',
      name: '',
      startDate: new Date().toISOString().slice(0, 10),
    },
  });
  const editForm = useForm<EditSemesterForm>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      startDate: new Date().toISOString().slice(0, 10),
    },
  });

  const selectedBatchYear = createForm.watch('batchYear');
  const nextSemesterName = selectedBatchYear
    ? getNextSemesterName(semesters, selectedBatchYear)
    : null;

  useEffect(() => {
    createForm.setValue('name', nextSemesterName ?? '', { shouldValidate: true });
  }, [createForm, nextSemesterName]);

  useEffect(() => {
    if (editingSemester?.startDate) {
      editForm.reset({ startDate: editingSemester.startDate.slice(0, 10) });
    }
  }, [editForm, editingSemester]);

  const createMutation = useMutation({
    mutationFn: (data: CreateSemesterForm) => api.post('/office/semesters', data),
    onSuccess: () => {
      toast.success('Semester created');
      queryClient.invalidateQueries({ queryKey: ['semesters'] });
      queryClient.invalidateQueries({ queryKey: ['courses-office'] });
      createForm.reset({
        batchYear: '',
        name: '',
        startDate: new Date().toISOString().slice(0, 10),
      });
      setShowForm(false);
    },
    onError: (error: any) =>
      toast.error(error.response?.data?.message ?? 'Failed to create semester'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: EditSemesterForm }) =>
      api.patch(`/office/semesters/${id}`, payload),
    onSuccess: () => {
      toast.success('Semester updated');
      queryClient.invalidateQueries({ queryKey: ['semesters'] });
      queryClient.invalidateQueries({ queryKey: ['courses-office'] });
      setEditingSemester(null);
    },
    onError: (error: any) =>
      toast.error(error.response?.data?.message ?? 'Failed to update semester'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/office/semesters/${id}`),
    onSuccess: () => {
      toast.success('Semester deleted');
      queryClient.invalidateQueries({ queryKey: ['semesters'] });
      queryClient.invalidateQueries({ queryKey: ['courses-office'] });
    },
    onError: (error: any) =>
      toast.error(error.response?.data?.message ?? 'Failed to delete semester'),
  });

  const closeCreateModal = () => {
    setShowForm(false);
    createForm.reset({
      batchYear: '',
      name: '',
      startDate: new Date().toISOString().slice(0, 10),
    });
  };

  const batchOptions = batches.map((batch) => batch.year);

  return (
    <AppShell>
      <div className="min-h-screen bg-slate-50">
        <div className="mb-8 border-b border-slate-200 bg-white px-8 py-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-cyan-50 p-2.5">
                <CalendarDays size={18} className="text-cyan-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">Semesters</h1>
                <p className="mt-0.5 text-xs text-slate-400">
                  {semesters.length} semester{semesters.length === 1 ? '' : 's'} configured
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-200 transition-all hover:bg-indigo-700"
            >
              <Plus size={16} />
              New Semester
            </button>
          </div>
        </div>

        <div className="space-y-6 px-8 pb-10">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Active Semesters
              </p>
              <p className="mt-3 text-3xl font-bold text-slate-900">
                {semesters.filter((semester) => semester.isCurrent).length}
              </p>
            </div>
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Upcoming
              </p>
              <p className="mt-3 text-3xl font-bold text-slate-900">
                {semesters.filter((semester) => isFutureDate(semester.startDate)).length}
              </p>
            </div>
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Ready Batches
              </p>
              <p className="mt-3 text-3xl font-bold text-slate-900">{batches.length}</p>
            </div>
          </div>

          <Modal open={showForm} onClose={closeCreateModal} title="New Semester">
            <form
              onSubmit={createForm.handleSubmit((data) => {
                if (!nextSemesterName) {
                  toast.error('No available semester slot remains for this batch');
                  return;
                }
                createMutation.mutate({ ...data, name: nextSemesterName });
              })}
              className="space-y-5"
            >
              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className={labelClass}>Batch</label>
                  <select
                    {...createForm.register('batchYear')}
                    className={inputClass}
                    disabled={!batchOptions.length}
                  >
                    <option value="">Select batch</option>
                    {batchOptions.map((batchYear) => (
                      <option key={batchYear} value={batchYear}>
                        {batchYear}
                      </option>
                    ))}
                  </select>
                  {createForm.formState.errors.batchYear && (
                    <p className="mt-1.5 text-xs text-red-500">
                      {createForm.formState.errors.batchYear.message}
                    </p>
                  )}
                </div>

                <DeterminedField
                  label="Semester"
                  value={
                    selectedBatchYear
                      ? nextSemesterName
                        ? semesterLabels[nextSemesterName]
                        : 'All 8 semesters already created'
                      : 'Select a batch first'
                  }
                  muted={!selectedBatchYear || !nextSemesterName}
                />
              </div>

              <div>
                <label className={labelClass}>Start Date</label>
                <Controller
                  control={createForm.control}
                  name="startDate"
                  render={({ field }) => (
                    <WheelDateInput
                      value={field.value}
                      onChange={field.onChange}
                      disabled={!selectedBatchYear || !nextSemesterName}
                    />
                  )}
                />
                {createForm.formState.errors.startDate && (
                  <p className="mt-2 text-xs text-red-500">
                    {createForm.formState.errors.startDate.message}
                  </p>
                )}
              </div>

              {!batchOptions.length && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Add a batch first. Semester creation is available only after at least one batch exists.
                </div>
              )}

              {selectedBatchYear && !nextSemesterName && (
                <div className="rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-700">
                  All semester slots are already used for batch {selectedBatchYear}.
                </div>
              )}

              <div className="flex gap-3 border-t border-slate-100 pt-2">
                <button
                  type="submit"
                  disabled={
                    createForm.formState.isSubmitting ||
                    createMutation.isPending ||
                    !selectedBatchYear ||
                    !nextSemesterName
                  }
                  className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white transition-all hover:bg-indigo-700 disabled:opacity-50"
                >
                  {createForm.formState.isSubmitting || createMutation.isPending
                    ? 'Creating...'
                    : 'Create Semester'}
                </button>
                <button
                  type="button"
                  onClick={closeCreateModal}
                  className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </Modal>

          <Modal
            open={Boolean(editingSemester)}
            onClose={() => setEditingSemester(null)}
            title="Edit Semester"
          >
            {editingSemester && (
              <form
                onSubmit={editForm.handleSubmit((payload) =>
                  updateMutation.mutate({ id: editingSemester.id, payload }),
                )}
                className="space-y-5"
              >
                <div className="grid gap-5 md:grid-cols-2">
                  <DeterminedField label="Batch" value={editingSemester.batchYear} />
                  <DeterminedField
                    label="Semester"
                    value={semesterLabels[editingSemester.name] ?? editingSemester.name}
                  />
                </div>

                <div>
                  <label className={labelClass}>Start Date</label>
                  <Controller
                    control={editForm.control}
                    name="startDate"
                    render={({ field }) => (
                      <WheelDateInput value={field.value} onChange={field.onChange} />
                    )}
                  />
                  {editForm.formState.errors.startDate && (
                    <p className="mt-2 text-xs text-red-500">
                      {editForm.formState.errors.startDate.message}
                    </p>
                  )}
                </div>

                <div className="flex gap-3 border-t border-slate-100 pt-2">
                  <button
                    type="submit"
                    disabled={editForm.formState.isSubmitting || updateMutation.isPending}
                    className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white transition-all hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {editForm.formState.isSubmitting || updateMutation.isPending
                      ? 'Saving...'
                      : 'Save Changes'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingSemester(null)}
                    className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </Modal>

          <div className="space-y-3">
            {semesters.map((semester) => {
              const accent = semesterAccent[getSemesterIndex(semester.name) % semesterAccent.length];
              return (
                <div
                  key={semester.id}
                  className={`flex overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 ${
                    semester.isCurrent ? 'ring-2 ring-indigo-400' : ''
                  }`}
                >
                  <div className={`w-1.5 flex-shrink-0 bg-gradient-to-b ${accent}`} />

                  <div className="flex w-full items-center justify-between gap-4 px-6 py-5">
                    <div className="flex items-center gap-5">
                      <div
                        className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${accent} text-lg font-bold text-white`}
                      >
                        {getSemesterIndex(semester.name) + 1}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="text-base font-bold text-slate-800">
                            {semesterLabels[semester.name] ?? semester.name}
                          </span>
                          <SemesterStatusBadge semester={semester} />
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                            Batch {semester.batchYear}
                          </span>
                          <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-xs font-medium text-cyan-700 ring-1 ring-cyan-200">
                            {semester.courseCount ?? 0} course
                            {(semester.courseCount ?? 0) === 1 ? '' : 's'}
                          </span>
                        </div>
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                          <CalendarDays size={11} />
                          Starts {formatShortDate(semester.startDate)}
                        </p>
                        {!semester.canDelete && semester.deleteBlockReason ? (
                          <p className="mt-2 text-xs text-slate-500">
                            {semester.deleteBlockReason}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingSemester(semester)}
                        title="Edit semester"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition-all hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        disabled={!semester.canDelete || deleteMutation.isPending}
                        onClick={() => {
                          if (!semester.canDelete) return;
                          if (
                            window.confirm(
                              `Delete ${semesterLabels[semester.name] ?? semester.name} of batch ${semester.batchYear}?`,
                            )
                          ) {
                            deleteMutation.mutate(semester.id);
                          }
                        }}
                        title={
                          semester.canDelete
                            ? 'Delete semester'
                            : semester.deleteBlockReason ?? 'Semester cannot be deleted yet'
                        }
                        className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border transition-all ${
                          semester.canDelete
                            ? 'border-red-100 text-red-400 hover:border-red-300 hover:bg-red-50 hover:text-red-600'
                            : 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-300'
                        }`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {!semesters.length && (
              <div className="flex flex-col items-center gap-3 rounded-2xl bg-white py-20 text-center shadow-sm ring-1 ring-black/5">
                <CalendarDays size={36} className="text-slate-200" />
                <div>
                  <p className="text-sm font-semibold text-slate-700">No semesters configured yet</p>
                  <p className="mt-1 text-sm text-slate-400">
                    Start by creating a batch, then add the next semester for that batch.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
