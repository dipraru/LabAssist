import { useEffect, useMemo, useState } from 'react';
import type { AxiosError } from 'axios';
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
  type Control,
  type FieldValues,
  type Path,
  type UseFormReturn,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  CircleOff,
  FlaskConical,
  Layers3,
  Pencil,
  Plus,
  Search,
  Split,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { z } from 'zod';
import { AppShell } from '../../components/AppShell';
import { Modal } from '../../components/Modal';
import { WheelDateInput } from '../../components/WheelDateInput';
import { WheelTimeInput } from '../../components/WheelTimeInput';
import { api } from '../../lib/api';
import {
  formatShortDate,
  getNextSemesterName,
  getSemesterIndex,
  inputClass,
  isFutureDate,
  isValidBatchYear,
  labelClass,
  MAX_BATCH_YEAR,
  semesterAccent,
  semesterLabels,
} from './officeAdmin.shared';
import type { BatchRecord, SemesterRecord } from './officeAdmin.shared';

const dayOfWeekOptions = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

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
    if (value.sectionCount === 1) return;

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

    for (let index = 1; index < sorted.length; index += 1) {
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

const createSemesterSchema = z.object({
  batchYear: z.string().min(1, 'Batch is required'),
  name: z.string().min(1, 'Semester is required'),
  startDate: z.string().min(1, 'Start date is required'),
});

const editSemesterSchema = z.object({
  startDate: z.string().min(1, 'Start date is required'),
});

const scheduleSchema = z
  .object({
    sectionName: z.string().min(1),
    dayOfWeek: z.enum(dayOfWeekOptions),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Start time is required'),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'End time is required'),
  })
  .refine((value) => value.endTime > value.startTime, {
    message: 'End time must be after start time',
    path: ['endTime'],
  });

const createCourseSchema = z
  .object({
    batchYear: z.string().min(1, 'Batch is required'),
    semesterId: z.string().uuid('Semester is required'),
    title: z.string().trim().min(2, 'Course title is required'),
    courseCode: z.string().trim().min(2, 'Course code is required'),
    teacherIds: z.array(z.string().uuid()).min(1, 'Assign at least one teacher'),
    schedules: z.array(scheduleSchema).min(1, 'Schedule is required'),
    excludedStudentIds: z.array(z.string().regex(/^\d{7}$/, 'Student ID must be 7 digits')),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    const batchPrefix = value.batchYear ? value.batchYear.slice(-2) : '';

    value.excludedStudentIds.forEach((studentId, index) => {
      if (seen.has(studentId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['excludedStudentIds', index],
          message: 'Duplicate student ID',
        });
      }
      seen.add(studentId);

      if (batchPrefix && !studentId.startsWith(batchPrefix)) {
        ctx.addIssue({
          code: 'custom',
          path: ['excludedStudentIds', index],
          message: `Student ID must belong to batch ${value.batchYear}`,
        });
      }
    });
  });

const editCourseSchema = z
  .object({
    title: z.string().trim().min(2, 'Course title is required'),
    courseCode: z.string().trim().min(2, 'Course code is required'),
    teacherIds: z.array(z.string().uuid()).min(1, 'Assign at least one teacher'),
    schedules: z.array(scheduleSchema).min(1, 'Schedule is required'),
    excludedStudentIds: z.array(z.string().regex(/^\d{7}$/, 'Student ID must be 7 digits')),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    value.excludedStudentIds.forEach((studentId, index) => {
      if (seen.has(studentId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['excludedStudentIds', index],
          message: 'Duplicate student ID',
        });
      }
      seen.add(studentId);
    });
  });

type BatchFormData = z.infer<typeof batchSchema>;
type CreateSemesterForm = z.infer<typeof createSemesterSchema>;
type EditSemesterForm = z.infer<typeof editSemesterSchema>;
type CreateCourseForm = z.infer<typeof createCourseSchema>;
type EditCourseForm = z.infer<typeof editCourseSchema>;

type TeacherRecord = {
  id: string;
  fullName: string;
  teacherId: string;
};

type StudentRecord = {
  studentId: string;
  batchYear: string;
};

type CourseScheduleRecord = {
  id: string;
  sectionName?: string | null;
  dayOfWeek: (typeof dayOfWeekOptions)[number];
  startTime: string;
  endTime: string;
};

type CourseRecord = {
  id: string;
  title: string;
  courseCode: string;
  type: 'theory' | 'lab';
  semesterId: string;
  canDelete?: boolean;
  deleteBlockReason?: string | null;
  labClassCount?: number;
  startedLabClassCount?: number;
  semester?: SemesterRecord;
  teachers?: TeacherRecord[];
  enrollments?: { id: string; student?: { studentId: string } }[];
  schedules?: CourseScheduleRecord[];
};

type SelectedNode =
  | { type: 'batch'; id: string }
  | { type: 'semester'; id: string }
  | { type: 'course'; id: string }
  | null;

type SemesterModalState =
  | { mode: 'create'; batchYear: string }
  | { mode: 'edit'; semesterId: string }
  | null;

type CourseModalState =
  | { mode: 'create'; semesterId: string }
  | { mode: 'edit'; courseId: string }
  | null;

type ScheduleFieldErrors = Array<{
  dayOfWeek?: { message?: string };
  startTime?: { message?: string };
  endTime?: { message?: string };
}>;

function buildSectionName(index: number) {
  return `Section ${String.fromCharCode(65 + index)}`;
}

function normalizeTimeValue(value: string) {
  return value.length >= 5 ? value.slice(0, 5) : value;
}

function toggleId(list: string[], id: string) {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

function getSafeSemesterIndex(name: string) {
  const index = getSemesterIndex(name);
  return index >= 0 ? index : 0;
}

function getSemesterAccentClass(name: string) {
  return semesterAccent[getSafeSemesterIndex(name) % semesterAccent.length];
}

function getSemesterLabel(name: string) {
  return semesterLabels[name] ?? name;
}

function canCreateCourseInSemester(semester: SemesterRecord) {
  return semester.isCurrent || isFutureDate(semester.startDate);
}

function isSemesterEnded(semester: Pick<SemesterRecord, 'isCurrent' | 'endDate'>) {
  if (semester.isCurrent || !semester.endDate) return false;

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endDate = new Date(semester.endDate);
  const endDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

  return endDay <= todayStart;
}

function canManuallyEndSemester(semester: SemesterRecord) {
  return semester.name === 'semester_8' && !isSemesterEnded(semester);
}

function getErrorMessage(error: unknown, fallback: string) {
  const axiosError = error as AxiosError<{ message?: string | string[] }>;
  const message = axiosError.response?.data?.message;

  if (Array.isArray(message)) {
    return message[0] ?? fallback;
  }

  return message ?? fallback;
}

function StatCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string | number;
  note: string;
}) {
  return (
    <div className="rounded-[26px] border border-slate-200 bg-white/90 p-5 shadow-sm shadow-slate-900/5">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-slate-950">{value}</p>
      <p className="mt-2 text-sm text-slate-500">{note}</p>
    </div>
  );
}

function FixedField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div className="rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-950">
        {value}
      </div>
    </div>
  );
}

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

  if (isSemesterEnded(semester)) {
    return (
      <span className="inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">
        Ended
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
      Inactive
    </span>
  );
}

function TeacherChecklist<TFormValues extends FieldValues>({
  teachers,
  control,
  name,
}: {
  teachers: TeacherRecord[];
  control: Control<TFormValues>;
  name: Path<TFormValues>;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const selectedTeacherIds = Array.isArray(field.value) ? (field.value as string[]) : [];

        return (
          <div>
            <label className={labelClass}>Assign Teachers</label>
            <div className="max-h-48 space-y-2 overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-3">
              {teachers.map((teacher) => {
                const checked = selectedTeacherIds.includes(teacher.id);
                return (
                  <label
                    key={teacher.id}
                    className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-sm text-slate-700 transition-colors hover:bg-white hover:text-slate-900"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => {
                        const next = event.target.checked
                          ? [...selectedTeacherIds, teacher.id]
                          : selectedTeacherIds.filter((item: string) => item !== teacher.id);
                        field.onChange(next);
                      }}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>
                      {teacher.fullName}{' '}
                      <span className="font-mono text-xs text-slate-400">
                        ({teacher.teacherId})
                      </span>
                    </span>
                  </label>
                );
              })}

              {!teachers.length && (
                <p className="text-sm text-slate-400">
                  No teachers available. Create a teacher first to open a course.
                </p>
              )}
            </div>
            {fieldState.error && (
              <p className="mt-1.5 text-xs text-red-500">{fieldState.error.message}</p>
            )}
          </div>
        );
      }}
    />
  );
}

