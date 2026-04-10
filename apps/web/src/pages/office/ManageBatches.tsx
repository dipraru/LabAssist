import { useEffect, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layers3, Plus, Split, UsersRound } from 'lucide-react';
import toast from 'react-hot-toast';
import { AppShell } from '../../components/AppShell';
import { Modal } from '../../components/Modal';
import { api } from '../../lib/api';
import {
  inputClass,
  isValidBatchYear,
  labelClass,
  MAX_BATCH_YEAR,
} from './officeAdmin.shared';
import type { BatchRecord } from './officeAdmin.shared';

const sectionSchema = z.object({
  name: z.string().trim().min(1, 'Section name is required'),
  fromStudentId: z.string().regex(/^\d{7}$/, 'From student ID must be 7 digits'),
  toStudentId: z.string().regex(/^\d{7}$/, 'To student ID must be 7 digits'),
});

const batchSchema = z
  .object({
    year: z
      .string()
      .regex(/^\d{4}$/, 'Batch must be a 4-digit year')
      .refine(
        (value) => isValidBatchYear(value),
        `Batch must be between 2000 and ${MAX_BATCH_YEAR}`,
      ),
    sectionCount: z.number().int().min(1).max(26),
    sections: z.array(sectionSchema),
  })
  .superRefine((value, ctx) => {
    if (value.sectionCount === 1) {
      return;
    }

    if (value.sections.length !== value.sectionCount) {
      ctx.addIssue({
        code: 'custom',
        path: ['sections'],
        message: `Provide ${value.sectionCount} section definitions`,
      });
      return;
    }

    const batchPrefix = value.year.slice(-2);
    const seenNames = new Set<string>();
    const sorted = value.sections
      .map((section, index) => {
        if (
          !section.fromStudentId.startsWith(batchPrefix) ||
          !section.toStudentId.startsWith(batchPrefix)
        ) {
          ctx.addIssue({
            code: 'custom',
            path: ['sections', index, 'fromStudentId'],
            message: `Student IDs must belong to batch ${value.year}`,
          });
        }

        if (section.fromStudentId > section.toStudentId) {
          ctx.addIssue({
            code: 'custom',
            path: ['sections', index, 'toStudentId'],
            message: 'To student ID must be greater than or equal to From student ID',
          });
        }

        const normalizedName = section.name.trim().toLowerCase();
        if (seenNames.has(normalizedName)) {
          ctx.addIssue({
            code: 'custom',
            path: ['sections', index, 'name'],
            message: 'Section names must be unique',
          });
        }
        seenNames.add(normalizedName);

        return { ...section, index };
      })
      .sort((left, right) => left.fromStudentId.localeCompare(right.fromStudentId));

    for (let index = 1; index < sorted.length; index++) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      if (current.fromStudentId <= previous.toStudentId) {
        ctx.addIssue({
          code: 'custom',
          path: ['sections', current.index, 'fromStudentId'],
          message: `Student ID range overlaps with ${previous.name}`,
        });
      }
    }
  });

type BatchFormData = z.infer<typeof batchSchema>;

function buildSectionName(index: number) {
  return `Section ${String.fromCharCode(65 + index)}`;
}

