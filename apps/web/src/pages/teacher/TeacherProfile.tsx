import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Camera, Mail, Pencil, Phone, Save, ShieldCheck, UserRound } from 'lucide-react';
import { AppShell } from '../../components/AppShell';
import { api } from '../../lib/api';
import { useAuthStore } from '../../store/auth.store';
import { TeacherAvatar } from './teacher.shared';

const schema = z.object({
  fullName: z.string().min(2, 'Full name is required'),
  email: z.string().email('Enter a valid email'),
  phone: z.string().min(6, 'Phone number is required'),
  gender: z.enum(['male', 'female', 'other']).optional(),
});

type TeacherProfileFormValues = z.infer<typeof schema>;

export function TeacherProfile() {
  const { user, setUser } = useAuthStore();
  const [isEditing, setIsEditing] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['teacher-profile'],
    queryFn: () => api.get('/users/profile').then((response) => response.data),
  });
  const { data: courses = [] } = useQuery({
    queryKey: ['my-courses'],
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
  } = useForm<TeacherProfileFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: '',
      email: '',
      phone: '',
      gender: 'male',
    },
  });

  useEffect(() => {
    const currentProfile = (profile ?? user?.profile ?? {}) as any;
    reset({
      fullName: currentProfile.fullName ?? '',
      email: currentProfile.email ?? '',
      phone: currentProfile.phone ?? '',
      gender: currentProfile.gender ?? 'male',
    });
    if (!photoFile) {
      setPhotoPreview(currentProfile.profilePhoto ?? null);
    }
  }, [photoFile, profile, reset, user?.profile]);

  const updateProfileMutation = useMutation({
    mutationFn: (values: TeacherProfileFormValues) => api.patch('/users/profile', values),
    onError: (error: any) =>
      toast.error(error.response?.data?.message ?? 'Failed to update profile'),
  });

  const uploadPhotoMutation = useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append('photo', file);
      return api.post('/users/profile/photo', body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onError: (error: any) =>
      toast.error(error.response?.data?.message ?? 'Failed to upload photo'),
  });

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const syncProfileStore = async () => {
    const response = await api.get('/users/profile');
    if (!user) return response.data;
    setUser({
      ...user,
      profile: response.data,
    });
    return response.data;
  };

  const onSubmit = async (values: TeacherProfileFormValues) => {
    await updateProfileMutation.mutateAsync(values);
    if (photoFile) {
      await uploadPhotoMutation.mutateAsync(photoFile);
    }

    const freshProfile = await syncProfileStore();
    setPhotoFile(null);
    setPhotoPreview(freshProfile?.profilePhoto ?? null);
    setIsEditing(false);
    toast.success('Profile updated successfully');
  };

  const currentProfile = (profile ?? user?.profile ?? {}) as any;
  const totalScheduleSlots = (courses as any[]).reduce(
    (count, course: any) => count + (Array.isArray(course?.schedules) ? course.schedules.length : 0),
    0,
  );

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="overflow-hidden rounded-[32px] border border-slate-200/70 bg-white shadow-[0_30px_80px_-45px_rgba(15,23,42,0.45)]">
          <div className="bg-[radial-gradient(circle_at_top_left,#0f172a,transparent_40%),linear-gradient(135deg,#082f49_0%,#1d4ed8_55%,#60a5fa_100%)] px-6 py-10 text-white sm:px-10">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex items-center gap-5">
                <div className="rounded-[28px] border border-white/20 bg-white/10 p-1.5 backdrop-blur">
                  <TeacherAvatar teacher={{ ...currentProfile, profilePhoto: photoPreview ?? currentProfile.profilePhoto }} size="lg" />
                </div>
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.28em] text-sky-100/80">
                    Faculty Profile
                  </p>
                  <h1 className="mt-3 text-3xl font-semibold">
                    {currentProfile.fullName ?? user?.username ?? 'Teacher'}
                  </h1>
                  <p className="mt-2 text-base text-sky-100/85">
                    {currentProfile.designation ?? 'Faculty member'} · {currentProfile.department ?? 'Department not set'}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3 text-sm text-sky-50/90">
                    <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5">
                      Teacher ID: {currentProfile.teacherId ?? user?.username ?? 'N/A'}
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
              { label: 'Assigned Courses', value: (courses as any[]).length, note: 'Currently active teaching load' },
              { label: 'Unread Notifications', value: unreadCountData?.count ?? 0, note: 'Updates waiting in your inbox' },
              { label: 'Weekly Schedule Slots', value: totalScheduleSlots, note: 'Recurring lab slots across courses' },
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
                  Professional Details
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">Identity and contact</h2>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
                <ShieldCheck size={14} />
                Verified faculty record
              </span>
            </div>

            {isEditing ? (
              <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-5">
                <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4">
                      <TeacherAvatar teacher={{ ...currentProfile, profilePhoto: photoPreview }} size="lg" />
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Profile photo</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Used in the top navigation, course cards, and class directory.
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
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
                    />
                  </Field>
                  <Field label="Email" error={errors.email?.message}>
                    <input
                      type="email"
                      {...register('email')}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
                    />
                  </Field>
                  <Field label="Phone" error={errors.phone?.message}>
                    <input
                      {...register('phone')}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
                    />
                  </Field>
                  <Field label="Gender" error={errors.gender?.message}>
                    <select
                      {...register('gender')}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
                    >
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </Field>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Save size={16} />
                    {isSubmitting ? 'Saving...' : 'Save profile'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setPhotoFile(null);
                      setPhotoPreview(currentProfile.profilePhoto ?? null);
                      reset({
                        fullName: currentProfile.fullName ?? '',
                        email: currentProfile.email ?? '',
                        phone: currentProfile.phone ?? '',
                        gender: currentProfile.gender ?? 'male',
                      });
                    }}
                    className="rounded-full border border-slate-200 px-5 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <InfoCard icon={<UserRound size={16} />} label="Full Name" value={currentProfile.fullName} />
                <InfoCard icon={<Mail size={16} />} label="Email" value={currentProfile.email} />
                <InfoCard icon={<Phone size={16} />} label="Phone" value={currentProfile.phone} />
                <InfoCard icon={<ShieldCheck size={16} />} label="Designation" value={currentProfile.designation} />
                <InfoCard icon={<ShieldCheck size={16} />} label="Department" value={currentProfile.department} />
                <InfoCard icon={<ShieldCheck size={16} />} label="Gender" value={currentProfile.gender} />
              </div>
            )}
          </section>

          <section className="space-y-6">
            <div className="rounded-[30px] border border-slate-200/70 bg-white p-6 shadow-[0_24px_80px_-52px_rgba(15,23,42,0.45)]">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-600">
                Teaching Snapshot
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">What students see</h2>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                Your profile photo and contact details are reused across teacher navigation, course cards, and faculty information blocks.
              </p>

              <div className="mt-6 rounded-[28px] bg-slate-900 p-5 text-white">
                <div className="flex items-center gap-4">
                  <TeacherAvatar teacher={{ ...currentProfile, profilePhoto: photoPreview ?? currentProfile.profilePhoto }} size="lg" />
                  <div>
                    <p className="text-lg font-semibold">
                      {currentProfile.fullName ?? user?.username ?? 'Teacher'}
                    </p>
                    <p className="text-sm text-slate-300">
                      {currentProfile.designation ?? 'Faculty member'}
                    </p>
                  </div>
                </div>
                <div className="mt-5 grid gap-3 text-sm text-slate-300">
                  <p>{currentProfile.email || 'Add an email so students can reach you.'}</p>
                  <p>{currentProfile.phone || 'Add a phone number for office coordination.'}</p>
                </div>
              </div>
            </div>

            <div className="rounded-[30px] border border-slate-200/70 bg-white p-6 shadow-[0_24px_80px_-52px_rgba(15,23,42,0.45)]">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-600">
                Status
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">Profile health</h2>
              {isLoading ? (
                <p className="mt-4 text-sm text-slate-500">Loading profile details...</p>
              ) : (
                <div className="mt-5 space-y-3">
                  {[
                    {
                      label: 'Profile photo',
                      done: Boolean(currentProfile.profilePhoto || photoPreview),
                    },
                    {
                      label: 'Contact email',
                      done: Boolean(currentProfile.email),
                    },
                    {
                      label: 'Phone number',
                      done: Boolean(currentProfile.phone),
                    },
                  ].map((item) => (
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
      {error && <p className="mt-2 text-xs text-rose-500">{error}</p>}
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
    <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-4">
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
