import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  CalendarDays,
  Camera,
  Home,
  Mail,
  MapPinned,
  Pencil,
  Phone,
  Save,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuthStore } from '../../store/auth.store';
import { AppShell } from '../../components/AppShell';

const schema = z.object({
  fullName: z.string().min(2, 'Full name required'),
  phone: z.string().min(6).optional().or(z.literal('')),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  dateOfBirth: z.string().optional(),
  fathersName: z.string().optional(),
  mothersName: z.string().optional(),
  presentAddress: z.string().optional(),
  permanentAddress: z.string().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
});

type FormData = z.infer<typeof schema>;

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export function StudentProfile() {
  const { user, setUser } = useAuthStore();
  const navigate = useNavigate();
  const isFirstLogin = Boolean(user?.isFirstLogin);
  const [isEditing, setIsEditing] = useState(isFirstLogin);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(
    (user?.profile as any)?.profilePhoto ?? null,
  );

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

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: '',
      phone: '',
      email: '',
      dateOfBirth: '',
      fathersName: '',
      mothersName: '',
      presentAddress: '',
      permanentAddress: '',
      gender: 'male',
    },
  });

  useEffect(() => {
    const src = (profile ?? user?.profile ?? {}) as any;
    if (!src) return;

    reset({
      fullName: src.fullName ?? '',
      phone: src.phone ?? '',
      email: src.email ?? '',
      dateOfBirth: src.dateOfBirth ? String(src.dateOfBirth).slice(0, 10) : '',
      fathersName: src.fathersName ?? '',
      mothersName: src.mothersName ?? '',
      presentAddress: src.presentAddress ?? '',
      permanentAddress: src.permanentAddress ?? '',
      gender: src.gender ?? 'male',
    });

    if (!photoFile) {
      setPhotoPreview(src.profilePhoto ?? null);
    }
  }, [photoFile, profile, reset, user?.profile]);

  const updateMutation = useMutation({
    mutationFn: (values: FormData) => api.patch('/users/profile', values),
    onError: (error: any) =>
      toast.error(error.response?.data?.message ?? 'Failed to save profile'),
  });

  const photoMutation = useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append('photo', file);
      return api.post('/users/profile/photo', body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onError: (error: any) =>
      toast.error(error.response?.data?.message ?? 'Photo upload failed'),
  });

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const onSubmit = async (values: FormData) => {
    await updateMutation.mutateAsync(values);
    if (photoFile) {
      await photoMutation.mutateAsync(photoFile);
    }
    if (isFirstLogin) {
      try {
        await api.post('/auth/first-login-done');
      } catch {
        // non-blocking: profile updates should still be preserved
      }
    }

    try {
      const response = await api.get('/users/profile');
      if (user) {
        setUser({
          ...user,
          isFirstLogin: false,
          profile: response.data,
        });
      }
    } catch {
      // avoid blocking user on profile refresh failures
    }

    toast.success(
      isFirstLogin
        ? 'Profile saved! Welcome to LabAssist.'
        : 'Profile updated successfully.',
    );
    setPhotoFile(null);
    setIsEditing(false);
    if (isFirstLogin) {
      navigate('/student');
    }
  };

  const currentProfile = (profile ?? user?.profile ?? {}) as any;
  const readinessItems = useMemo(
    () => [
      { label: 'Profile photo', done: Boolean(currentProfile.profilePhoto || photoPreview) },
      { label: 'Contact email', done: Boolean(currentProfile.email) },
      { label: 'Phone number', done: Boolean(currentProfile.phone) },
      { label: 'Present address', done: Boolean(currentProfile.presentAddress) },
    ],
    [currentProfile.email, currentProfile.phone, currentProfile.presentAddress, currentProfile.profilePhoto, photoPreview],
  );
  const completionCount = readinessItems.filter((item) => item.done).length;

  const renderProfileForm = () => (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <StudentProfileAvatar
              name={currentProfile.fullName ?? user?.username ?? 'Student'}
              photo={photoPreview ?? currentProfile.profilePhoto ?? null}
              size="lg"
            />
            <div>
              <p className="text-sm font-semibold text-slate-900">Profile photo</p>
              <p className="mt-1 text-xs text-slate-500">
                Used in the top navigation and student workspace cards.
              </p>
            </div>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
            <Camera size={15} />
            Upload new photo
            <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
          </label>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Full Name" error={errors.fullName?.message}>
          <input
            {...register('fullName')}
            className={inputClass}
          />
        </Field>
        <Field label="Email" error={errors.email?.message}>
          <input
            type="email"
            {...register('email')}
            className={inputClass}
          />
        </Field>
        <Field label="Phone" error={errors.phone?.message}>
          <input
            {...register('phone')}
            className={inputClass}
          />
        </Field>
        <Field label="Gender" error={errors.gender?.message}>
          <select
            {...register('gender')}
            className={inputClass}
          >
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Date of Birth" error={errors.dateOfBirth?.message}>
          <input
            type="date"
            {...register('dateOfBirth')}
            className={inputClass}
          />
        </Field>
        <Field label="Father's Name" error={errors.fathersName?.message}>
          <input
            {...register('fathersName')}
            className={inputClass}
          />
        </Field>
        <Field label="Mother's Name" error={errors.mothersName?.message}>
          <input
            {...register('mothersName')}
            className={inputClass}
          />
        </Field>
      </div>

      <div className="grid gap-4">
        <Field label="Present Address" error={errors.presentAddress?.message}>
          <textarea
            {...register('presentAddress')}
            rows={3}
            className={`${inputClass} min-h-28 resize-none`}
          />
        </Field>
        <Field label="Permanent Address" error={errors.permanentAddress?.message}>
          <textarea
            {...register('permanentAddress')}
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
          {isSubmitting ? 'Saving...' : isFirstLogin ? 'Save & Continue' : 'Save profile'}
        </button>
        {!isFirstLogin ? (
          <button
            type="button"
            onClick={() => {
              setIsEditing(false);
              setPhotoFile(null);
              setPhotoPreview(currentProfile.profilePhoto ?? null);
              reset({
                fullName: currentProfile.fullName ?? '',
                phone: currentProfile.phone ?? '',
                email: currentProfile.email ?? '',
                dateOfBirth: currentProfile.dateOfBirth
                  ? String(currentProfile.dateOfBirth).slice(0, 10)
                  : '',
                fathersName: currentProfile.fathersName ?? '',
                mothersName: currentProfile.mothersName ?? '',
                presentAddress: currentProfile.presentAddress ?? '',
                permanentAddress: currentProfile.permanentAddress ?? '',
                gender: currentProfile.gender ?? 'male',
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

  if (isFirstLogin) {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#edf4ff_42%,#f8fafc_100%)] px-4 py-10">
        <div className="mx-auto max-w-3xl overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_30px_80px_-45px_rgba(15,23,42,0.45)]">
          <div className="bg-[radial-gradient(circle_at_top_left,#0f172a,transparent_40%),linear-gradient(135deg,#082f49_0%,#1d4ed8_55%,#60a5fa_100%)] px-6 py-10 text-white sm:px-10">
            <p className="text-sm font-medium uppercase tracking-[0.28em] text-sky-100/80">
              Welcome
            </p>
            <h1 className="mt-3 text-3xl font-semibold">Complete your profile</h1>
            <p className="mt-2 max-w-2xl text-sm text-sky-100/85">
              Add your details before entering the student workspace so your dashboard, course
              cards, and class information show correctly.
            </p>
          </div>
          <div className="px-6 py-6 sm:px-10">{renderProfileForm()}</div>
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
                    name={currentProfile.fullName ?? user?.username ?? 'Student'}
                    photo={photoPreview ?? currentProfile.profilePhoto ?? null}
                    size="lg"
                  />
                </div>
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.28em] text-sky-100/80">
                    Student Profile
                  </p>
                  <h1 className="mt-3 text-3xl font-semibold">
                    {currentProfile.fullName ?? user?.username ?? 'Student'}
                  </h1>
                  <p className="mt-2 text-base text-sky-100/85">
                    {currentProfile.email || 'Add your email so teachers can reach you.'}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3 text-sm text-sky-50/90">
                    <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5">
                      Student ID: {currentProfile.studentId ?? user?.username ?? 'N/A'}
                    </span>
                    <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5">
                      {currentProfile.gender ? `Gender: ${currentProfile.gender}` : 'Gender not set'}
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsEditing((current) => !current)}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/20"
              >
                <Pencil size={16} />
                {isEditing ? 'Close editor' : 'Edit profile'}
              </button>
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
                value: completionCount,
                note: `${completionCount}/${readinessItems.length} core details are ready`,
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

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)]">
          <section className="rounded-[30px] border border-slate-200/70 bg-white p-6 shadow-[0_24px_80px_-52px_rgba(15,23,42,0.45)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-600">
                  Personal Details
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                  Identity and contact
                </h2>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
                <ShieldCheck size={14} />
                Student workspace profile
              </span>
            </div>

            {isEditing ? (
              <div className="mt-6">{renderProfileForm()}</div>
            ) : (
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <InfoCard icon={<UserRound size={16} />} label="Full Name" value={currentProfile.fullName} />
                <InfoCard icon={<Mail size={16} />} label="Email" value={currentProfile.email} />
                <InfoCard icon={<Phone size={16} />} label="Phone" value={currentProfile.phone} />
                <InfoCard icon={<CalendarDays size={16} />} label="Date of Birth" value={currentProfile.dateOfBirth ? String(currentProfile.dateOfBirth).slice(0, 10) : null} />
                <InfoCard icon={<UserRound size={16} />} label="Father's Name" value={currentProfile.fathersName} />
                <InfoCard icon={<UserRound size={16} />} label="Mother's Name" value={currentProfile.mothersName} />
                <InfoCard icon={<MapPinned size={16} />} label="Gender" value={currentProfile.gender} />
                <InfoCard icon={<Home size={16} />} label="Present Address" value={currentProfile.presentAddress} />
                <InfoCard icon={<Home size={16} />} label="Permanent Address" value={currentProfile.permanentAddress} />
              </div>
            )}
          </section>

          <section className="space-y-6">
            <div className="rounded-[30px] border border-slate-200/70 bg-white p-6 shadow-[0_24px_80px_-52px_rgba(15,23,42,0.45)]">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-600">
                Workspace Snapshot
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">How you appear</h2>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                Your profile photo and contact details are reused across student navigation and
                workspace cards.
              </p>

              <div className="mt-6 rounded-[28px] bg-slate-900 p-5 text-white">
                <div className="flex items-center gap-4">
                  <StudentProfileAvatar
                    name={currentProfile.fullName ?? user?.username ?? 'Student'}
                    photo={photoPreview ?? currentProfile.profilePhoto ?? null}
                    size="lg"
                  />
                  <div>
                    <p className="text-lg font-semibold">
                      {currentProfile.fullName ?? user?.username ?? 'Student'}
                    </p>
                    <p className="text-sm text-slate-300">
                      {currentProfile.studentId ?? user?.username ?? 'Student ID not set'}
                    </p>
                  </div>
                </div>
                <div className="mt-5 grid gap-3 text-sm text-slate-300">
                  <p>{currentProfile.email || 'Add an email to receive class updates.'}</p>
                  <p>{currentProfile.phone || 'Add a phone number for department coordination.'}</p>
                </div>
              </div>
            </div>

            <div className="rounded-[30px] border border-slate-200/70 bg-white p-6 shadow-[0_24px_80px_-52px_rgba(15,23,42,0.45)]">
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
                          item.done
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {item.done ? 'Ready' : 'Needs update'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
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
        <img src={photo} alt={name} className="h-full w-full object-cover" />
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
  'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white';