export function ManageBatches() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<BatchFormData>({
    resolver: zodResolver(batchSchema),
    defaultValues: {
      year: '',
      sectionCount: 1,
      sections: [],
    },
  });
  const { fields, replace } = useFieldArray({
    control,
    name: 'sections',
  });

  const sectionCount = watch('sectionCount');

  useEffect(() => {
    const safeCount = Number.isFinite(sectionCount) ? Math.max(1, Math.min(26, sectionCount)) : 1;
    const currentSections = getValues('sections');
    if (safeCount <= 1) {
      if (fields.length) replace([]);
      return;
    }

    if (fields.length !== safeCount) {
      replace(
        Array.from({ length: safeCount }, (_, index) => ({
          name: currentSections[index]?.name || buildSectionName(index),
          fromStudentId: currentSections[index]?.fromStudentId || '',
          toStudentId: currentSections[index]?.toStudentId || '',
        })),
      );
    }
  }, [fields.length, getValues, replace, sectionCount]);

  const { data: batches = [] } = useQuery<BatchRecord[]>({
    queryKey: ['batches'],
    queryFn: () => api.get('/office/batches').then((response) => response.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: BatchFormData) =>
      api.post('/office/batches', {
        ...data,
        sections: data.sectionCount === 1 ? [] : data.sections,
      }),
    onSuccess: () => {
      toast.success('Batch created');
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      queryClient.invalidateQueries({ queryKey: ['semesters'] });
      reset({ year: '', sectionCount: 1, sections: [] });
      setShowForm(false);
    },
    onError: (error: any) =>
      toast.error(error.response?.data?.message ?? 'Failed to create batch'),
  });

  const closeForm = () => {
    setShowForm(false);
    reset({ year: '', sectionCount: 1, sections: [] });
  };

  return (
    <AppShell>
      <div className="min-h-screen bg-slate-50">
        <div className="mb-8 border-b border-slate-200 bg-white px-8 py-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-indigo-50 p-2.5">
                <Layers3 size={18} className="text-indigo-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">Batches</h1>
                <p className="mt-0.5 text-xs text-slate-400">
                  {batches.length} batch{batches.length === 1 ? '' : 'es'} configured
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-200 transition-all hover:bg-indigo-700"
            >
              <Plus size={16} />
              New Batch
            </button>
          </div>
        </div>

        <div className="space-y-6 px-8 pb-10">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Total Batches
              </p>
              <p className="mt-3 text-3xl font-bold text-slate-900">{batches.length}</p>
            </div>
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Multi Section
              </p>
              <p className="mt-3 text-3xl font-bold text-slate-900">
                {batches.filter((batch) => batch.sectionCount > 1).length}
              </p>
            </div>
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Total Sections
              </p>
              <p className="mt-3 text-3xl font-bold text-slate-900">
                {batches.reduce((sum, batch) => sum + batch.sectionCount, 0)}
              </p>
            </div>
          </div>

          <Modal open={showForm} onClose={closeForm} title="New Batch">
            <form
              onSubmit={handleSubmit((data) => createMutation.mutate(data))}
              className="space-y-5"
            >
              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className={labelClass}>Batch Year</label>
                  <input
                    {...register('year')}
                    className={inputClass}
                    placeholder="2026"
                    inputMode="numeric"
                    maxLength={4}
                  />
                  {errors.year && (
                    <p className="mt-1.5 text-xs text-red-500">{errors.year.message}</p>
                  )}
                </div>

                <div>
                  <label className={labelClass}>Number of Sections</label>
                  <input
                    type="number"
                    min={1}
                    max={26}
                    {...register('sectionCount', {
                      setValueAs: (value) => Number(value),
                    })}
                    className={inputClass}
                  />
                  {errors.sectionCount && (
                    <p className="mt-1.5 text-xs text-red-500">
                      {errors.sectionCount.message}
                    </p>
                  )}
                </div>
              </div>

              {sectionCount > 1 ? (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-sm font-semibold text-slate-700">
                      Section setup
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Define each section name and its non-overlapping student ID range.
                    </p>
                  </div>

                  <div className="space-y-3">
                    {fields.map((field, index) => (
                      <div
                        key={field.id}
                        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-black/5"
                      >
                        <div className="mb-4 flex items-center gap-2">
                          <div className="rounded-xl bg-indigo-50 p-2 text-indigo-600">
                            <Split size={15} />
                          </div>
                          <p className="text-sm font-semibold text-slate-800">
                            Section {index + 1}
                          </p>
                        </div>

                        <div className="grid gap-4 md:grid-cols-3">
                          <div>
                            <label className={labelClass}>Section Name</label>
                            <input
                              {...register(`sections.${index}.name`)}
                              className={inputClass}
                              placeholder={`Section ${String.fromCharCode(65 + index)}`}
                            />
                            {errors.sections?.[index]?.name && (
                              <p className="mt-1.5 text-xs text-red-500">
                                {errors.sections[index]?.name?.message}
                              </p>
                            )}
                          </div>

                          <div>
                            <label className={labelClass}>From Student ID</label>
                            <input
                              {...register(`sections.${index}.fromStudentId`)}
                              className={inputClass}
                              placeholder="2607001"
                              inputMode="numeric"
                              maxLength={7}
                            />
                            {errors.sections?.[index]?.fromStudentId && (
                              <p className="mt-1.5 text-xs text-red-500">
                                {errors.sections[index]?.fromStudentId?.message}
                              </p>
                            )}
                          </div>

                          <div>
                            <label className={labelClass}>To Student ID</label>
                            <input
                              {...register(`sections.${index}.toStudentId`)}
                              className={inputClass}
                              placeholder="2607060"
                              inputMode="numeric"
                              maxLength={7}
                            />
                            {errors.sections?.[index]?.toStudentId && (
                              <p className="mt-1.5 text-xs text-red-500">
                                {errors.sections[index]?.toStudentId?.message}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  This batch will be treated as a single-section batch, so no section ranges are needed.
                </div>
              )}

              {errors.sections?.root?.message && (
                <p className="text-xs text-red-500">{errors.sections.root.message}</p>
              )}

              <div className="flex gap-3 border-t border-slate-100 pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting || createMutation.isPending}
                  className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white transition-all hover:bg-indigo-700 disabled:opacity-50"
                >
                  {isSubmitting || createMutation.isPending ? 'Saving...' : 'Create Batch'}
                </button>
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </Modal>

          <div className="grid gap-4 lg:grid-cols-2">
            {batches.map((batch) => (
              <div
                key={batch.id}
                className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5"
              >
                <div className="border-b border-slate-100 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-900 px-6 py-5 text-white">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-200">
                        Batch
                      </p>
                      <h2 className="mt-2 text-3xl font-bold">{batch.year}</h2>
                    </div>
                    <div className="rounded-2xl bg-white/10 px-4 py-2 text-right backdrop-blur-sm">
                      <p className="text-xs uppercase tracking-[0.18em] text-indigo-100">
                        Sections
                      </p>
                      <p className="mt-1 text-lg font-semibold">{batch.sectionCount}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 px-6 py-5">
                  {batch.sectionCount === 1 ? (
                    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <UsersRound size={18} className="text-slate-500" />
                      <div>
                        <p className="text-sm font-semibold text-slate-800">
                          Single-section batch
                        </p>
                        <p className="text-xs text-slate-500">
                          No separate section ranges were required.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {batch.sections.map((section) => (
                        <div
                          key={`${batch.id}-${section.name}`}
                          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-slate-800">
                              {section.name}
                            </p>
                            <p className="text-xs font-medium text-slate-500">
                              {section.fromStudentId} to {section.toStudentId}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {!batches.length && (
            <div className="flex flex-col items-center gap-3 rounded-2xl bg-white py-20 text-center shadow-sm ring-1 ring-black/5">
              <Layers3 size={36} className="text-slate-200" />
              <div>
                <p className="text-sm font-semibold text-slate-700">No batches added yet</p>
                <p className="mt-1 text-sm text-slate-400">
                  Create the first batch before configuring semesters and courses.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
