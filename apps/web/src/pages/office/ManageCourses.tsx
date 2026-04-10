import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  CalendarClock,
  FlaskConical,
  Pencil,
  Plus,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { Modal } from '../../components/Modal';
import { WheelTimeInput } from '../../components/WheelTimeInput';
import {
  getCourseEligibleSemesters,
  inputClass,
  labelClass,
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

type CreateCourseForm = z.infer<typeof createCourseSchema>;
type EditCourseForm = z.infer<typeof editCourseSchema>;

type TeacherRecord = {
  id: string;
  fullName: string;
  teacherId: string;
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
  semester?: SemesterRecord;
  teachers?: TeacherRecord[];
  enrollments?: { id: string; student?: { studentId: string } }[];
  schedules?: CourseScheduleRecord[];
};

function normalizeTimeValue(value: string) {
  return value.length >= 5 ? value.slice(0, 5) : value;
}

function FixedField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
        {value}
      </div>
    </div>
  );
}

function TeacherChecklist({
  teachers,
  control,
  name,
}: {
  teachers: TeacherRecord[];
  control: any;
  name: 'teacherIds';
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const selectedTeacherIds = Array.isArray(field.value) ? field.value : [];

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

function ExcludedStudentsInput({
  control,
  batchYear,
}: {
  control: any;
  batchYear: string;
}) {
  const [draft, setDraft] = useState('');

  return (
    <Controller
      control={control}
      name="excludedStudentIds"
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
                  placeholder={batchYear ? `Example: ${batchYear.slice(-2)}07001` : 'Select a batch first'}
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

function SchedulePlanner({
  control,
  schedules,
  errors,
}: {
  control: any;
  schedules: CreateCourseForm['schedules'];
  errors?: any;
}) {
  if (!schedules.length) return null;

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
                  name={`schedules.${index}.dayOfWeek`}
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
                {errors?.[index]?.dayOfWeek && (
                  <p className="mt-1.5 text-xs text-red-500">
                    {errors[index].dayOfWeek.message}
                  </p>
                )}
              </div>

              <div>
                <label className={labelClass}>Start Time</label>
                <Controller
                  control={control}
                  name={`schedules.${index}.startTime`}
                  render={({ field }) => (
                    <WheelTimeInput value={field.value} onChange={field.onChange} />
                  )}
                />
                {errors?.[index]?.startTime && (
                  <p className="mt-1.5 text-xs text-red-500">
                    {errors[index].startTime.message}
                  </p>
                )}
              </div>

              <div>
                <label className={labelClass}>End Time</label>
                <Controller
                  control={control}
                  name={`schedules.${index}.endTime`}
                  render={({ field }) => (
                    <WheelTimeInput value={field.value} onChange={field.onChange} />
                  )}
                />
                {errors?.[index]?.endTime && (
                  <p className="mt-1.5 text-xs text-red-500">
                    {errors[index].endTime.message}
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

function EditCourseModal({
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
  students: Array<{ studentId: string; batchYear: string }>;
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

  const scheduleRows = form.watch('schedules');

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        <FixedField label="Batch" value={course.semester?.batchYear ?? 'Unavailable'} />
        <FixedField
          label="Semester"
          value={
            course.semester?.name
              ? semesterLabels[course.semester.name] ?? course.semester.name
              : 'Unavailable'
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

      <ExcludedStudentsInput
        control={form.control}
        batchYear={course.semester?.batchYear ?? ''}
      />

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

export function ManageCourses() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingCourse, setEditingCourse] = useState<CourseRecord | null>(null);

  const { data: courses = [] } = useQuery<CourseRecord[]>({
    queryKey: ['courses-office'],
    queryFn: () => api.get('/courses').then((response) => response.data),
  });
  const { data: semesters = [] } = useQuery<SemesterRecord[]>({
    queryKey: ['semesters'],
    queryFn: () => api.get('/office/semesters').then((response) => response.data),
  });
  const { data: teachers = [] } = useQuery<TeacherRecord[]>({
    queryKey: ['teachers'],
    queryFn: () => api.get('/office/teachers').then((response) => response.data),
  });
  const { data: batches = [] } = useQuery<BatchRecord[]>({
    queryKey: ['batches'],
    queryFn: () => api.get('/office/batches').then((response) => response.data),
  });
  const { data: students = [] } = useQuery<Array<{ studentId: string; batchYear: string }>>({
    queryKey: ['students'],
    queryFn: () => api.get('/office/students').then((response) => response.data),
  });

  const createForm = useForm<CreateCourseForm>({
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

  const selectedBatchYear = createForm.watch('batchYear');
  const selectedBatch = batches.find((batch) => batch.year === selectedBatchYear);
  const availableSemesters = selectedBatchYear
    ? getCourseEligibleSemesters(semesters, selectedBatchYear)
    : [];
  const scheduleRows = createForm.watch('schedules');

  useEffect(() => {
    createForm.setValue('semesterId', '');
    createForm.setValue('excludedStudentIds', []);
    createForm.setValue('schedules', buildScheduleRows(selectedBatch), {
      shouldValidate: true,
    });
  }, [createForm, selectedBatch]);

  const createMutation = useMutation({
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
    onSuccess: () => {
      toast.success('Course created');
      queryClient.invalidateQueries({ queryKey: ['courses-office'] });
      createForm.reset({
        batchYear: '',
        semesterId: '',
        title: '',
        courseCode: '',
        teacherIds: [],
        schedules: [],
        excludedStudentIds: [],
      });
      setShowForm(false);
    },
    onError: (error: any) =>
      toast.error(error.response?.data?.message ?? 'Failed to create course'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: EditCourseForm }) =>
      api.patch(`/courses/${id}`, payload),
    onSuccess: () => {
      toast.success('Course updated');
      queryClient.invalidateQueries({ queryKey: ['courses-office'] });
      setEditingCourse(null);
    },
    onError: (error: any) =>
      toast.error(error.response?.data?.message ?? 'Failed to update course'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/courses/${id}`),
    onSuccess: () => {
      toast.success('Course deleted');
      queryClient.invalidateQueries({ queryKey: ['courses-office'] });
    },
    onError: (error: any) =>
      toast.error(error.response?.data?.message ?? 'Failed to delete course'),
  });

  const totalCourses = courses.length;
  const sessionalCourses = courses.filter((course) => course.type === 'lab').length;

  return (
    <AppShell>
      <div className="min-h-full bg-slate-50">
        <div className="mb-8 border-b border-slate-200 bg-white px-8 py-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-violet-50 p-2.5">
                <BookOpen size={18} className="text-violet-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">Manage Courses</h1>
                <p className="mt-0.5 text-xs text-slate-400">
                  {totalCourses} total courses · {sessionalCourses} sessional
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-200 transition-all hover:bg-indigo-700"
            >
              <Plus size={16} />
              New Course
            </button>
          </div>
        </div>

        <div className="space-y-6 px-8 pb-10">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Available Batches
              </p>
              <p className="mt-3 text-3xl font-bold text-slate-900">{batches.length}</p>
            </div>
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Eligible Semesters
              </p>
              <p className="mt-3 text-3xl font-bold text-slate-900">
                {semesters.filter((semester) => semester.isCurrent).length +
                  semesters.filter(
                    (semester) =>
                      !semester.isCurrent && new Date(semester.startDate || '') > new Date(),
                  ).length}
              </p>
            </div>
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Instructors Ready
              </p>
              <p className="mt-3 text-3xl font-bold text-slate-900">{teachers.length}</p>
            </div>
          </div>

          <Modal
            open={showForm}
            onClose={() => {
              setShowForm(false);
              createForm.reset({
                batchYear: '',
                semesterId: '',
                title: '',
                courseCode: '',
                teacherIds: [],
                schedules: [],
                excludedStudentIds: [],
              });
            }}
            title="New Course"
            maxWidthClass="max-w-6xl"
          >
            <form
              onSubmit={createForm.handleSubmit((data) => createMutation.mutate(data))}
              className="space-y-6"
            >
              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className={labelClass}>Batch</label>
                  <select {...createForm.register('batchYear')} className={inputClass}>
                    <option value="">Select batch</option>
                    {batches.map((batch) => (
                      <option key={batch.id} value={batch.year}>
                        {batch.year}
                      </option>
                    ))}
                  </select>
                  {createForm.formState.errors.batchYear && (
                    <p className="mt-1.5 text-xs text-red-500">
                      {createForm.formState.errors.batchYear.message}
                    </p>
                  )}
                </div>

                <FixedField label="Course Type" value="Sessional" />
              </div>

              <div>
                <label className={labelClass}>Semester</label>
                <select
                  {...createForm.register('semesterId')}
                  className={inputClass}
                  disabled={!selectedBatchYear}
                >
                  <option value="">
                    {selectedBatchYear ? 'Select semester' : 'Select a batch first'}
                  </option>
                  {availableSemesters.map((semester) => (
                    <option key={semester.id} value={semester.id}>
                      {semesterLabels[semester.name] ?? semester.name}
                    </option>
                  ))}
                </select>
                {createForm.formState.errors.semesterId && (
                  <p className="mt-1.5 text-xs text-red-500">
                    {createForm.formState.errors.semesterId.message}
                  </p>
                )}
                {selectedBatchYear && !availableSemesters.length && (
                  <p className="mt-1.5 text-xs text-amber-600">
                    No current or upcoming semesters are available for this batch yet.
                  </p>
                )}
              </div>

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

              <TeacherChecklist
                teachers={teachers}
                control={createForm.control}
                name="teacherIds"
              />

              {selectedBatch && (
                <div className="space-y-4 rounded-[2rem] border border-slate-200 bg-slate-50 p-5">
                  <div className="flex items-start gap-3">
                    <div className="rounded-2xl bg-white p-3 text-slate-700 shadow-sm ring-1 ring-black/5">
                      <UsersRound size={18} />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">
                        Batch {selectedBatch.year} schedule setup
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {selectedBatch.sectionCount > 1
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

                  <ExcludedStudentsInput
                    control={createForm.control}
                    batchYear={selectedBatchYear}
                  />
                </div>
              )}

              <div className="flex gap-3 border-t border-slate-100 pt-2">
                <button
                  type="submit"
                  disabled={
                    createForm.formState.isSubmitting ||
                    createMutation.isPending ||
                    !teachers.length ||
                    !availableSemesters.length ||
                    !scheduleRows.length
                  }
                  className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white transition-all hover:bg-indigo-700 disabled:opacity-50"
                >
                  {createForm.formState.isSubmitting || createMutation.isPending
                    ? 'Creating...'
                    : 'Create Course'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    createForm.reset({
                      batchYear: '',
                      semesterId: '',
                      title: '',
                      courseCode: '',
                      teacherIds: [],
                      schedules: [],
                      excludedStudentIds: [],
                    });
                  }}
                  className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </Modal>

          <Modal
            open={Boolean(editingCourse)}
            onClose={() => setEditingCourse(null)}
            title="Edit Course"
          >
            {editingCourse && (
              <EditCourseModal
                key={editingCourse.id}
                course={editingCourse}
                batch={batches.find((batch) => batch.year === editingCourse.semester?.batchYear)}
                students={students}
                teachers={teachers}
                isPending={updateMutation.isPending}
                onClose={() => setEditingCourse(null)}
                onSubmit={(payload) =>
                  updateMutation.mutate({ id: editingCourse.id, payload })
                }
              />
            )}
          </Modal>

          <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {[
                    'Code',
                    'Course Name',
                    'Type',
                    'Batch / Semester',
                    'Schedule',
                    'Instructor',
                    'Enrolled',
                    'Actions',
                  ].map((header) => (
                    <th
                      key={header}
                      className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {courses.map((course) => (
                  <tr key={course.id} className="transition-colors hover:bg-slate-50/70">
                    <td className="px-5 py-4">
                      <span className="font-mono font-semibold text-slate-700">
                        {course.courseCode}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-medium text-slate-800">{course.title}</td>
                    <td className="px-5 py-4">
                      {course.type === 'lab' ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                          <FlaskConical size={11} />
                          Sessional
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-blue-200">
                          <BookOpen size={11} />
                          Theory
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-slate-500">
                      <p className="font-medium text-slate-700">
                        Batch {course.semester?.batchYear ?? '—'}
                      </p>
                      <p className="text-xs text-slate-400">
                        {course.semester?.name
                          ? semesterLabels[course.semester.name] ?? course.semester.name
                          : 'Unavailable'}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-slate-500">
                      {course.schedules?.length ? (
                        <div className="space-y-1">
                          {course.schedules.map((schedule) => (
                            <div key={schedule.id} className="text-xs text-slate-600">
                              <span className="font-semibold text-slate-700">
                                {schedule.sectionName || 'All Students'}
                              </span>{' '}
                              · {schedule.dayOfWeek} · {schedule.startTime} - {schedule.endTime}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-300">No schedule</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-slate-500">
                      {course.teachers?.length ? (
                        <div className="space-y-1">
                          {course.teachers.map((teacher) => (
                            <div key={teacher.id} className="flex items-center gap-2">
                              <UserRound size={12} className="text-slate-300" />
                              <span className="text-sm text-slate-700">{teacher.fullName}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-300">No instructor</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex min-w-[2rem] items-center justify-center rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                        {course.enrollments?.length ?? 0}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingCourse(course)}
                          title="Edit course"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-all hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Delete course ${course.courseCode}?`)) {
                              deleteMutation.mutate(course.id);
                            }
                          }}
                          title="Delete course"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-100 text-red-400 transition-all hover:border-red-300 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {!courses.length && (
                  <tr>
                    <td colSpan={8} className="px-5 py-16 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <BookOpen size={32} className="text-slate-200" />
                        <p className="text-sm text-slate-400">No courses created yet</p>
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
