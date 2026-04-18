import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  CalendarDays,
  Home,
  LockKeyhole,
  Mail,
  MapPinned,
  Pencil,
  Phone,
  Save,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { api } from '../../lib/api';
import { SafeImage } from '../../lib/media';
import { useAuthStore } from '../../store/auth.store';
import { AppShell } from '../../components/AppShell';
import { Modal } from '../../components/Modal';

function buildProfileSchema(isFirstLogin: boolean) {
  return z.object({
    phone: isFirstLogin
      ? z.string().trim().min(1, 'Phone is required')
      : z.string().optional().or(z.literal('')),
    email: isFirstLogin
      ? z.string().trim().email('Enter a valid email')
      : z.string().trim().email('Enter a valid email').optional().or(z.literal('')),
    dateOfBirth: isFirstLogin
      ? z.string().min(1, 'Date of birth is required')
      : z.string().optional(),
    fathersName: isFirstLogin
      ? z.string().trim().min(1, "Father's name is required")
      : z.string().optional().or(z.literal('')),
    mothersName: isFirstLogin
      ? z.string().trim().min(1, "Mother's name is required")
      : z.string().optional().or(z.literal('')),
    presentAddress: z.string().optional().or(z.literal('')),
  });
}

type FormData = z.infer<ReturnType<typeof buildProfileSchema>>;
type StudentVerifiedFieldKey =
  | 'fullName'
  | 'email'
  | 'dateOfBirth'
  | 'fathersName'
  | 'mothersName'
  | 'guardianPhone'
  | 'permanentAddress'
  | 'gender'
  | 'photo';

const studentVerifiedFieldOptions: {
  key: StudentVerifiedFieldKey;
  label: string;
  kind: 'text' | 'email' | 'date' | 'textarea' | 'select' | 'photo';
}[] = [
  { key: 'fullName', label: 'Full Name', kind: 'text' },
  { key: 'email', label: 'Email', kind: 'email' },
  { key: 'dateOfBirth', label: 'Date of Birth', kind: 'date' },
  { key: 'fathersName', label: "Father's Name", kind: 'text' },
  { key: 'mothersName', label: "Mother's Name", kind: 'text' },
  { key: 'guardianPhone', label: 'Guardian Phone', kind: 'text' },
  { key: 'permanentAddress', label: 'Permanent Address', kind: 'textarea' },
  { key: 'gender', label: 'Gender', kind: 'select' },
  { key: 'photo', label: 'Requested Photo', kind: 'photo' },
];

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function getApplicationStatusClasses(status: string | null | undefined) {
  if (status === 'approved') return 'bg-emerald-100 text-emerald-700';
  if (status === 'rejected') return 'bg-rose-100 text-rose-700';
  return 'bg-amber-100 text-amber-700';
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Recently';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  return new Intl.DateTimeFormat([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function fieldKeysToLabel(keys: string[]) {
  const labels: Record<string, string> = {
    dateOfBirth: 'Date of Birth',
    fathersName: "Father's Name",
    mothersName: "Mother's Name",
    guardianPhone: 'Guardian Phone',
    permanentAddress: 'Permanent Address',
    profilePhoto: 'Photo',
  };

  return keys
    .map((key) =>
      labels[key] ??
        key
          .replace(/([A-Z])/g, ' $1')
          .replace(/^./, (char) => char.toUpperCase()),
    )
    .join(', ');
}

