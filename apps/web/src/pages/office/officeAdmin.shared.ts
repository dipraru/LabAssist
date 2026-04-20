export const MAX_BATCH_YEAR = new Date().getFullYear() + 1;

export const semesterSequence = [
  'semester_1',
  'semester_2',
  'semester_3',
  'semester_4',
  'semester_5',
  'semester_6',
  'semester_7',
  'semester_8',
] as const;

export const semesterLabels: Record<string, string> = {
  semester_1: '1st Semester',
  semester_2: '2nd Semester',
  semester_3: '3rd Semester',
  semester_4: '4th Semester',
  semester_5: '5th Semester',
  semester_6: '6th Semester',
  semester_7: '7th Semester',
  semester_8: '8th Semester',
};

export const semesterAccent = [
  'from-blue-500 to-blue-600',
  'from-violet-500 to-violet-600',
  'from-cyan-500 to-cyan-600',
  'from-emerald-500 to-emerald-600',
  'from-amber-500 to-amber-600',
  'from-rose-500 to-rose-600',
  'from-indigo-500 to-indigo-600',
  'from-teal-500 to-teal-600',
];

export const inputClass =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:bg-white transition-all';
export const labelClass =
  'block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5';

export type BatchSection = {
  name: string;
  fromStudentId: string;
  toStudentId: string;
};

export type BatchRecord = {
  id: string;
  year: string;
  sectionCount: number;
  sections: BatchSection[];
  semesterCount?: number;
  studentCount?: number;
  canDelete?: boolean;
  deleteBlockReason?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type SemesterRecord = {
  id: string;
  name: string;
  batchYear: string;
  startDate: string | null;
  endDate?: string | null;
  isCurrent: boolean;
  courseCount?: number;
  canDelete?: boolean;
  deleteBlockReason?: string | null;
};

export function isValidBatchYear(value: string): boolean {
  if (!/^\d{4}$/.test(value)) return false;
  const year = Number(value);
  return year >= 2000 && year <= MAX_BATCH_YEAR;
}

export function getSemesterIndex(name: string): number {
  return semesterSequence.indexOf(name as (typeof semesterSequence)[number]);
}

export function getNextSemesterName(
  semesters: SemesterRecord[],
  batchYear: string,
): string | null {
  const batchSemesters = semesters.filter(
    (semester) => semester.batchYear === batchYear,
  );
  return (
    semesterSequence.find(
      (semesterName) =>
        !batchSemesters.some((semester) => semester.name === semesterName),
    ) ?? null
  );
}

export function isFutureDate(dateValue?: string | null): boolean {
  if (!dateValue) return false;
  const today = new Date();
  const date = new Date(dateValue);
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return dateStart > todayStart;
}

export function getCourseEligibleSemesters(
  semesters: SemesterRecord[],
  batchYear: string,
): SemesterRecord[] {
  return semesters
    .filter(
      (semester) =>
        semester.batchYear === batchYear &&
        (semester.isCurrent || isFutureDate(semester.startDate)),
    )
    .sort((left, right) => getSemesterIndex(left.name) - getSemesterIndex(right.name));
}

export function formatShortDate(dateValue?: string | null): string {
  if (!dateValue) return 'Not scheduled';
  const date = new Date(dateValue);
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
