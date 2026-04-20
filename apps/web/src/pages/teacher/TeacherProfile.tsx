import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  LockKeyhole,
  Mail,
  Pencil,
  Phone,
  Save,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { AppShell } from '../../components/AppShell';
import { Modal } from '../../components/Modal';
import { api } from '../../lib/api';
import { useAuthStore } from '../../store/auth.store';
import { TeacherAvatar } from './teacher.shared';

const schema = z.object({
  phone: z.string().trim().min(6, 'Phone number is required'),
});

type TeacherProfileFormValues = z.infer<typeof schema>;
type TeacherVerifiedFieldKey = 'fullName' | 'email' | 'gender' | 'photo';

const teacherVerifiedFieldOptions: {
  key: TeacherVerifiedFieldKey;
  label: string;
  kind: 'text' | 'email' | 'select' | 'photo';
}[] = [
  { key: 'fullName', label: 'Full Name', kind: 'text' },
  { key: 'email', label: 'Email', kind: 'email' },
  { key: 'gender', label: 'Gender', kind: 'select' },
  { key: 'photo', label: 'Requested Photo', kind: 'photo' },
];

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

const inputClass =
  'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500';

export function TeacherProfile() {
  const { user, setUser } = useAuthStore();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [showApplicationModal, setShowApplicationModal] = useState(false);
  const [applicationDraft, setApplicationDraft] = useState({
    fullName: '',
    email: '',
    gender: '',
  });
  const [applicationPhoto, setApplicationPhoto] = useState<File | null>(null);
  const [selectedApplicationFields, setSelectedApplicationFields] = useState<
    TeacherVerifiedFieldKey[]
  >([]);

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
  } = useForm<TeacherProfileFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      phone: '',
    },
  });

  useEffect(() => {
    const currentProfile = (profile ?? user?.profile ?? {}) as any;
    reset({
      phone: currentProfile.phone ?? '',
    });
  }, [profile, reset, user?.profile]);

  const syncProfileStore = async () => {
    const response = await api.get('/users/profile');
    if (!user) return response.data;
    setUser({
      ...user,
      profile: response.data,
    });
    return response.data;
  };

  const updateProfileMutation = useMutation({
    mutationFn: (values: TeacherProfileFormValues) => api.patch('/users/profile', values),
    onError: (error: any) =>
      toast.error(error.response?.data?.message ?? 'Failed to update profile'),
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

  const onSubmit = async (values: TeacherProfileFormValues) => {
    await updateProfileMutation.mutateAsync(values);
    await syncProfileStore();
    queryClient.invalidateQueries({ queryKey: ['teacher-profile'] });
    toast.success('Profile updated successfully');
    setIsEditing(false);
  };

  const currentProfile = (profile ?? user?.profile ?? {}) as any;
  const totalScheduleSlots = (courses as any[]).reduce(
    (count, course: any) => count + (Array.isArray(course?.schedules) ? course.schedules.length : 0),
    0,
  );

  const openApplicationModal = () => {
    setApplicationDraft({
      fullName: currentProfile.fullName ?? '',
      email: currentProfile.email ?? '',
      gender: currentProfile.gender ?? '',
    });
    setApplicationPhoto(null);
    setSelectedApplicationFields([]);
    setShowApplicationModal(true);
  };

  const latestRequestFieldKeys = useMemo(
    () => Object.keys((applications as any[])[0]?.requestedData ?? {}).filter(Boolean),
    [applications],
  );

  const statusItems = useMemo(
    () => [
      {
        label: 'Profile photo',
        done: Boolean(currentProfile.profilePhoto),
      },
      {
        label: 'Verified email',
        done: Boolean(currentProfile.email),
      },
      {
        label: 'Verified gender',
        done: Boolean(currentProfile.gender),
      },
      {
        label: 'Phone number',
        done: Boolean(currentProfile.phone),
      },
      {
        label: 'Office change request',
        done: Boolean((applications as any[]).some((item) => item.status === 'pending')),
        doneLabel: 'Pending',
        emptyLabel: 'None open',
      },
    ],
    [applications, currentProfile.email, currentProfile.gender, currentProfile.phone, currentProfile.profilePhoto],
  );

  const toggleApplicationField = (fieldKey: TeacherVerifiedFieldKey) => {
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

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="overflow-hidden rounded-[32px] border border-slate-200/70 bg-white shadow-[0_30px_80px_-45px_rgba(15,23,42,0.45)]">
          <div className="bg-[radial-gradient(circle_at_top_left,#0f172a,transparent_40%),linear-gradient(135deg,#082f49_0%,#1d4ed8_55%,#60a5fa_100%)] px-6 py-10 text-white sm:px-10">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex items-center gap-5">
                <div className="rounded-[28px] border border-white/20 bg-white/10 p-1.5 backdrop-blur">
                  <TeacherAvatar teacher={currentProfile} size="lg" />
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
                label: 'Assigned Courses',
                value: (courses as any[]).length,
                note: 'Courses currently active in your teaching workspace',
              },
              {
                label: 'Unread Notifications',
                value: unreadCountData?.count ?? 0,
                note: 'Updates waiting in your inbox',
              },
              {
                label: 'Weekly Schedule Slots',
                value: totalScheduleSlots,
                note: 'Recurring class slots across active courses',
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
                  Identity and office-approved details
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
              <InfoCard icon={<UserRound size={16} />} label="Gender" value={currentProfile.gender} />
              <InfoCard icon={<ShieldCheck size={16} />} label="Teacher ID" value={currentProfile.teacherId ?? user?.username ?? null} />
              <InfoCard icon={<ShieldCheck size={16} />} label="Designation" value={currentProfile.designation} />
              <InfoCard icon={<ShieldCheck size={16} />} label="Department" value={currentProfile.department} />
              <InfoCard icon={<ShieldCheck size={16} />} label="Profile Photo" value={currentProfile.profilePhoto ? 'Uploaded and visible' : 'Request through office'} />
            </div>

            <div className="mt-6 rounded-[24px] border border-slate-200 bg-slate-50/80 p-4 text-sm leading-6 text-slate-600">
              Name, email, gender, and profile photo are protected fields. If any of them needs correction, submit a verified change request so office can review and approve it before the update goes live.
            </div>
          </section>

          <section className="rounded-[30px] border border-slate-200/70 bg-white p-6 shadow-[0_24px_80px_-52px_rgba(15,23,42,0.45)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-600">
                  Self-service
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                  Contact and visibility info
                </h2>
              </div>
            </div>

            {isEditing ? (
              <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-5">
                <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                  <p className="text-sm font-semibold text-slate-900">Editable here</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    You can update your phone number directly. Verified identity fields are locked and routed through office approval.
                  </p>
                </div>

                <div className="grid gap-4">
                  <Field label="Phone" error={errors.phone?.message}>
                    <input {...register('phone')} className={inputClass} />
                  </Field>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Save size={16} />
                    {isSubmitting ? 'Saving...' : 'Save changes'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      reset({
                        phone: currentProfile.phone ?? '',
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
                <InfoCard icon={<Phone size={16} />} label="Phone" value={currentProfile.phone} />
                <InfoCard icon={<ShieldCheck size={16} />} label="Change Requests" value={(applications as any[]).length ? `${(applications as any[]).length} submitted` : 'No requests yet'} />
                <InfoCard icon={<ShieldCheck size={16} />} label="Latest Status" value={(applications as any[])[0]?.status ? String((applications as any[])[0].status).replace(/^\w/, (char) => char.toUpperCase()) : 'No request submitted'} />
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
            {isLoading ? (
              <p className="mt-4 text-sm text-slate-500">Loading profile details...</p>
            ) : (
              <div className="mt-5 space-y-3">
                {statusItems.map((item) => (
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
                      {item.done ? item.doneLabel ?? 'Ready' : item.emptyLabel ?? 'Needs update'}
                    </span>
                  </div>
                ))}
                {latestRequestFieldKeys.length ? (
                  <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                    Latest request includes: {fieldKeysToLabel(latestRequestFieldKeys)}.
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
              Add only the verified fields you want to correct. Office will review and commit the approved changes after verification.
            </p>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Choose fields to include
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {teacherVerifiedFieldOptions.map((field) => {
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