export function StudentProfile() {
  const { user, setUser } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isFirstLogin = Boolean(user?.isFirstLogin);
  const [isEditing, setIsEditing] = useState(isFirstLogin);
  const [showApplicationModal, setShowApplicationModal] = useState(false);
  const [applicationDraft, setApplicationDraft] = useState({
    fullName: '',
    email: '',
    dateOfBirth: '',
    fathersName: '',
    mothersName: '',
    guardianPhone: '',
    permanentAddress: '',
    gender: '',
  });
  const [applicationPhoto, setApplicationPhoto] = useState<File | null>(null);
  const [selectedApplicationFields, setSelectedApplicationFields] = useState<
    StudentVerifiedFieldKey[]
  >([]);

  const profileSchema = useMemo(() => buildProfileSchema(isFirstLogin), [isFirstLogin]);

  const { data: profile, isLoading: isProfileLoading } = useQuery({
    queryKey: ['student-profile'],
    queryFn: () => api.get('/users/profile').then((response) => response.data),
  });
  const { data: courses = [] } = useQuery({
    queryKey: ['student-profile-courses'],
    queryFn: () => api.get('/courses/my').then((response) => response.data),
  });
  const { data: unreadCountData } = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: () => api.get('/notifications/unread-count').then((response) => response.data),
  });
  const { data: applications = [] } = useQuery({
    queryKey: ['my-profile-change-applications'],
    queryFn: () =>
      api.get('/users/profile-change-applications').then((response) => response.data),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      phone: '',
      email: '',
      dateOfBirth: '',
      fathersName: '',
      mothersName: '',
      presentAddress: '',
    },
  });

  useEffect(() => {
    const source = (profile ?? user?.profile ?? {}) as any;

    reset({
      phone: source.phone ?? '',
      email: source.email ?? '',
      dateOfBirth: source.dateOfBirth ? String(source.dateOfBirth).slice(0, 10) : '',
      fathersName: source.fathersName ?? '',
      mothersName: source.mothersName ?? '',
      presentAddress: source.presentAddress ?? '',
    });
  }, [profile, reset, user?.profile]);

  const syncProfileStore = async (nextIsFirstLogin = false) => {
    const response = await api.get('/users/profile');
    if (!user) return response.data;
    setUser({
      ...user,
      isFirstLogin: nextIsFirstLogin ? false : user.isFirstLogin,
      profile: response.data,
    });
    return response.data;
  };

  const updateMutation = useMutation({
    mutationFn: (values: FormData) => api.patch('/users/profile', values),
    onError: (error: any) =>
      toast.error(error.response?.data?.message ?? 'Failed to save profile'),
  });

  const applicationMutation = useMutation({
    mutationFn: async () => {
      const body = new FormData();
      if (selectedApplicationFields.includes('fullName') && applicationDraft.fullName.trim()) {
        body.append('fullName', applicationDraft.fullName.trim());
      }
      if (selectedApplicationFields.includes('email') && applicationDraft.email.trim()) {
        body.append('email', applicationDraft.email.trim());
      }
      if (selectedApplicationFields.includes('dateOfBirth') && applicationDraft.dateOfBirth) {
        body.append('dateOfBirth', applicationDraft.dateOfBirth);
      }
      if (selectedApplicationFields.includes('fathersName') && applicationDraft.fathersName.trim()) {
        body.append('fathersName', applicationDraft.fathersName.trim());
      }
      if (selectedApplicationFields.includes('mothersName') && applicationDraft.mothersName.trim()) {
        body.append('mothersName', applicationDraft.mothersName.trim());
      }
      if (selectedApplicationFields.includes('guardianPhone') && applicationDraft.guardianPhone.trim()) {
        body.append('guardianPhone', applicationDraft.guardianPhone.trim());
      }
      if (
        selectedApplicationFields.includes('permanentAddress') &&
        applicationDraft.permanentAddress.trim()
      ) {
        body.append('permanentAddress', applicationDraft.permanentAddress.trim());
      }
      if (selectedApplicationFields.includes('gender') && applicationDraft.gender.trim()) {
        body.append('gender', applicationDraft.gender.trim());
      }
      if (selectedApplicationFields.includes('photo') && applicationPhoto) {
        body.append('photo', applicationPhoto);
      }
      return api.post('/users/profile-change-applications', body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      toast.success('Application submitted to office');
      setShowApplicationModal(false);
      setApplicationPhoto(null);
      setSelectedApplicationFields([]);
      queryClient.invalidateQueries({ queryKey: ['my-profile-change-applications'] });
    },
    onError: (error: any) =>
      toast.error(error.response?.data?.message ?? 'Failed to submit application'),
  });

  const onSubmit = async (values: FormData) => {
    await updateMutation.mutateAsync(values);
    if (isFirstLogin) {
      try {
        await api.post('/auth/first-login-done');
      } catch {
        // Keep profile changes even if this non-critical call fails.
      }
    }

    await syncProfileStore(isFirstLogin);
    queryClient.invalidateQueries({ queryKey: ['student-profile'] });
    toast.success(isFirstLogin ? 'Profile completed successfully.' : 'Profile updated.');
    setIsEditing(false);

    if (isFirstLogin) {
      navigate('/student');
    }
  };

  const openApplicationModal = () => {
    const source = (profile ?? user?.profile ?? {}) as any;
    setApplicationDraft({
      fullName: source.fullName ?? '',
      email: source.email ?? '',
      dateOfBirth: source.dateOfBirth ? String(source.dateOfBirth).slice(0, 10) : '',
      fathersName: source.fathersName ?? '',
      mothersName: source.mothersName ?? '',
      guardianPhone: source.guardianPhone ?? '',
      permanentAddress: source.permanentAddress ?? '',
      gender: source.gender ?? '',
    });
    setApplicationPhoto(null);
    setSelectedApplicationFields([]);
    setShowApplicationModal(true);
  };

  const currentProfile = (profile ?? user?.profile ?? {}) as any;
  const requestFieldKeys = useMemo(
    () =>
      Object.keys((applications as any[])[0]?.requestedData ?? {}).filter(Boolean),
    [applications],
  );
  const readinessItems = useMemo(
    () => [
      { label: 'Phone', done: Boolean(currentProfile.phone) },
      { label: 'Email', done: Boolean(currentProfile.email) },
      { label: "Father's Name", done: Boolean(currentProfile.fathersName) },
      { label: "Mother's Name", done: Boolean(currentProfile.mothersName) },
      { label: 'Date of Birth', done: Boolean(currentProfile.dateOfBirth) },
    ],
    [
      currentProfile.dateOfBirth,
      currentProfile.email,
      currentProfile.fathersName,
      currentProfile.mothersName,
      currentProfile.phone,
    ],
  );
  const completionCount = readinessItems.filter((item) => item.done).length;

  const toggleApplicationField = (fieldKey: StudentVerifiedFieldKey) => {
    setSelectedApplicationFields((current) =>
      current.includes(fieldKey)
        ? current.filter((item) => item !== fieldKey)
        : [...current, fieldKey],
    );
  };

  const submitApplication = () => {
    if (!selectedApplicationFields.length) {
      toast.error('Choose at least one field to change');
      return;
    }

    if (selectedApplicationFields.includes('photo') && !applicationPhoto) {
      toast.error('Choose a photo for the photo change request');
      return;
    }

    applicationMutation.mutate();
  };

  const renderEditableForm = () => (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {isFirstLogin ? (
        <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            Required for first login
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Phone, email, father&apos;s name, mother&apos;s name, and date of birth are required before entering the student workspace.
          </p>
        </div>
      ) : (
        <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
          <p className="text-sm font-semibold text-slate-900">Self-service fields</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            You can update your phone and present address here. Gender, guardian phone, permanent address, and all verified fields are managed through office approval.
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Phone" error={errors.phone?.message}>
          <input {...register('phone')} className={inputClass} />
        </Field>
        {isFirstLogin ? (
          <>
            <Field label="Email" error={errors.email?.message}>
              <input type="email" {...register('email')} className={inputClass} />
            </Field>
            <Field label="Date of Birth" error={errors.dateOfBirth?.message}>
              <input type="date" {...register('dateOfBirth')} className={inputClass} />
            </Field>
            <Field label="Father's Name" error={errors.fathersName?.message}>
              <input {...register('fathersName')} className={inputClass} />
            </Field>
            <Field label="Mother's Name" error={errors.mothersName?.message}>
              <input {...register('mothersName')} className={inputClass} />
            </Field>
          </>
        ) : null}
      </div>

      <div className="grid gap-4">
        <Field label="Present Address" error={errors.presentAddress?.message}>
          <textarea
            {...register('presentAddress')}
            rows={3}
            className={`${inputClass} min-h-28 resize-none`}
          />
        </Field>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save size={16} />
          {isSubmitting ? 'Saving...' : isFirstLogin ? 'Save & Continue' : 'Save changes'}
        </button>
        {!isFirstLogin ? (
          <button
            type="button"
            onClick={() => {
              setIsEditing(false);
              reset({
                phone: currentProfile.phone ?? '',
                email: currentProfile.email ?? '',
                dateOfBirth: currentProfile.dateOfBirth
                  ? String(currentProfile.dateOfBirth).slice(0, 10)
                  : '',
                fathersName: currentProfile.fathersName ?? '',
                mothersName: currentProfile.mothersName ?? '',
                presentAddress: currentProfile.presentAddress ?? '',
              });
            }}
            className="rounded-full border border-slate-200 px-5 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );

  const avatarName =
    currentProfile.fullName ?? user?.username ?? currentProfile.studentId ?? 'Student';

  if (isFirstLogin) {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#edf4ff_42%,#f8fafc_100%)] px-4 py-10">
        <div className="mx-auto max-w-4xl overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_30px_80px_-45px_rgba(15,23,42,0.45)]">
          <div className="bg-[radial-gradient(circle_at_top_left,#0f172a,transparent_40%),linear-gradient(135deg,#082f49_0%,#1d4ed8_55%,#60a5fa_100%)] px-6 py-10 text-white sm:px-10">
            <p className="text-sm font-medium uppercase tracking-[0.28em] text-sky-100/80">
              Welcome
            </p>
            <h1 className="mt-3 text-3xl font-semibold">Complete your profile</h1>
            <p className="mt-2 max-w-2xl text-sm text-sky-100/85">
              Fill in your required details once. Verified fields will be managed by office approval later.
            </p>
          </div>
          <div className="grid gap-8 px-6 py-6 sm:px-10 lg:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.25fr)]">
            <div className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-5">
              <div className="flex items-center gap-4">
                <StudentProfileAvatar
                  name={avatarName}
                  photo={currentProfile.profilePhoto ?? null}
                  size="lg"
                />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                    Student Record
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-900">
                    {currentProfile.fullName || 'Name will appear here'}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Student ID: {currentProfile.studentId ?? user?.username ?? 'N/A'}
                  </p>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                {readinessItems.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3"
                  >
                    <span className="text-sm font-medium text-slate-700">{item.label}</span>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        item.done ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {item.done ? 'Ready' : 'Required'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div>{renderEditableForm()}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="overflow-hidden rounded-[32px] border border-slate-200/70 bg-white shadow-[0_30px_80px_-45px_rgba(15,23,42,0.45)]">
          <div className="bg-[radial-gradient(circle_at_top_left,#0f172a,transparent_40%),linear-gradient(135deg,#082f49_0%,#1d4ed8_55%,#60a5fa_100%)] px-6 py-10 text-white sm:px-10">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex items-center gap-5">
                <div className="rounded-[28px] border border-white/20 bg-white/10 p-1.5 backdrop-blur">
                  <StudentProfileAvatar
                    name={avatarName}
                    photo={currentProfile.profilePhoto ?? null}
                    size="lg"
                  />
                </div>
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.28em] text-sky-100/80">
                    Student Profile
                  </p>
                  <h1 className="mt-3 text-3xl font-semibold">{avatarName}</h1>
                  <p className="mt-2 text-base text-sky-100/85">
                    {currentProfile.studentId ?? user?.username ?? 'Student ID unavailable'}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3 text-sm text-sky-50/90">
                    <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5">
                      Batch {currentProfile.batchYear ?? 'N/A'}
                    </span>
                    <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5">
                      {currentProfile.gender ? `Gender: ${currentProfile.gender}` : 'Gender not set'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setIsEditing((current) => !current)}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/20"
                >
                  <Pencil size={16} />
                  {isEditing ? 'Close editor' : 'Edit self-service fields'}
                </button>
                <button
                  type="button"
                  onClick={openApplicationModal}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-slate-950/40 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-950/55"
                >
                  <ShieldCheck size={16} />
                  Request verified change
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 px-6 py-6 sm:px-10 lg:grid-cols-3">
            {[
              {
                label: 'Enrolled Courses',
                value: (courses as any[]).length,
                note: 'Courses currently visible in your workspace',
              },
              {
                label: 'Unread Notifications',
                value: unreadCountData?.count ?? 0,
                note: 'Updates waiting in your inbox',
              },
              {
                label: 'Profile Completion',
                value: `${completionCount}/${readinessItems.length}`,
                note: 'Required onboarding details completed',
              },
            ].map((item) => (
              <div key={item.label} className="rounded-[26px] border border-slate-200 bg-slate-50/80 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                  {item.label}
                </p>
                <p className="mt-3 text-3xl font-semibold text-slate-900">{item.value}</p>
                <p className="mt-2 text-sm text-slate-500">{item.note}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.95fr)]">
          <section className="rounded-[30px] border border-slate-200/70 bg-white p-6 shadow-[0_24px_80px_-52px_rgba(15,23,42,0.45)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-600">
                  Verified Record
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                  Identity and approved details
                </h2>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
                <LockKeyhole size={14} />
                Office-managed fields
              </span>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <InfoCard icon={<UserRound size={16} />} label="Full Name" value={currentProfile.fullName} />
              <InfoCard icon={<Mail size={16} />} label="Email" value={currentProfile.email} />
              <InfoCard icon={<CalendarDays size={16} />} label="Date of Birth" value={currentProfile.dateOfBirth ? String(currentProfile.dateOfBirth).slice(0, 10) : null} />
              <InfoCard icon={<UserRound size={16} />} label="Father's Name" value={currentProfile.fathersName} />
              <InfoCard icon={<UserRound size={16} />} label="Mother's Name" value={currentProfile.mothersName} />
              <InfoCard icon={<MapPinned size={16} />} label="Gender" value={currentProfile.gender} />
              <InfoCard icon={<Phone size={16} />} label="Guardian Phone" value={currentProfile.guardianPhone} />
              <InfoCard icon={<Home size={16} />} label="Permanent Address" value={currentProfile.permanentAddress} />
              <InfoCard icon={<ShieldCheck size={16} />} label="Student ID" value={currentProfile.studentId ?? user?.username ?? null} />
            </div>
          </section>

          <section className="rounded-[30px] border border-slate-200/70 bg-white p-6 shadow-[0_24px_80px_-52px_rgba(15,23,42,0.45)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-600">
                  Self-service
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                  Contact and living info
                </h2>
              </div>
            </div>

            {isEditing ? (
              <div className="mt-6">{renderEditableForm()}</div>
            ) : (
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <InfoCard icon={<Phone size={16} />} label="Phone" value={currentProfile.phone} />
                <InfoCard icon={<Home size={16} />} label="Present Address" value={currentProfile.presentAddress} />
              </div>
            )}
          </section>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.9fr)]">
          <section className="rounded-[30px] border border-slate-200/70 bg-white p-6 shadow-[0_24px_80px_-52px_rgba(15,23,42,0.45)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-600">
                  Applications
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                  Verified change requests
                </h2>
              </div>
            </div>

            {(applications as any[]).length ? (
              <div className="mt-6 space-y-3">
                {(applications as any[]).map((application: any) => (
                  <div
                    key={application.id}
                    className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${getApplicationStatusClasses(
                              application.status,
                            )}`}
                          >
                            {String(application.status ?? 'pending').replace(/^\w/, (char) =>
                              char.toUpperCase(),
                            )}
                          </span>
                          <span className="text-xs font-medium text-slate-400">
                            {formatDateTime(application.createdAt)}
                          </span>
                        </div>
                        <p className="mt-3 text-sm font-semibold text-slate-900">
                          Requested fields:{' '}
                          {fieldKeysToLabel(Object.keys(application.requestedData ?? {}))}
                        </p>
                      </div>
                      <div className="text-sm text-slate-500">
                        {application.reviewedAt
                          ? `Reviewed ${formatDateTime(application.reviewedAt)}`
                          : 'Waiting for office review'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-6 rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-5 py-12 text-center text-sm text-slate-500">
                No verified change requests submitted yet.
              </div>
            )}
          </section>

          <section className="rounded-[30px] border border-slate-200/70 bg-white p-6 shadow-[0_24px_80px_-52px_rgba(15,23,42,0.45)]">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-600">
              Status
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">Profile health</h2>
            {isProfileLoading ? (
              <p className="mt-4 text-sm text-slate-500">Loading profile details...</p>
            ) : (
              <div className="mt-5 space-y-3">
                {readinessItems.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                  >
                    <span className="text-sm font-medium text-slate-700">{item.label}</span>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        item.done ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {item.done ? 'Ready' : 'Needs update'}
                    </span>
                  </div>
                ))}
                {requestFieldKeys.length ? (
                  <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                    Latest request includes: {fieldKeysToLabel(requestFieldKeys)}.
                  </div>
                ) : null}
              </div>
            )}
          </section>
        </div>
      </div>

      <Modal
        open={showApplicationModal}
        onClose={() => setShowApplicationModal(false)}
        title="Request Verified Change"
        maxWidthClass="max-w-3xl"
      >
        <div className="space-y-5">
          <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">Office approval required</p>
            <p className="mt-2 leading-6">
              Add only the verified fields you want to correct. Office will review and apply the approved changes after verification.
            </p>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Choose fields to include
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {studentVerifiedFieldOptions.map((field) => {
                const active = selectedApplicationFields.includes(field.key);
                return (
                  <button
                    key={field.key}
                    type="button"
                    onClick={() => toggleApplicationField(field.key)}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                      active
                        ? 'bg-slate-900 text-white'
                        : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {active ? `Remove ${field.label}` : `Add ${field.label}`}
                  </button>
                );
              })}
            </div>
          </div>

          {selectedApplicationFields.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {selectedApplicationFields.includes('fullName') ? (
                <Field label="Full Name">
                  <input
                    value={applicationDraft.fullName}
                    onChange={(event) =>
                      setApplicationDraft((current) => ({
                        ...current,
                        fullName: event.target.value,
                      }))
                    }
                    className={inputClass}
                  />
                </Field>
              ) : null}
              {selectedApplicationFields.includes('email') ? (
                <Field label="Email">
                  <input
                    type="email"
                    value={applicationDraft.email}
                    onChange={(event) =>
                      setApplicationDraft((current) => ({
                        ...current,
                        email: event.target.value,
                      }))
                    }
                    className={inputClass}
                  />
                </Field>
              ) : null}
              {selectedApplicationFields.includes('dateOfBirth') ? (
                <Field label="Date of Birth">
                  <input
                    type="date"
                    value={applicationDraft.dateOfBirth}
                    onChange={(event) =>
                      setApplicationDraft((current) => ({
                        ...current,
                        dateOfBirth: event.target.value,
                      }))
                    }
                    className={inputClass}
                  />
                </Field>
              ) : null}
              {selectedApplicationFields.includes('fathersName') ? (
                <Field label="Father's Name">
                  <input
                    value={applicationDraft.fathersName}
                    onChange={(event) =>
                      setApplicationDraft((current) => ({
                        ...current,
                        fathersName: event.target.value,
                      }))
                    }
                    className={inputClass}
                  />
                </Field>
              ) : null}
              {selectedApplicationFields.includes('mothersName') ? (
                <Field label="Mother's Name">
                  <input
                    value={applicationDraft.mothersName}
                    onChange={(event) =>
                      setApplicationDraft((current) => ({
                        ...current,
                        mothersName: event.target.value,
                      }))
                    }
                    className={inputClass}
                  />
                </Field>
              ) : null}
              {selectedApplicationFields.includes('guardianPhone') ? (
                <Field label="Guardian Phone">
                  <input
                    value={applicationDraft.guardianPhone}
                    onChange={(event) =>
                      setApplicationDraft((current) => ({
                        ...current,
                        guardianPhone: event.target.value,
                      }))
                    }
                    className={inputClass}
                  />
                </Field>
              ) : null}
              {selectedApplicationFields.includes('permanentAddress') ? (
                <Field label="Permanent Address">
                  <textarea
                    value={applicationDraft.permanentAddress}
                    onChange={(event) =>
                      setApplicationDraft((current) => ({
                        ...current,
                        permanentAddress: event.target.value,
                      }))
                    }
                    rows={3}
                    className={`${inputClass} min-h-28 resize-none`}
                  />
                </Field>
              ) : null}
              {selectedApplicationFields.includes('gender') ? (
                <Field label="Gender">
                  <select
                    value={applicationDraft.gender}
                    onChange={(event) =>
                      setApplicationDraft((current) => ({
                        ...current,
                        gender: event.target.value,
                      }))
                    }
                    className={inputClass}
                  >
                    <option value="">Select gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </Field>
              ) : null}
              {selectedApplicationFields.includes('photo') ? (
                <Field label="Requested Photo">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setApplicationPhoto(event.target.files?.[0] ?? null)
                    }
                    className={inputClass}
                  />
                  {applicationPhoto ? (
                    <p className="mt-2 text-xs text-slate-500">{applicationPhoto.name}</p>
                  ) : null}
                </Field>
              ) : null}
            </div>
          ) : (
            <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
              Select one or more verified fields to start this request.
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowApplicationModal(false)}
              className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitApplication}
              disabled={!selectedApplicationFields.length || applicationMutation.isPending}
              className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {applicationMutation.isPending ? 'Submitting...' : 'Submit application'}
            </button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}

function StudentProfileAvatar({
  name,
  photo,
  size = 'md',
}: {
  name: string;
  photo?: string | null;
  size?: 'md' | 'lg';
}) {
  const classes =
    size === 'lg'
      ? 'h-16 w-16 rounded-2xl text-lg'
      : 'h-12 w-12 rounded-2xl text-sm';

  return (
    <div
      className={`flex ${classes} items-center justify-center overflow-hidden bg-slate-900 font-semibold text-white shadow-sm`}
    >
      {photo ? (
        <SafeImage
          src={photo}
          alt={name}
          className="h-full w-full object-cover"
          fallback={getInitials(name || 'Student')}
        />
      ) : (
        getInitials(name || 'Student')
      )}
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
        {label}
      </span>
      {children}
      {error ? <p className="mt-1.5 text-xs text-rose-500">{error}</p> : null}
    </label>
  );
}

function InfoCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value?: string | null;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
      <div className="flex items-center gap-2 text-slate-500">
        {icon}
        <p className="text-xs font-semibold uppercase tracking-[0.18em]">{label}</p>
      </div>
      <p className="mt-3 text-sm font-medium text-slate-900">
        {value && String(value).trim() ? String(value) : 'Not provided'}
      </p>
    </div>
  );
}

const inputClass =
  'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white disabled:cursor-not-allowed disabled:opacity-70';