function ExcludedStudentsInput<TFormValues extends FieldValues>({
  control,
  batchYear,
}: {
  control: Control<TFormValues>;
  batchYear: string;
}) {
  const [draft, setDraft] = useState('');

  return (
    <Controller
      control={control}
      name={'excludedStudentIds' as Path<TFormValues>}
      render={({ field, fieldState }) => {
        const values = Array.isArray(field.value) ? field.value : [];

        const commitDraft = () => {
          const tokens = draft
            .split(/[,\s]+/)
            .map((token) => token.trim())
            .filter(Boolean);

          if (!tokens.length) return;

          const nextValues = Array.from(new Set([...values, ...tokens]));
          field.onChange(nextValues);
          setDraft('');
        };

        return (
          <div>
            <label className={labelClass}>Except Students</label>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="mb-3 flex flex-wrap gap-2">
                {values.map((studentId: string) => (
                  <span
                    key={studentId}
                    className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-sm font-medium text-slate-700 ring-1 ring-slate-200"
                  >
                    {studentId}
                    <button
                      type="button"
                      onClick={() =>
                        field.onChange(values.filter((value: string) => value !== studentId))
                      }
                      className="text-slate-400 transition-colors hover:text-red-500"
                    >
                      <X size={14} />
                    </button>
                  </span>
                ))}
                {!values.length && (
                  <p className="text-sm text-slate-400">
                    Add student IDs that should not be enrolled in this course.
                  </p>
                )}
              </div>

              <div className="mt-3 flex gap-3">
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ',') {
                      event.preventDefault();
                      commitDraft();
                    }
                  }}
                  className={`${inputClass} flex-1`}
                  placeholder={
                    batchYear ? `Example: ${batchYear.slice(-2)}07001` : 'Batch unavailable'
                  }
                  disabled={!batchYear}
                />
                <button
                  type="button"
                  onClick={commitDraft}
                  disabled={!batchYear || !draft.trim()}
                  className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>
            {fieldState.error && (
              <p className="mt-1.5 text-xs text-red-500">{fieldState.error.message}</p>
            )}
          </div>
        );
      }}
    />
  );
}

function buildScheduleRows(batch?: BatchRecord) {
  if (!batch) return [];

  const sections =
    batch.sectionCount > 1 && batch.sections.length
      ? batch.sections.map((section) => section.name)
      : [batch.sections[0]?.name ?? 'All Students'];

  return sections.map((sectionName) => ({
    sectionName,
    dayOfWeek: 'Sunday' as const,
    startTime: '08:00',
    endTime: '09:00',
  }));
}

function SchedulePlanner<TFormValues extends FieldValues>({
  control,
  schedules,
  errors,
}: {
  control: Control<TFormValues>;
  schedules: Array<{
    sectionName: string;
    dayOfWeek: (typeof dayOfWeekOptions)[number];
    startTime: string;
    endTime: string;
  }>;
  errors?: unknown;
}) {
  if (!schedules.length) return null;

  const scheduleErrors = Array.isArray(errors) ? (errors as ScheduleFieldErrors) : [];

  return (
    <div className="space-y-3">
      <div>
        <label className={labelClass}>Section Schedules</label>
        <p className="text-sm text-slate-500">
          Set the lab schedule separately for each section of the selected batch.
        </p>
      </div>

      <div className="space-y-3">
        {schedules.map((schedule, index) => (
          <div
            key={`${schedule.sectionName}-${index}`}
            className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-black/5"
          >
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-2xl bg-indigo-50 p-2.5 text-indigo-600">
                <CalendarClock size={16} />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">{schedule.sectionName}</p>
                <p className="text-xs text-slate-500">Dedicated schedule entry</p>
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
              <div>
                <label className={labelClass}>Day</label>
                <Controller
                  control={control}
                  name={`schedules.${index}.dayOfWeek` as Path<TFormValues>}
                  render={({ field }) => (
                    <select {...field} className={inputClass}>
                      {dayOfWeekOptions.map((day) => (
                        <option key={day} value={day}>
                          {day}
                        </option>
                      ))}
                    </select>
                  )}
                />
                {scheduleErrors[index]?.dayOfWeek && (
                  <p className="mt-1.5 text-xs text-red-500">
                    {scheduleErrors[index]?.dayOfWeek?.message}
                  </p>
                )}
              </div>

              <div>
                <label className={labelClass}>Start Time</label>
                <Controller
                  control={control}
                  name={`schedules.${index}.startTime` as Path<TFormValues>}
                  render={({ field }) => (
                    <WheelTimeInput value={field.value} onChange={field.onChange} />
                  )}
                />
                {scheduleErrors[index]?.startTime && (
                  <p className="mt-1.5 text-xs text-red-500">
                    {scheduleErrors[index]?.startTime?.message}
                  </p>
                )}
              </div>

              <div>
                <label className={labelClass}>End Time</label>
                <Controller
                  control={control}
                  name={`schedules.${index}.endTime` as Path<TFormValues>}
                  render={({ field }) => (
                    <WheelTimeInput value={field.value} onChange={field.onChange} />
                  )}
                />
                {scheduleErrors[index]?.endTime && (
                  <p className="mt-1.5 text-xs text-red-500">
                    {scheduleErrors[index]?.endTime?.message}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CreateCourseModalBody({
  semester,
  batch,
  teachers,
  createForm,
  onSubmit,
  onClose,
  isPending,
}: {
  semester: SemesterRecord;
  batch?: BatchRecord;
  teachers: TeacherRecord[];
  createForm: UseFormReturn<CreateCourseForm>;
  onSubmit: (data: CreateCourseForm) => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const scheduleRows = createForm.watch('schedules');

  return (
    <form onSubmit={createForm.handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid gap-5 md:grid-cols-2">
        <FixedField label="Batch" value={semester.batchYear} />
        <FixedField label="Semester" value={getSemesterLabel(semester.name)} />
      </div>

      <FixedField label="Course Type" value="Sessional" />

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label className={labelClass}>Course Title</label>
          <input
            {...createForm.register('title')}
            className={inputClass}
            placeholder="Data Structures Sessional"
          />
          {createForm.formState.errors.title && (
            <p className="mt-1.5 text-xs text-red-500">
              {createForm.formState.errors.title.message}
            </p>
          )}
        </div>

        <div>
          <label className={labelClass}>Course Code</label>
          <input
            {...createForm.register('courseCode')}
            className={inputClass}
            placeholder="CSE-4112"
          />
          {createForm.formState.errors.courseCode && (
            <p className="mt-1.5 text-xs text-red-500">
              {createForm.formState.errors.courseCode.message}
            </p>
          )}
        </div>
      </div>

      <TeacherChecklist teachers={teachers} control={createForm.control} name="teacherIds" />

      {batch && (
        <div className="space-y-4 rounded-[2rem] border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-white p-3 text-slate-700 shadow-sm ring-1 ring-black/5">
              <UsersRound size={18} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Batch {batch.year} schedule setup
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {batch.sectionCount > 1
                  ? 'Each section gets its own day and time slot.'
                  : 'This batch has one shared schedule slot for all students.'}
              </p>
            </div>
          </div>

          <SchedulePlanner
            control={createForm.control}
            schedules={scheduleRows}
            errors={createForm.formState.errors.schedules}
          />

          <ExcludedStudentsInput control={createForm.control} batchYear={semester.batchYear} />
        </div>
      )}

      <div className="flex gap-3 border-t border-slate-100 pt-2">
        <button
          type="submit"
          disabled={
            createForm.formState.isSubmitting ||
            isPending ||
            !teachers.length ||
            !scheduleRows.length
          }
          className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white transition-all hover:bg-indigo-700 disabled:opacity-50"
        >
          {createForm.formState.isSubmitting || isPending ? 'Creating...' : 'Create Course'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function EditCourseModalBody({
  course,
  batch,
  students,
  teachers,
  onClose,
  onSubmit,
  isPending,
}: {
  course: CourseRecord;
  batch?: BatchRecord;
  students: StudentRecord[];
  teachers: TeacherRecord[];
  onClose: () => void;
  onSubmit: (data: EditCourseForm) => void;
  isPending: boolean;
}) {
  const form = useForm<EditCourseForm>({
    resolver: zodResolver(editCourseSchema),
    defaultValues: {
      title: course.title,
      courseCode: course.courseCode,
      teacherIds: course.teachers?.map((teacher) => teacher.id) ?? [],
      schedules:
        course.schedules?.map((schedule) => ({
          sectionName: schedule.sectionName ?? 'All Students',
          dayOfWeek: schedule.dayOfWeek,
          startTime: normalizeTimeValue(schedule.startTime),
          endTime: normalizeTimeValue(schedule.endTime),
        })) ?? buildScheduleRows(batch),
      excludedStudentIds: students
        .filter(
          (student) =>
            student.batchYear === course.semester?.batchYear &&
            !course.enrollments?.some(
              (enrollment) => enrollment.student?.studentId === student.studentId,
            ),
        )
        .map((student) => student.studentId),
    },
  });

  const scheduleRows = useWatch({
    control: form.control,
    name: 'schedules',
  }) ?? [];

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        <FixedField label="Batch" value={course.semester?.batchYear ?? 'Unavailable'} />
        <FixedField
          label="Semester"
          value={
            course.semester?.name ? getSemesterLabel(course.semester.name) : 'Unavailable'
          }
        />
      </div>

      <FixedField label="Course Type" value={course.type === 'lab' ? 'Sessional' : 'Theory'} />

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label className={labelClass}>Course Title</label>
          <input {...form.register('title')} className={inputClass} />
          {form.formState.errors.title && (
            <p className="mt-1.5 text-xs text-red-500">{form.formState.errors.title.message}</p>
          )}
        </div>

        <div>
          <label className={labelClass}>Course Code</label>
          <input {...form.register('courseCode')} className={inputClass} />
          {form.formState.errors.courseCode && (
            <p className="mt-1.5 text-xs text-red-500">
              {form.formState.errors.courseCode.message}
            </p>
          )}
        </div>
      </div>

      <TeacherChecklist teachers={teachers} control={form.control} name="teacherIds" />

      <SchedulePlanner
        control={form.control}
        schedules={scheduleRows}
        errors={form.formState.errors.schedules}
      />

      <ExcludedStudentsInput control={form.control} batchYear={course.semester?.batchYear ?? ''} />

      <div className="flex gap-3 border-t border-slate-100 pt-2">
        <button
          type="submit"
          disabled={form.formState.isSubmitting || isPending}
          className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white transition-all hover:bg-indigo-700 disabled:opacity-50"
        >
          {form.formState.isSubmitting || isPending ? 'Saving...' : 'Save Changes'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function ManageAcademicStructure() {
  const queryClient = useQueryClient();
  const [showBatchForm, setShowBatchForm] = useState(false);
  const [selectedNode, setSelectedNode] = useState<SelectedNode>(null);
  const [batchExpansionState, setBatchExpansionState] = useState<string[] | null>(null);
  const [semesterExpansionState, setSemesterExpansionState] = useState<string[]>([]);
  const [batchSearch, setBatchSearch] = useState('');
  const [semesterModal, setSemesterModal] = useState<SemesterModalState>(null);
  const [courseModal, setCourseModal] = useState<CourseModalState>(null);

  const { data: batches = [] } = useQuery<BatchRecord[]>({
    queryKey: ['batches'],
    queryFn: () => api.get('/office/batches').then((response) => response.data),
  });
  const { data: semesters = [] } = useQuery<SemesterRecord[]>({
    queryKey: ['semesters'],
    queryFn: () => api.get('/office/semesters').then((response) => response.data),
  });
  const { data: courses = [] } = useQuery<CourseRecord[]>({
    queryKey: ['courses-office'],
    queryFn: () => api.get('/courses').then((response) => response.data),
  });
  const { data: teachers = [] } = useQuery<TeacherRecord[]>({
    queryKey: ['teachers'],
    queryFn: () => api.get('/office/teachers').then((response) => response.data),
  });
  const { data: students = [] } = useQuery<StudentRecord[]>({
    queryKey: ['students'],
    queryFn: () => api.get('/office/students').then((response) => response.data),
  });

  const sortedBatches = useMemo(
    () => [...batches].sort((left, right) => Number(right.year) - Number(left.year)),
    [batches],
  );

  const batchById = useMemo(
    () => new Map(sortedBatches.map((batch) => [batch.id, batch])),
    [sortedBatches],
  );
  const batchByYear = useMemo(
    () => new Map(sortedBatches.map((batch) => [batch.year, batch])),
    [sortedBatches],
  );
  const semesterById = useMemo(
    () => new Map(semesters.map((semester) => [semester.id, semester])),
    [semesters],
  );
  const courseById = useMemo(
    () => new Map(courses.map((course) => [course.id, course])),
    [courses],
  );

  const semestersByBatchYear = useMemo(() => {
    const grouped = new Map<string, SemesterRecord[]>();

    semesters.forEach((semester) => {
      const existing = grouped.get(semester.batchYear) ?? [];
      existing.push(semester);
      grouped.set(semester.batchYear, existing);
    });

    grouped.forEach((value, key) => {
      grouped.set(
        key,
        [...value].sort(
          (left, right) => getSafeSemesterIndex(right.name) - getSafeSemesterIndex(left.name),
        ),
      );
    });

    return grouped;
  }, [semesters]);

  const coursesBySemesterId = useMemo(() => {
    const grouped = new Map<string, CourseRecord[]>();

    courses.forEach((course) => {
      const existing = grouped.get(course.semesterId) ?? [];
      existing.push(course);
      grouped.set(course.semesterId, existing);
    });

    grouped.forEach((value, key) => {
      grouped.set(
        key,
        [...value].sort((left, right) => {
          const codeCompare = left.courseCode.localeCompare(right.courseCode);
          return codeCompare !== 0 ? codeCompare : left.title.localeCompare(right.title);
        }),
      );
    });

    return grouped;
  }, [courses]);

  const structureTree = useMemo(
    () =>
      sortedBatches.map((batch) => ({
        batch,
        semesters: (semestersByBatchYear.get(batch.year) ?? []).map((semester) => ({
          semester,
          courses: coursesBySemesterId.get(semester.id) ?? [],
        })),
      })),
    [coursesBySemesterId, semestersByBatchYear, sortedBatches],
  );
  const normalizedBatchSearch = batchSearch.trim().toLowerCase();
  const filteredStructureTree = useMemo(() => {
    if (!normalizedBatchSearch) return structureTree;

    return structureTree.filter(({ batch }) => {
      const searchableText = `${batch.year} batch`.toLowerCase();
      return searchableText.includes(normalizedBatchSearch);
    });
  }, [normalizedBatchSearch, structureTree]);

  const nextSemesterNameByBatchYear = useMemo(() => {
    const map = new Map<string, string | null>();
    sortedBatches.forEach((batch) => {
      map.set(batch.year, getNextSemesterName(semesters, batch.year));
    });
    return map;
  }, [semesters, sortedBatches]);

  const batchForm = useForm<BatchFormData>({
    resolver: zodResolver(batchSchema),
    defaultValues: {
      year: '',
      sectionCount: 1,
      sections: [],
    },
  });
  const { fields: sectionFields, replace: replaceSections } = useFieldArray({
    control: batchForm.control,
    name: 'sections',
  });

  const createSemesterForm = useForm<CreateSemesterForm>({
    resolver: zodResolver(createSemesterSchema),
    defaultValues: {
      batchYear: '',
      name: '',
      startDate: new Date().toISOString().slice(0, 10),
    },
  });

  const editSemesterForm = useForm<EditSemesterForm>({
    resolver: zodResolver(editSemesterSchema),
    defaultValues: {
      startDate: new Date().toISOString().slice(0, 10),
    },
  });

  const createCourseForm = useForm<CreateCourseForm>({
    resolver: zodResolver(createCourseSchema),
    defaultValues: {
      batchYear: '',
      semesterId: '',
      title: '',
      courseCode: '',
      teacherIds: [],
      schedules: [],
      excludedStudentIds: [],
    },
  });

  const selectedBatchFormSectionCount =
    useWatch({
      control: batchForm.control,
      name: 'sectionCount',
    }) ?? 1;
  const currentCreateSemesterBatchYear =
    semesterModal?.mode === 'create' ? semesterModal.batchYear : '';
  const nextSemesterNameForModal = currentCreateSemesterBatchYear
    ? nextSemesterNameByBatchYear.get(currentCreateSemesterBatchYear) ?? null
    : null;
  const semesterBeingEdited =
    semesterModal?.mode === 'edit' ? semesterById.get(semesterModal.semesterId) ?? null : null;
  const semesterForCourseCreate =
    courseModal?.mode === 'create' ? semesterById.get(courseModal.semesterId) ?? null : null;
  const courseBeingEdited =
    courseModal?.mode === 'edit' ? courseById.get(courseModal.courseId) ?? null : null;
  const batchForCourseCreate = semesterForCourseCreate
    ? batchByYear.get(semesterForCourseCreate.batchYear)
    : undefined;

  useEffect(() => {
    const safeCount = Number.isFinite(selectedBatchFormSectionCount)
      ? Math.max(1, Math.min(26, selectedBatchFormSectionCount))
      : 1;
    const currentSections = batchForm.getValues('sections');

    if (safeCount <= 1) {
      if (sectionFields.length) replaceSections([]);
      return;
    }

    if (sectionFields.length !== safeCount) {
      replaceSections(
        Array.from({ length: safeCount }, (_, index) => ({
          name: currentSections[index]?.name || buildSectionName(index),
          fromStudentId: currentSections[index]?.fromStudentId || '',
          toStudentId: currentSections[index]?.toStudentId || '',
        })),
      );
    }
  }, [
    batchForm,
    replaceSections,
    sectionFields.length,
    selectedBatchFormSectionCount,
  ]);

  useEffect(() => {
    if (semesterModal?.mode !== 'create') return;

    createSemesterForm.reset({
      batchYear: semesterModal.batchYear,
      name: nextSemesterNameForModal ?? '',
      startDate: new Date().toISOString().slice(0, 10),
    });
  }, [createSemesterForm, nextSemesterNameForModal, semesterModal]);

  useEffect(() => {
    if (!semesterBeingEdited?.startDate) return;
    editSemesterForm.reset({ startDate: semesterBeingEdited.startDate.slice(0, 10) });
  }, [editSemesterForm, semesterBeingEdited]);

  useEffect(() => {
    if (!semesterForCourseCreate) return;

    createCourseForm.reset({
      batchYear: semesterForCourseCreate.batchYear,
      semesterId: semesterForCourseCreate.id,
      title: '',
      courseCode: '',
      teacherIds: [],
      schedules: buildScheduleRows(batchForCourseCreate),
      excludedStudentIds: [],
    });
  }, [batchForCourseCreate, createCourseForm, semesterForCourseCreate]);

  const effectiveSelectedNode = useMemo(() => {
    if (!structureTree.length) return null;

    const selectionExists =
      selectedNode &&
      ((selectedNode.type === 'batch' && batchById.has(selectedNode.id)) ||
        (selectedNode.type === 'semester' && semesterById.has(selectedNode.id)) ||
        (selectedNode.type === 'course' && courseById.has(selectedNode.id)));

    return selectionExists ? selectedNode : { type: 'batch', id: structureTree[0].batch.id };
  }, [batchById, courseById, selectedNode, semesterById, structureTree]);

  const expandedBatchIds = useMemo(() => {
    const next = (batchExpansionState ?? []).filter((id) => batchById.has(id));
    if (batchExpansionState === null) {
      return structureTree.length ? [structureTree[0].batch.id] : [];
    }
    return next;
  }, [batchById, batchExpansionState, structureTree]);

  const expandedSemesterIds = useMemo(
    () => semesterExpansionState.filter((id) => semesterById.has(id)),
    [semesterById, semesterExpansionState],
  );

  const createBatchMutation = useMutation({
    mutationFn: (data: BatchFormData) =>
      api.post('/office/batches', {
        ...data,
        sections: data.sectionCount === 1 ? [] : data.sections,
      }),
    onSuccess: async (_response, variables) => {
      toast.success('Batch created');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['batches'] }),
        queryClient.invalidateQueries({ queryKey: ['semesters'] }),
      ]);
      batchForm.reset({ year: '', sectionCount: 1, sections: [] });
      setShowBatchForm(false);

      const matchingBatch = Array.from(batchByYear.values()).find(
        (batch) => batch.year === variables.year,
      );
      if (matchingBatch) {
        setSelectedNode({ type: 'batch', id: matchingBatch.id });
      }
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Failed to create batch')),
  });

  const deleteBatchMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/office/batches/${id}`),
    onSuccess: async () => {
      toast.success('Batch deleted');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['batches'] }),
        queryClient.invalidateQueries({ queryKey: ['semesters'] }),
        queryClient.invalidateQueries({ queryKey: ['students'] }),
      ]);
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Failed to delete batch')),
  });

  const createSemesterMutation = useMutation({
    mutationFn: (data: CreateSemesterForm) => api.post('/office/semesters', data),
    onSuccess: async (_response, variables) => {
      toast.success('Semester created');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['semesters'] }),
        queryClient.invalidateQueries({ queryKey: ['batches'] }),
        queryClient.invalidateQueries({ queryKey: ['courses-office'] }),
      ]);
      setSemesterModal(null);

      const parentBatch = batchByYear.get(variables.batchYear);
      if (parentBatch) {
        setSelectedNode({ type: 'batch', id: parentBatch.id });
      }
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Failed to create semester')),
  });

  const updateSemesterMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: EditSemesterForm }) =>
      api.patch(`/office/semesters/${id}`, payload),
    onSuccess: async (_response, variables) => {
      toast.success('Semester updated');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['semesters'] }),
        queryClient.invalidateQueries({ queryKey: ['batches'] }),
        queryClient.invalidateQueries({ queryKey: ['courses-office'] }),
      ]);
      setSemesterModal(null);
      setSelectedNode({ type: 'semester', id: variables.id });
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Failed to update semester')),
  });

  const deleteSemesterMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/office/semesters/${id}`),
    onSuccess: async () => {
      toast.success('Semester deleted');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['semesters'] }),
        queryClient.invalidateQueries({ queryKey: ['batches'] }),
        queryClient.invalidateQueries({ queryKey: ['courses-office'] }),
      ]);
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Failed to delete semester')),
  });

  const endSemesterMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/office/semesters/${id}/end`),
    onSuccess: async (_response, semesterId) => {
      toast.success('Semester ended');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['semesters'] }),
        queryClient.invalidateQueries({ queryKey: ['courses-office'] }),
        queryClient.invalidateQueries({ queryKey: ['batches'] }),
      ]);
      setSelectedNode({ type: 'semester', id: semesterId });
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Failed to end semester')),
  });

  const createCourseMutation = useMutation({
    mutationFn: (data: CreateCourseForm) =>
      api.post('/courses', {
        semesterId: data.semesterId,
        courseCode: data.courseCode,
        title: data.title,
        type: 'lab',
        teacherIds: data.teacherIds,
        schedules: data.schedules,
        excludedStudentIds: data.excludedStudentIds,
      }),
    onSuccess: async (_response, variables) => {
      toast.success('Course created');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['courses-office'] }),
        queryClient.invalidateQueries({ queryKey: ['semesters'] }),
      ]);
      setCourseModal(null);
      setSelectedNode({ type: 'semester', id: variables.semesterId });
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Failed to create course')),
  });

  const updateCourseMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: EditCourseForm }) =>
      api.patch(`/courses/${id}`, payload),
    onSuccess: async (_response, variables) => {
      toast.success('Course updated');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['courses-office'] }),
        queryClient.invalidateQueries({ queryKey: ['semesters'] }),
      ]);
      setCourseModal(null);
      setSelectedNode({ type: 'course', id: variables.id });
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Failed to update course')),
  });

  const deleteCourseMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/courses/${id}`),
    onSuccess: async () => {
      toast.success('Course deleted');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['courses-office'] }),
        queryClient.invalidateQueries({ queryKey: ['semesters'] }),
      ]);
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Failed to delete course')),
  });

  const handleCloseBatchForm = () => {
    setShowBatchForm(false);
    batchForm.reset({ year: '', sectionCount: 1, sections: [] });
  };

  const handleSelectBatch = (batchId: string) => {
    setSelectedNode({ type: 'batch', id: batchId });
  };

  const handleSelectSemester = (semesterId: string) => {
    setSelectedNode({ type: 'semester', id: semesterId });
  };

  const handleSelectCourse = (courseId: string) => {
    setSelectedNode({ type: 'course', id: courseId });
  };

  const handleDeleteBatch = (batch: BatchRecord) => {
    if (!batch.canDelete) return;
    if (window.confirm(`Delete batch ${batch.year}?`)) {
      deleteBatchMutation.mutate(batch.id);
    }
  };

  const handleDeleteSemester = (semester: SemesterRecord) => {
    if (!semester.canDelete) return;
    if (
      window.confirm(
        `Delete ${getSemesterLabel(semester.name)} of batch ${semester.batchYear}?`,
      )
    ) {
      deleteSemesterMutation.mutate(semester.id);
    }
  };

  const handleEndSemester = (semester: SemesterRecord) => {
    if (!canManuallyEndSemester(semester)) return;

    const semesterLabel = getSemesterLabel(semester.name);
    if (
      !window.confirm(
        `End ${semesterLabel} of batch ${semester.batchYear}? This is intended for the final 8th semester.`,
      )
    ) {
      return;
    }

    if (
      !window.confirm(
        'This will end the semester immediately and remove its current status. Do you want to continue?',
      )
    ) {
      return;
    }

    endSemesterMutation.mutate(semester.id);
  };

  const handleDeleteCourse = (course: CourseRecord) => {
    if (!course.canDelete) return;
    if (window.confirm(`Delete course ${course.courseCode}?`)) {
      deleteCourseMutation.mutate(course.id);
    }
  };

  const selectedBatch =
    effectiveSelectedNode?.type === 'batch'
      ? batchById.get(effectiveSelectedNode.id) ?? null
      : null;
  const selectedSemester =
    effectiveSelectedNode?.type === 'semester'
      ? semesterById.get(effectiveSelectedNode.id) ?? null
      : null;
  const selectedCourse =
    effectiveSelectedNode?.type === 'course'
      ? courseById.get(effectiveSelectedNode.id) ?? null
      : null;

  const detailBatch =
    selectedBatch ??
    (selectedSemester ? batchByYear.get(selectedSemester.batchYear) ?? null : null) ??
    (selectedCourse?.semester?.batchYear
      ? batchByYear.get(selectedCourse.semester.batchYear) ?? null
      : null);
  const detailSemester =
    selectedSemester ??
    (selectedCourse ? semesterById.get(selectedCourse.semesterId) ?? null : null);

  const detailBatchSemesters = detailBatch ? semestersByBatchYear.get(detailBatch.year) ?? [] : [];
  const detailSemesterCourses = detailSemester
    ? coursesBySemesterId.get(detailSemester.id) ?? []
    : [];

  const totalCourses = courses.length;
  const activeSemesters = semesters.filter((semester) => semester.isCurrent).length;
  const upcomingSemesters = semesters.filter((semester) => isFutureDate(semester.startDate)).length;

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="overflow-hidden rounded-[34px] border border-slate-200/80 bg-white shadow-[0_30px_90px_-55px_rgba(15,23,42,0.55)]">
          <div className="bg-[radial-gradient(circle_at_top_left,#111827,transparent_26%),linear-gradient(135deg,#0f172a_0%,#115e59_52%,#38bdf8_100%)] px-6 py-8 text-white sm:px-8 sm:py-10">
            <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-50/90 backdrop-blur">
                  <Layers3 size={14} />
                  Academic Structure
                </div>
                <h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
                  Manage batches, semesters, and courses from one structured tree.
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-cyan-50/85 sm:text-base">
                  Follow the office flow in order: create a batch, add the next semester inside it,
                  then open courses under the right term without switching between separate menus.
                </p>
                <div className="mt-5 flex flex-wrap gap-3 text-sm font-medium text-cyan-50/90">
                  <span className="rounded-full border border-white/15 bg-white/10 px-4 py-2 backdrop-blur">
                    1. Batch
                  </span>
                  <span className="rounded-full border border-white/15 bg-white/10 px-4 py-2 backdrop-blur">
                    2. Semester
                  </span>
                  <span className="rounded-full border border-white/15 bg-white/10 px-4 py-2 backdrop-blur">
                    3. Course
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setShowBatchForm(true)}
                  className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-slate-950/10 transition hover:bg-slate-100"
                >
                  <Plus size={16} />
                  Add New Batch
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-4">
          <StatCard
            label="Batches"
            value={sortedBatches.length}
            note="Intake groups available at the root level"
          />
          <StatCard
            label="Semesters"
            value={semesters.length}
            note={`${activeSemesters} active and ${upcomingSemesters} upcoming`}
          />
          <StatCard
            label="Courses"
            value={totalCourses}
            note="All sessional course records under active structure"
          />
          <StatCard
            label="Teachers Ready"
            value={teachers.length}
            note="Available for assignment when courses are opened"
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-[560px_minmax(0,1fr)] 2xl:grid-cols-[640px_minmax(0,1fr)]">
          <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_28px_80px_-60px_rgba(15,23,42,0.65)]">
            <div className="border-b border-slate-200 bg-slate-50/90 px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                    Structure Tree
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-slate-950">
                    Office file system view
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowBatchForm(true)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <Plus size={15} />
                  Batch
                </button>
              </div>
              <div className="relative mt-4">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  value={batchSearch}
                  onChange={(event) => setBatchSearch(event.target.value)}
                  placeholder="Search batch by year"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-11 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-teal-300 focus:ring-4 focus:ring-teal-100"
                />
                {batchSearch ? (
                  <button
                    type="button"
                    onClick={() => setBatchSearch('')}
                    className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                    aria-label="Clear batch search"
                  >
                    <X size={14} />
                  </button>
                ) : null}
              </div>
            </div>

            <div className="max-h-[calc(100vh-17rem)] overflow-auto px-5 py-4">
              {!structureTree.length ? (
                <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center">
                  <Layers3 size={34} className="text-slate-300" />
                  <div>
                    <p className="text-sm font-semibold text-slate-800">No academic structure yet</p>
                    <p className="mt-1 text-sm text-slate-500">
                      Create the first batch to start the hierarchy.
                    </p>
                  </div>
                </div>
              ) : !filteredStructureTree.length ? (
                <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center">
                  <Search size={30} className="text-slate-300" />
                  <div>
                    <p className="text-sm font-semibold text-slate-800">No matching batch found</p>
                    <p className="mt-1 text-sm text-slate-500">
                      Try another year or clear the search to see all batches.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {filteredStructureTree.map(({ batch, semesters: nestedSemesters }, batchIndex) => {
                    const batchSelected =
                      effectiveSelectedNode?.type === 'batch' &&
                      effectiveSelectedNode.id === batch.id;
                    const batchExpanded = expandedBatchIds.includes(batch.id);
                    const batchNextSemester = nextSemesterNameByBatchYear.get(batch.year) ?? null;

                    return (
                      <div key={batch.id} className="relative pl-1">
                        {batchExpanded && batchIndex !== filteredStructureTree.length - 1 ? (
                          <div className="absolute left-[0.95rem] top-9 bottom-0 w-px bg-slate-200" />
                        ) : null}

                        <div className="flex items-start gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setBatchExpansionState((current) =>
                                toggleId(
                                  (current ?? []).filter((id) => batchById.has(id)),
                                  batch.id,
                                ),
                              );
                            }}
                            className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                            aria-label={batchExpanded ? 'Collapse batch' : 'Expand batch'}
                          >
                            <ChevronRight
                              size={15}
                              className={`transition-transform ${batchExpanded ? 'rotate-90' : ''}`}
                            />
                          </button>

                          <div className="min-w-0 flex-1">
                            <div
                              className={`rounded-xl border px-3 py-2 transition ${
                                batchSelected
                                  ? 'border-teal-200 bg-teal-50/70 shadow-sm shadow-teal-950/5'
                                  : 'border-slate-200 bg-white hover:border-slate-300'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => handleSelectBatch(batch.id)}
                                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                                >
                                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-white">
                                    <Layers3 size={15} />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="text-sm font-semibold text-slate-950">
                                        Batch {batch.year}
                                      </p>
                                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                                        {nestedSemesters.length} semester
                                        {nestedSemesters.length === 1 ? '' : 's'}
                                      </span>
                                      <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 ring-1 ring-sky-200">
                                        {batch.studentCount ?? 0} students
                                      </span>
                                    </div>
                                    <p className="mt-1 truncate text-xs text-slate-500">
                                      {batch.sectionCount > 1
                                        ? `${batch.sectionCount} sections configured`
                                        : 'Single-section batch'}
                                    </p>
                                  </div>
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    setSemesterModal({ mode: 'create', batchYear: batch.year })
                                  }
                                  disabled={!batchNextSemester}
                                  title={
                                    batchNextSemester
                                      ? `Add ${getSemesterLabel(batchNextSemester)}`
                                      : 'All 8 semesters are already configured for this batch'
                                  }
                                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <Plus size={12} />
                                  Semester
                                </button>
                              </div>
                            </div>

                            {batchExpanded && (
                              <div className="relative mt-2 ml-3 pl-5">
                                <div className="absolute left-1 top-0 bottom-2 w-px bg-slate-200" />
                                {nestedSemesters.length ? (
                                  <div className="space-y-1.5">
                                    {nestedSemesters.map(
                                      ({ semester, courses: nestedCourses }, semesterIndex) => {
                                      const semesterSelected =
                                        effectiveSelectedNode?.type === 'semester' &&
                                        effectiveSelectedNode.id === semester.id;
                                      const semesterExpanded = expandedSemesterIds.includes(semester.id);
                                      const semesterCanOpenCourse =
                                        canCreateCourseInSemester(semester);
                                      const semesterCanEnd = canManuallyEndSemester(semester);

                                      return (
                                        <div key={semester.id} className="relative">
                                          {semesterIndex !== nestedSemesters.length - 1 ? (
                                            <div className="absolute left-1 top-7 bottom-0 w-px bg-slate-200" />
                                          ) : null}
                                          <div className="absolute left-1 top-4 h-px w-4 bg-slate-300" />

                                          <div className="pl-4">
                                            <div
                                              className={`rounded-lg border px-3 py-2 transition ${
                                                semesterSelected
                                                  ? 'border-indigo-200 bg-indigo-50/70'
                                                  : 'border-slate-200 bg-slate-50/80 hover:border-slate-300'
                                              }`}
                                            >
                                              <div className="flex items-center gap-2">
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setSemesterExpansionState((current) =>
                                                      toggleId(
                                                        current.filter((id) => semesterById.has(id)),
                                                        semester.id,
                                                      ),
                                                    );
                                                  }}
                                                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-500 transition hover:bg-white hover:text-slate-900"
                                                  aria-label={
                                                    semesterExpanded
                                                      ? 'Collapse semester'
                                                      : 'Expand semester'
                                                  }
                                                >
                                                  <ChevronRight
                                                    size={14}
                                                    className={`transition-transform ${
                                                      semesterExpanded ? 'rotate-90' : ''
                                                    }`}
                                                  />
                                                </button>

                                                <button
                                                  type="button"
                                                  onClick={() => handleSelectSemester(semester.id)}
                                                  className="min-w-0 flex-1 text-left"
                                                >
                                                  <div className="flex flex-wrap items-center gap-2.5">
                                                    <span
                                                      className={`inline-flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br ${getSemesterAccentClass(
                                                        semester.name,
                                                      )} text-[11px] font-semibold text-white`}
                                                    >
                                                      {getSafeSemesterIndex(semester.name) + 1}
                                                    </span>
                                                    <div className="min-w-0">
                                                      <p className="truncate text-sm font-semibold text-slate-900">
                                                        {getSemesterLabel(semester.name)}
                                                      </p>
                                                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                                        <SemesterStatusBadge semester={semester} />
                                                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200">
                                                          {nestedCourses.length} course
                                                          {nestedCourses.length === 1 ? '' : 's'}
                                                        </span>
                                                        {semester.endDate ? (
                                                          <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200">
                                                            Ends {formatShortDate(semester.endDate)}
                                                          </span>
                                                        ) : null}
                                                      </div>
                                                    </div>
                                                  </div>
                                                  <p className="mt-1.5 text-xs text-slate-500">
                                                    Starts {formatShortDate(semester.startDate)}
                                                  </p>
                                                </button>

                                                <div className="flex shrink-0 items-center gap-1.5">
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      setCourseModal({
                                                        mode: 'create',
                                                        semesterId: semester.id,
                                                      })
                                                    }
                                                    disabled={!semesterCanOpenCourse}
                                                    title={
                                                      semesterCanOpenCourse
                                                        ? 'Add new course'
                                                        : 'Courses can only be created under active or upcoming semesters'
                                                    }
                                                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                                                  >
                                                    <Plus size={12} />
                                                    Course
                                                  </button>
                                                  {semesterCanEnd ? (
                                                    <button
                                                      type="button"
                                                      onClick={() => handleEndSemester(semester)}
                                                      disabled={endSemesterMutation.isPending}
                                                      className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                                                    >
                                                      <CircleOff size={12} />
                                                      End
                                                    </button>
                                                  ) : null}
                                                </div>
                                              </div>
                                            </div>
                                          </div>

                                          {semesterExpanded && (
                                            <div className="relative mt-2 ml-7 pl-5">
                                              <div className="absolute left-1 top-0 bottom-2 w-px bg-slate-200" />
                                              {nestedCourses.length ? (
                                                <div className="space-y-1.5">
                                                  {nestedCourses.map((course, courseIndex) => {
                                                    const courseSelected =
                                                      effectiveSelectedNode?.type === 'course' &&
                                                      effectiveSelectedNode.id === course.id;

                                                    return (
                                                      <div key={course.id} className="relative">
                                                        {courseIndex !== nestedCourses.length - 1 ? (
                                                          <div className="absolute left-1 top-6 bottom-0 w-px bg-slate-200" />
                                                        ) : null}
                                                        <div className="absolute left-1 top-3 h-px w-4 bg-slate-300" />
                                                        <div className="pl-4">
                                                          <button
                                                            type="button"
                                                            onClick={() => handleSelectCourse(course.id)}
                                                            className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition ${
                                                              courseSelected
                                                                ? 'border-cyan-200 bg-cyan-50/70'
                                                                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                                                            }`}
                                                          >
                                                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-950 text-white">
                                                              {course.type === 'lab' ? (
                                                                <FlaskConical size={13} />
                                                              ) : (
                                                                <BookOpen size={13} />
                                                              )}
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                              <div className="flex flex-wrap items-center gap-2">
                                                                <span className="font-mono text-xs font-semibold text-slate-500">
                                                                  {course.courseCode}
                                                                </span>
                                                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                                                                  {course.enrollments?.length ?? 0} enrolled
                                                                </span>
                                                              </div>
                                                              <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                                                                {course.title}
                                                              </p>
                                                            </div>
                                                          </button>
                                                        </div>
                                                      </div>
                                                    );
                                                  })}
                                                </div>
                                              ) : (
                                                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
                                                  No courses yet inside this semester.
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
                                    No semesters inside this batch yet. Add the next semester to keep
                                    the flow moving.
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_28px_80px_-60px_rgba(15,23,42,0.65)]">
            <div className="border-b border-slate-200 bg-[linear-gradient(180deg,#f8fbff_0%,#eef7ff_100%)] px-6 py-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">
                Selected Node
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-slate-950">
                {effectiveSelectedNode?.type === 'course'
                  ? 'Course Workspace'
                  : effectiveSelectedNode?.type === 'semester'
                    ? 'Semester Workspace'
                    : effectiveSelectedNode?.type === 'batch'
                      ? 'Batch Workspace'
                      : 'Academic Structure'}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Click a batch, semester, or course from the tree to manage it without leaving this
                office view.
              </p>
            </div>

            <div className="px-6 py-6">
              {!effectiveSelectedNode || !detailBatch ? (
                <div className="flex min-h-80 flex-col items-center justify-center gap-3 rounded-[26px] border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
                  <Layers3 size={36} className="text-slate-300" />
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Pick a node from the tree</p>
                    <p className="mt-1 text-sm text-slate-500">
                      The right panel will show all available actions and details here.
                    </p>
                  </div>
                </div>
              ) : effectiveSelectedNode.type === 'course' && selectedCourse && detailSemester ? (
                <div className="space-y-6">
                  <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#164e63_100%)] p-6 text-white shadow-lg shadow-slate-950/10">
                    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                      <div className="max-w-3xl">
                        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100/80">
                          <span>Batch {detailBatch.year}</span>
                          <span>/</span>
                          <span>{getSemesterLabel(detailSemester.name)}</span>
                          <span>/</span>
                          <span>{selectedCourse.courseCode}</span>
                        </div>
                        <h4 className="mt-3 text-3xl font-semibold">{selectedCourse.title}</h4>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90 ring-1 ring-white/15">
                            {selectedCourse.type === 'lab' ? 'Sessional' : 'Theory'}
                          </span>
                          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90 ring-1 ring-white/15">
                            {selectedCourse.enrollments?.length ?? 0} enrolled
                          </span>
                          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90 ring-1 ring-white/15">
                            {selectedCourse.startedLabClassCount ?? 0} of{' '}
                            {selectedCourse.labClassCount ?? 0} lab classes started
                          </span>
                        </div>
                        {selectedCourse.deleteBlockReason ? (
                          <p className="mt-4 text-sm text-rose-100">{selectedCourse.deleteBlockReason}</p>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => setCourseModal({ mode: 'edit', courseId: selectedCourse.id })}
                          className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
                        >
                          <Pencil size={15} />
                          Edit Course
                        </button>
                        <button
                          type="button"
                          disabled={!selectedCourse.canDelete || deleteCourseMutation.isPending}
                          onClick={() => handleDeleteCourse(selectedCourse)}
                          className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Trash2 size={15} />
                          Delete Course
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-3">
                    <StatCard
                      label="Teachers"
                      value={selectedCourse.teachers?.length ?? 0}
                      note="Assigned instructors on this course"
                    />
                    <StatCard
                      label="Schedules"
                      value={selectedCourse.schedules?.length ?? 0}
                      note="Section-wise time slots configured"
                    />
                    <StatCard
                      label="Semester"
                      value={getSemesterLabel(detailSemester.name)}
                      note={`Starts ${formatShortDate(detailSemester.startDate)}`}
                    />
                  </div>

                  <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                    <div className="rounded-[26px] border border-slate-200 bg-white p-6 shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="rounded-2xl bg-slate-900 p-3 text-white">
                          <CalendarClock size={18} />
                        </div>
                        <div>
                          <p className="text-lg font-semibold text-slate-950">Schedule overview</p>
                          <p className="text-sm text-slate-500">
                            Section-wise lab timing configured for this course.
                          </p>
                        </div>
                      </div>

                      <div className="mt-5 space-y-3">
                        {selectedCourse.schedules?.length ? (
                          selectedCourse.schedules.map((schedule) => (
                            <div
                              key={schedule.id}
                              className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-slate-900">
                                    {schedule.sectionName || 'All Students'}
                                  </p>
                                  <p className="mt-1 text-xs text-slate-500">
                                    {schedule.dayOfWeek}
                                  </p>
                                </div>
                                <div className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-slate-700 ring-1 ring-slate-200">
                                  {schedule.startTime} - {schedule.endTime}
                                </div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                            No schedule configured yet.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-[26px] border border-slate-200 bg-white p-6 shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="rounded-2xl bg-cyan-50 p-3 text-cyan-700">
                          <UsersRound size={18} />
                        </div>
                        <div>
                          <p className="text-lg font-semibold text-slate-950">Assigned teachers</p>
                          <p className="text-sm text-slate-500">
                            Current faculty linked to this course.
                          </p>
                        </div>
                      </div>

                      <div className="mt-5 space-y-3">
                        {selectedCourse.teachers?.length ? (
                          selectedCourse.teachers.map((teacher) => (
                            <div
                              key={teacher.id}
                              className="flex items-center gap-3 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3"
                            >
                              <div className="rounded-2xl bg-white p-2 text-slate-700 ring-1 ring-slate-200">
                                <UserRound size={15} />
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-slate-900">
                                  {teacher.fullName}
                                </p>
                                <p className="font-mono text-xs text-slate-500">
                                  {teacher.teacherId}
                                </p>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                            No instructors assigned yet.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : effectiveSelectedNode.type === 'semester' && detailSemester ? (
                <div className="space-y-6">
                  <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#312e81_46%,#0ea5e9_100%)] p-6 text-white shadow-lg shadow-slate-950/10">
                    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                      <div className="max-w-3xl">
                        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100/80">
                          <span>Batch {detailBatch.year}</span>
                          <span>/</span>
                          <span>{getSemesterLabel(detailSemester.name)}</span>
                        </div>
                        <h4 className="mt-3 text-3xl font-semibold">
                          {getSemesterLabel(detailSemester.name)}
                        </h4>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <SemesterStatusBadge semester={detailSemester} />
                          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90 ring-1 ring-white/15">
                            Starts {formatShortDate(detailSemester.startDate)}
                          </span>
                          {detailSemester.endDate ? (
                            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90 ring-1 ring-white/15">
                              Ends {formatShortDate(detailSemester.endDate)}
                            </span>
                          ) : null}
                          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90 ring-1 ring-white/15">
                            {detailSemesterCourses.length} course
                            {detailSemesterCourses.length === 1 ? '' : 's'}
                          </span>
                        </div>
                        {!detailSemester.canDelete && detailSemester.deleteBlockReason ? (
                          <p className="mt-4 text-sm text-cyan-50/80">
                            {detailSemester.deleteBlockReason}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            setCourseModal({ mode: 'create', semesterId: detailSemester.id })
                          }
                          disabled={!canCreateCourseInSemester(detailSemester)}
                          className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Plus size={15} />
                          Add New Course
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setSemesterModal({ mode: 'edit', semesterId: detailSemester.id })
                          }
                          className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
                        >
                          <Pencil size={15} />
                          Edit Semester
                        </button>
                        {canManuallyEndSemester(detailSemester) ? (
                          <button
                            type="button"
                            disabled={endSemesterMutation.isPending}
                            onClick={() => handleEndSemester(detailSemester)}
                            className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <CircleOff size={15} />
                            End Semester
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={!detailSemester.canDelete || deleteSemesterMutation.isPending}
                          onClick={() => handleDeleteSemester(detailSemester)}
                          className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Trash2 size={15} />
                          Delete Semester
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-3">
                    <StatCard
                      label="Courses"
                      value={detailSemesterCourses.length}
                      note="Courses currently inside this semester"
                    />
                    <StatCard
                      label="Eligible State"
                      value={canCreateCourseInSemester(detailSemester) ? 'Open' : 'Locked'}
                      note={
                        canCreateCourseInSemester(detailSemester)
                          ? 'Course creation is allowed here'
                          : 'Only active or upcoming semesters can open new courses'
                      }
                    />
                    <StatCard
                      label="Batch"
                      value={detailBatch.year}
                      note="Parent batch for this semester node"
                    />
                  </div>

                  <div className="space-y-4">
                    {detailSemesterCourses.length ? (
                      detailSemesterCourses.map((course) => (
                        <div
                          key={course.id}
                          className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm"
                        >
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <button
                              type="button"
                              onClick={() => handleSelectCourse(course.id)}
                              className="flex min-w-0 flex-1 items-start gap-4 text-left"
                            >
                              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white">
                                {course.type === 'lab' ? (
                                  <FlaskConical size={18} />
                                ) : (
                                  <BookOpen size={18} />
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-mono text-sm font-semibold text-slate-500">
                                    {course.courseCode}
                                  </span>
                                  <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                                    {course.type === 'lab' ? 'Sessional' : 'Theory'}
                                  </span>
                                </div>
                                <p className="mt-2 text-lg font-semibold text-slate-950">
                                  {course.title}
                                </p>
                                <p className="mt-1 text-sm text-slate-500">
                                  {course.enrollments?.length ?? 0} enrolled •{' '}
                                  {course.startedLabClassCount ?? 0} of {course.labClassCount ?? 0}{' '}
                                  lab classes started
                                </p>
                              </div>
                            </button>

                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setCourseModal({ mode: 'edit', courseId: course.id })
                                }
                                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                              >
                                <Pencil size={14} />
                                Edit
                              </button>
                              <button
                                type="button"
                                disabled={!course.canDelete || deleteCourseMutation.isPending}
                                onClick={() => handleDeleteCourse(course)}
                                className="inline-flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <Trash2 size={14} />
                                Delete
                              </button>
                            </div>
                          </div>

                          <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                            <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                Schedule
                              </p>
                              <div className="mt-3 space-y-2">
                                {course.schedules?.length ? (
                                  course.schedules.map((schedule) => (
                                    <div
                                      key={schedule.id}
                                      className="rounded-2xl bg-white px-3 py-3 text-sm text-slate-700 ring-1 ring-slate-200"
                                    >
                                      <span className="font-semibold text-slate-900">
                                        {schedule.sectionName || 'All Students'}
                                      </span>{' '}
                                      • {schedule.dayOfWeek} • {schedule.startTime} -{' '}
                                      {schedule.endTime}
                                    </div>
                                  ))
                                ) : (
                                  <p className="text-sm text-slate-500">No schedule configured yet.</p>
                                )}
                              </div>
                            </div>

                            <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                Teachers
                              </p>
                              <div className="mt-3 space-y-2">
                                {course.teachers?.length ? (
                                  course.teachers.map((teacher) => (
                                    <div
                                      key={teacher.id}
                                      className="flex items-center gap-2 rounded-2xl bg-white px-3 py-3 text-sm text-slate-700 ring-1 ring-slate-200"
                                    >
                                      <UserRound size={14} className="text-slate-400" />
                                      <span>{teacher.fullName}</span>
                                    </div>
                                  ))
                                ) : (
                                  <p className="text-sm text-slate-500">No instructor assigned yet.</p>
                                )}
                              </div>
                            </div>
                          </div>

                          {!course.canDelete && course.deleteBlockReason ? (
                            <p className="mt-4 text-sm text-rose-600">{course.deleteBlockReason}</p>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <div className="flex flex-col items-center gap-3 rounded-[26px] border border-dashed border-slate-200 bg-slate-50 py-16 text-center">
                        <BookOpen size={34} className="text-slate-300" />
                        <div>
                          <p className="text-sm font-semibold text-slate-800">No courses yet</p>
                          <p className="mt-1 text-sm text-slate-500">
                            Open a new course from this semester when the term is active or upcoming.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : effectiveSelectedNode.type === 'batch' && detailBatch ? (
                <div className="space-y-6">
                  <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#115e59_46%,#38bdf8_100%)] p-6 text-white shadow-lg shadow-slate-950/10">
                    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                      <div className="max-w-3xl">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100/80">
                          Batch root
                        </div>
                        <h4 className="mt-3 text-3xl font-semibold">Batch {detailBatch.year}</h4>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90 ring-1 ring-white/15">
                            {detailBatch.sectionCount} section
                            {detailBatch.sectionCount === 1 ? '' : 's'}
                          </span>
                          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90 ring-1 ring-white/15">
                            {detailBatchSemesters.length} semester
                            {detailBatchSemesters.length === 1 ? '' : 's'}
                          </span>
                          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90 ring-1 ring-white/15">
                            {detailBatch.studentCount ?? 0} students linked
                          </span>
                        </div>
                        {!detailBatch.canDelete && detailBatch.deleteBlockReason ? (
                          <p className="mt-4 text-sm text-cyan-50/80">
                            {detailBatch.deleteBlockReason}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            setSemesterModal({ mode: 'create', batchYear: detailBatch.year })
                          }
                          disabled={!nextSemesterNameByBatchYear.get(detailBatch.year)}
                          className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Plus size={15} />
                          Add New Semester
                        </button>
                        <button
                          type="button"
                          disabled={!detailBatch.canDelete || deleteBatchMutation.isPending}
                          onClick={() => handleDeleteBatch(detailBatch)}
                          className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Trash2 size={15} />
                          Delete Batch
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-3">
                    <StatCard
                      label="Sections"
                      value={detailBatch.sectionCount}
                      note={
                        detailBatch.sectionCount > 1
                          ? 'Section-wise student ranges configured'
                          : 'Single-section batch'
                      }
                    />
                    <StatCard
                      label="Current Progress"
                      value={
                        nextSemesterNameByBatchYear.get(detailBatch.year)
                          ? getSemesterLabel(
                              nextSemesterNameByBatchYear.get(detailBatch.year) as string,
                            )
                          : 'Complete'
                      }
                      note="Next semester slot available for creation"
                    />
                    <StatCard
                      label="Courses Under Batch"
                      value={detailBatchSemesters.reduce(
                        (sum, semester) => sum + (coursesBySemesterId.get(semester.id)?.length ?? 0),
                        0,
                      )}
                      note="All courses nested inside this batch"
                    />
                  </div>

                  <div className="rounded-[26px] border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="rounded-2xl bg-slate-900 p-3 text-white">
                        {detailBatch.sectionCount > 1 ? <Split size={18} /> : <UsersRound size={18} />}
                      </div>
                      <div>
                        <p className="text-lg font-semibold text-slate-950">Batch sections</p>
                        <p className="text-sm text-slate-500">
                          Student grouping preserved exactly as in the original batch management flow.
                        </p>
                      </div>
                    </div>

                    <div className="mt-5">
                      {detailBatch.sectionCount === 1 ? (
                        <div className="rounded-[22px] border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
                          This batch is configured as a single-section intake, so no separate ID
                          ranges are required.
                        </div>
                      ) : (
                        <div className="grid gap-3 md:grid-cols-2">
                          {detailBatch.sections.map((section) => (
                            <div
                              key={`${detailBatch.id}-${section.name}`}
                              className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-semibold text-slate-900">
                                  {section.name}
                                </p>
                                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                                  {section.fromStudentId} - {section.toStudentId}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    {detailBatchSemesters.length ? (
                      detailBatchSemesters.map((semester) => {
                        const semesterCourses = coursesBySemesterId.get(semester.id) ?? [];
                        const semesterCanOpenCourse = canCreateCourseInSemester(semester);

                        return (
                          <div
                            key={semester.id}
                            className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm"
                          >
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                              <button
                                type="button"
                                onClick={() => handleSelectSemester(semester.id)}
                                className="flex min-w-0 flex-1 items-start gap-4 text-left"
                              >
                                <div
                                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${getSemesterAccentClass(
                                    semester.name,
                                  )} text-white`}
                                >
                                  <CalendarDays size={18} />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-lg font-semibold text-slate-950">
                                      {getSemesterLabel(semester.name)}
                                    </p>
                                    <SemesterStatusBadge semester={semester} />
                                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">
                                      {semesterCourses.length} course
                                      {semesterCourses.length === 1 ? '' : 's'}
                                    </span>
                                  </div>
                                  <p className="mt-2 text-sm text-slate-500">
                                    Starts {formatShortDate(semester.startDate)}
                                  </p>
                                  {semester.endDate ? (
                                    <p className="mt-1 text-xs text-slate-500">
                                      Ends {formatShortDate(semester.endDate)}
                                    </p>
                                  ) : null}
                                </div>
                              </button>

                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setCourseModal({ mode: 'create', semesterId: semester.id })
                                  }
                                  disabled={!semesterCanOpenCourse}
                                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <Plus size={14} />
                                  Add Course
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSemesterModal({ mode: 'edit', semesterId: semester.id })
                                  }
                                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                                >
                                  <Pencil size={14} />
                                  Edit
                                </button>
                                {canManuallyEndSemester(semester) ? (
                                  <button
                                    type="button"
                                    disabled={endSemesterMutation.isPending}
                                    onClick={() => handleEndSemester(semester)}
                                    className="inline-flex items-center gap-2 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    <CircleOff size={14} />
                                    End
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  disabled={!semester.canDelete || deleteSemesterMutation.isPending}
                                  onClick={() => handleDeleteSemester(semester)}
                                  className="inline-flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <Trash2 size={14} />
                                  Delete
                                </button>
                              </div>
                            </div>

                            <div className="mt-5 space-y-2">
                              {semesterCourses.length ? (
                                semesterCourses.map((course) => (
                                  <div
                                    key={course.id}
                                    className="flex flex-col gap-3 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
                                  >
                                    <button
                                      type="button"
                                      onClick={() => handleSelectCourse(course.id)}
                                      className="flex min-w-0 flex-1 items-start gap-3 text-left"
                                    >
                                      <div className="mt-0.5 rounded-2xl bg-white p-2.5 text-slate-700 ring-1 ring-slate-200">
                                        {course.type === 'lab' ? (
                                          <FlaskConical size={15} />
                                        ) : (
                                          <BookOpen size={15} />
                                        )}
                                      </div>
                                      <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="font-mono text-xs font-semibold text-slate-500">
                                            {course.courseCode}
                                          </span>
                                          <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200">
                                            {course.enrollments?.length ?? 0} enrolled
                                          </span>
                                        </div>
                                        <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                                          {course.title}
                                        </p>
                                      </div>
                                    </button>

                                    <div className="text-sm text-slate-500">
                                      {course.teachers?.length
                                        ? `${course.teachers.length} teacher assigned`
                                        : 'No instructor assigned yet'}
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                                  No courses created under this semester yet.
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="flex flex-col items-center gap-3 rounded-[26px] border border-dashed border-slate-200 bg-slate-50 py-16 text-center">
                        <CalendarDays size={34} className="text-slate-300" />
                        <div>
                          <p className="text-sm font-semibold text-slate-800">
                            This batch has no semesters yet
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            Add the next semester from here to continue the structure flow.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <Modal open={showBatchForm} onClose={handleCloseBatchForm} title="Create New Batch">
          <form
            onSubmit={batchForm.handleSubmit((data) => createBatchMutation.mutate(data))}
            className="space-y-5"
          >
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label className={labelClass}>Batch Year</label>
                <input
                  {...batchForm.register('year')}
                  className={inputClass}
                  placeholder="2026"
                  inputMode="numeric"
                  maxLength={4}
                />
                {batchForm.formState.errors.year && (
                  <p className="mt-1.5 text-xs text-red-500">
                    {batchForm.formState.errors.year.message}
                  </p>
                )}
              </div>

              <div>
                <label className={labelClass}>Number of Sections</label>
                <input
                  type="number"
                  min={1}
                  max={26}
                  {...batchForm.register('sectionCount', {
                    setValueAs: (value) => Number(value),
                  })}
                  className={inputClass}
                />
                {batchForm.formState.errors.sectionCount && (
                  <p className="mt-1.5 text-xs text-red-500">
                    {batchForm.formState.errors.sectionCount.message}
                  </p>
                )}
              </div>
            </div>

            {selectedBatchFormSectionCount > 1 ? (
              <div className="space-y-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-700">Section setup</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Define each section name and its non-overlapping student ID range.
                  </p>
                </div>

                <div className="space-y-3">
                  {sectionFields.map((field, index) => (
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
                            {...batchForm.register(`sections.${index}.name`)}
                            className={inputClass}
                            placeholder={`Section ${String.fromCharCode(65 + index)}`}
                          />
                          {batchForm.formState.errors.sections?.[index]?.name && (
                            <p className="mt-1.5 text-xs text-red-500">
                              {batchForm.formState.errors.sections[index]?.name?.message}
                            </p>
                          )}
                        </div>

                        <div>
                          <label className={labelClass}>From Student ID</label>
                          <input
                            {...batchForm.register(`sections.${index}.fromStudentId`)}
                            className={inputClass}
                            placeholder="2607001"
                            inputMode="numeric"
                            maxLength={7}
                          />
                          {batchForm.formState.errors.sections?.[index]?.fromStudentId && (
                            <p className="mt-1.5 text-xs text-red-500">
                              {batchForm.formState.errors.sections[index]?.fromStudentId?.message}
                            </p>
                          )}
                        </div>

                        <div>
                          <label className={labelClass}>To Student ID</label>
                          <input
                            {...batchForm.register(`sections.${index}.toStudentId`)}
                            className={inputClass}
                            placeholder="2607060"
                            inputMode="numeric"
                            maxLength={7}
                          />
                          {batchForm.formState.errors.sections?.[index]?.toStudentId && (
                            <p className="mt-1.5 text-xs text-red-500">
                              {batchForm.formState.errors.sections[index]?.toStudentId?.message}
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

            {batchForm.formState.errors.sections?.root?.message && (
              <p className="text-xs text-red-500">{batchForm.formState.errors.sections.root.message}</p>
            )}

            <div className="flex gap-3 border-t border-slate-100 pt-2">
              <button
                type="submit"
                disabled={batchForm.formState.isSubmitting || createBatchMutation.isPending}
                className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white transition-all hover:bg-indigo-700 disabled:opacity-50"
              >
                {batchForm.formState.isSubmitting || createBatchMutation.isPending
                  ? 'Saving...'
                  : 'Create Batch'}
              </button>
              <button
                type="button"
                onClick={handleCloseBatchForm}
                className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </Modal>

        <Modal
          open={semesterModal?.mode === 'create'}
          onClose={() => setSemesterModal(null)}
          title="Add Semester"
        >
          <form
            onSubmit={createSemesterForm.handleSubmit((data) => {
              if (!nextSemesterNameForModal) {
                toast.error('No available semester slot remains for this batch');
                return;
              }

              createSemesterMutation.mutate({
                ...data,
                batchYear: currentCreateSemesterBatchYear,
                name: nextSemesterNameForModal,
              });
            })}
            className="space-y-5"
          >
            <div className="grid gap-5 md:grid-cols-2">
              <DeterminedField label="Batch" value={currentCreateSemesterBatchYear || 'Unavailable'} />
              <DeterminedField
                label="Semester"
                value={
                  currentCreateSemesterBatchYear
                    ? nextSemesterNameForModal
                      ? getSemesterLabel(nextSemesterNameForModal)
                      : 'All 8 semesters already created'
                    : 'Select a batch first'
                }
                muted={!currentCreateSemesterBatchYear || !nextSemesterNameForModal}
              />
            </div>

            <div>
              <label className={labelClass}>Start Date</label>
              <Controller
                control={createSemesterForm.control}
                name="startDate"
                render={({ field }) => (
                  <WheelDateInput
                    value={field.value}
                    onChange={field.onChange}
                    disabled={!currentCreateSemesterBatchYear || !nextSemesterNameForModal}
                  />
                )}
              />
              {createSemesterForm.formState.errors.startDate && (
                <p className="mt-2 text-xs text-red-500">
                  {createSemesterForm.formState.errors.startDate.message}
                </p>
              )}
            </div>

            {currentCreateSemesterBatchYear && !nextSemesterNameForModal && (
              <div className="rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-700">
                All semester slots are already used for batch {currentCreateSemesterBatchYear}.
              </div>
            )}

            <div className="flex gap-3 border-t border-slate-100 pt-2">
              <button
                type="submit"
                disabled={
                  createSemesterForm.formState.isSubmitting ||
                  createSemesterMutation.isPending ||
                  !currentCreateSemesterBatchYear ||
                  !nextSemesterNameForModal
                }
                className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white transition-all hover:bg-indigo-700 disabled:opacity-50"
              >
                {createSemesterForm.formState.isSubmitting || createSemesterMutation.isPending
                  ? 'Creating...'
                  : 'Create Semester'}
              </button>
              <button
                type="button"
                onClick={() => setSemesterModal(null)}
                className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </Modal>

        <Modal
          open={Boolean(semesterBeingEdited)}
          onClose={() => setSemesterModal(null)}
          title="Edit Semester"
        >
          {semesterBeingEdited && (
            <form
              onSubmit={editSemesterForm.handleSubmit((payload) =>
                updateSemesterMutation.mutate({ id: semesterBeingEdited.id, payload }),
              )}
              className="space-y-5"
            >
              <div className="grid gap-5 md:grid-cols-2">
                <DeterminedField label="Batch" value={semesterBeingEdited.batchYear} />
                <DeterminedField
                  label="Semester"
                  value={getSemesterLabel(semesterBeingEdited.name)}
                />
              </div>

              <div>
                <label className={labelClass}>Start Date</label>
                <Controller
                  control={editSemesterForm.control}
                  name="startDate"
                  render={({ field }) => (
                    <WheelDateInput value={field.value} onChange={field.onChange} />
                  )}
                />
                {editSemesterForm.formState.errors.startDate && (
                  <p className="mt-2 text-xs text-red-500">
                    {editSemesterForm.formState.errors.startDate.message}
                  </p>
                )}
              </div>

              <div className="flex gap-3 border-t border-slate-100 pt-2">
                <button
                  type="submit"
                  disabled={editSemesterForm.formState.isSubmitting || updateSemesterMutation.isPending}
                  className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white transition-all hover:bg-indigo-700 disabled:opacity-50"
                >
                  {editSemesterForm.formState.isSubmitting || updateSemesterMutation.isPending
                    ? 'Saving...'
                    : 'Save Changes'}
                </button>
                <button
                  type="button"
                  onClick={() => setSemesterModal(null)}
                  className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </Modal>

        <Modal
          open={Boolean(semesterForCourseCreate)}
          onClose={() => setCourseModal(null)}
          title="Add Course"
          maxWidthClass="max-w-6xl"
        >
          {semesterForCourseCreate && (
            <CreateCourseModalBody
              semester={semesterForCourseCreate}
              batch={batchForCourseCreate}
              teachers={teachers}
              createForm={createCourseForm}
              isPending={createCourseMutation.isPending}
              onClose={() => setCourseModal(null)}
              onSubmit={(data) => createCourseMutation.mutate(data)}
            />
          )}
        </Modal>

        <Modal
          open={Boolean(courseBeingEdited)}
          onClose={() => setCourseModal(null)}
          title="Edit Course"
        >
          {courseBeingEdited && (
            <EditCourseModalBody
              key={courseBeingEdited.id}
              course={courseBeingEdited}
              batch={batchByYear.get(courseBeingEdited.semester?.batchYear ?? '')}
              students={students}
              teachers={teachers}
              isPending={updateCourseMutation.isPending}
              onClose={() => setCourseModal(null)}
              onSubmit={(payload) =>
                updateCourseMutation.mutate({ id: courseBeingEdited.id, payload })
              }
            />
          )}
        </Modal>
      </div>
    </AppShell>
  );
}
