import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  CheckCircle2,
  Eye,
  FileStack,
  GraduationCap,
  Search,
  ShieldCheck,
  UserRound,
  XCircle,
} from 'lucide-react';
import { AppShell } from '../../components/AppShell';
import { Modal } from '../../components/Modal';
import { api } from '../../lib/api';
import { SafeImage } from '../../lib/media';

function getStatusClasses(status: string | null | undefined) {
  if (status === 'approved') return 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200';
  if (status === 'rejected') return 'bg-rose-100 text-rose-700 ring-1 ring-rose-200';
  return 'bg-amber-100 text-amber-700 ring-1 ring-amber-200';
}

function getRoleClasses(role: string | null | undefined) {
  if (role === 'teacher') return 'bg-red-50 text-red-700 ring-1 ring-red-200';
  return 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200';
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

function toDisplayLabel(key: string) {
  if (key === 'dateOfBirth') return 'Date of Birth';
  if (key === 'fathersName') return "Father's Name";
  if (key === 'mothersName') return "Mother's Name";
  if (key === 'profilePhoto') return 'Profile Photo';
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (char) => char.toUpperCase());
}

function getRequestedFieldKeys(application: any): string[] {
  return Object.keys(application?.requestedData ?? {});
}

function formatValue(key: string, value: unknown) {
  if (!value || !String(value).trim()) return 'Not provided';
  if (key === 'dateOfBirth') {
    const date = new Date(String(value));
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat([], {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(date);
    }
  }
  return String(value);
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export function ApplicationsPage() {
  const queryClient = useQueryClient();
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>(
    'all',
  );

  const { data: applications = [], isLoading } = useQuery({
    queryKey: ['office-profile-change-applications'],
    queryFn: () =>
      api.get('/office/profile-change-applications').then((response) => response.data),
  });

  const { data: selectedApplication, isLoading: isSelectedLoading } = useQuery({
    queryKey: ['office-profile-change-application', selectedApplicationId],
    queryFn: () =>
      api
        .get(`/office/profile-change-applications/${selectedApplicationId}`)
        .then((response) => response.data),
    enabled: Boolean(selectedApplicationId),
  });

  const reviewMutation = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: 'approved' | 'rejected';
    }) =>
      api.patch(`/office/profile-change-applications/${id}/status`, {
        status,
      }),
    onSuccess: (_, variables) => {
      toast.success(
        variables.status === 'approved'
          ? 'Application approved and changes committed'
          : 'Application rejected',
      );
      queryClient.invalidateQueries({ queryKey: ['office-profile-change-applications'] });
      queryClient.invalidateQueries({
        queryKey: ['office-profile-change-application', variables.id],
      });
    },
    onError: (error: any) =>
      toast.error(error.response?.data?.message ?? 'Failed to review application'),
  });

  const counts = useMemo(
    () => ({
      total: (applications as any[]).length,
      pending: (applications as any[]).filter((item) => item.status === 'pending').length,
      approved: (applications as any[]).filter((item) => item.status === 'approved').length,
      rejected: (applications as any[]).filter((item) => item.status === 'rejected').length,
    }),
    [applications],
  );

  const filteredApplications = useMemo(() => {
    const needle = searchText.trim().toLowerCase();
    return (applications as any[]).filter((application) => {
      if (statusFilter !== 'all' && application.status !== statusFilter) {
        return false;
      }

      if (!needle) return true;

      return [
        application.requesterName,
        application.requesterIdentifier,
        application.requesterRole,
        ...getRequestedFieldKeys(application),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [applications, searchText, statusFilter]);

  const activeApplication =
    selectedApplication ??
    (applications as any[]).find((item) => item.id === selectedApplicationId) ??
    null;

  const pendingReviewCount = counts.pending;

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="overflow-hidden rounded-[32px] border border-slate-200/70 bg-white shadow-[0_30px_80px_-45px_rgba(15,23,42,0.45)]">
          <div className="bg-[radial-gradient(circle_at_top_left,#0f172a,transparent_35%),linear-gradient(135deg,#111827_0%,#0f766e_52%,#5eead4_100%)] px-6 py-10 text-white sm:px-10">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.28em] text-teal-100/80">
                  Office Queue
                </p>
                <h1 className="mt-3 text-3xl font-semibold">Profile change applications</h1>
                <p className="mt-2 max-w-2xl text-sm text-teal-50/85">
                  Review sensitive profile corrections from students and teachers, compare current and requested values, then approve or reject with a clear audit trail.
                </p>
              </div>
              <div className="rounded-[26px] border border-white/15 bg-white/10 px-5 py-4 backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-100/75">
                  Pending review
                </p>
                <p className="mt-3 text-4xl font-semibold">{pendingReviewCount}</p>
                <p className="mt-2 text-sm text-teal-50/80">
                  Items waiting for office action right now
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 px-6 py-6 sm:px-10 lg:grid-cols-4">
            {[
              {
                label: 'Total Requests',
                value: counts.total,
                note: 'All submitted profile change applications',
              },
              {
                label: 'Pending',
                value: counts.pending,
                note: 'Waiting for approval or rejection',
              },
              {
                label: 'Approved',
                value: counts.approved,
                note: 'Already committed to profile records',
              },
              {
                label: 'Rejected',
                value: counts.rejected,
                note: 'Reviewed but not accepted',
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

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)]">
          <section className="rounded-[30px] border border-slate-200/70 bg-white p-6 shadow-[0_24px_80px_-52px_rgba(15,23,42,0.45)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-700">
                  Review Queue
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                  Incoming applications
                </h2>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <label className="relative block">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    placeholder="Search by name, ID, role, or field"
                    className="w-full rounded-full border border-slate-200 bg-slate-50 py-2.5 pl-11 pr-4 text-sm text-slate-900 outline-none transition focus:border-teal-400 focus:bg-white sm:w-72"
                  />
                </label>
                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(
                      event.target.value as 'all' | 'pending' | 'approved' | 'rejected',
                    )
                  }
                  className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-700 outline-none transition focus:border-teal-400 focus:bg-white"
                >
                  <option value="all">All statuses</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
            </div>

            {isLoading ? (
              <div className="mt-6 space-y-3">
                {[1, 2, 3].map((item) => (
                  <div
                    key={item}
                    className="h-32 animate-pulse rounded-[26px] bg-slate-100"
                  />
                ))}
              </div>
            ) : filteredApplications.length ? (
              <div className="mt-6 space-y-4">
                {filteredApplications.map((application: any) => {
                  const requestedKeys = getRequestedFieldKeys(application);
                  return (
                    <button
                      key={application.id}
                      type="button"
                      onClick={() => setSelectedApplicationId(application.id)}
                      className="w-full rounded-[28px] border border-slate-200 bg-slate-50/80 p-5 text-left transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white"
                    >
                      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div className="flex min-w-0 items-start gap-4">
                          <RequesterAvatar
                            name={application.requesterName}
                            photo={application.requesterPhoto}
                          />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`rounded-full px-3 py-1 text-xs font-semibold ${getRoleClasses(
                                  application.requesterRole,
                                )}`}
                              >
                                {application.requesterRole === 'teacher' ? 'Teacher' : 'Student'}
                              </span>
                              <span
                                className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(
                                  application.status,
                                )}`}
                              >
                                {String(application.status ?? 'pending').replace(/^\w/, (char) =>
                                  char.toUpperCase(),
                                )}
                              </span>
                            </div>
                            <h3 className="mt-3 text-lg font-semibold text-slate-900">
                              {application.requesterName}
                            </h3>
                            <p className="mt-1 text-sm text-slate-500">
                              {application.requesterIdentifier ?? 'Identifier unavailable'}
                            </p>
                            <p className="mt-3 text-sm font-medium text-slate-700">
                              Requested changes: {requestedKeys.map(toDisplayLabel).join(', ')}
                            </p>
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-col items-start gap-3 text-sm text-slate-500 md:items-end">
                          <span>Submitted {formatDateTime(application.createdAt)}</span>
                          <span>
                            {application.reviewedAt
                              ? `Reviewed ${formatDateTime(application.reviewedAt)}`
                              : 'Waiting for review'}
                          </span>
                          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700">
                            <Eye size={14} />
                            Open review
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-6 rounded-[28px] border border-dashed border-slate-300 bg-slate-50 px-6 py-16 text-center">
                <FileStack className="mx-auto text-slate-300" size={26} />
                <p className="mt-4 text-base font-semibold text-slate-900">
                  No applications match this filter
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  Try a different search term or switch the current status filter.
                </p>
              </div>
            )}
          </section>

          <section className="space-y-6">
            <div className="rounded-[30px] border border-slate-200/70 bg-white p-6 shadow-[0_24px_80px_-52px_rgba(15,23,42,0.45)]">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-700">
                Review Guide
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                What to verify before approval
              </h2>
              <div className="mt-5 space-y-3 text-sm leading-6 text-slate-600">
                <p>Confirm the requester identity using student ID or teacher ID.</p>
                <p>Compare current and requested values carefully for all locked fields.</p>
                <p>Approve only when the requested record should replace the current verified data.</p>
                <p>Reject when the request is incomplete, incorrect, or unsupported.</p>
              </div>
            </div>

            <div className="rounded-[30px] border border-slate-200/70 bg-white p-6 shadow-[0_24px_80px_-52px_rgba(15,23,42,0.45)]">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-700">
                Queue Health
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">Today&apos;s snapshot</h2>
              <div className="mt-5 space-y-3">
                {[
                  {
                    label: 'Pending teacher requests',
                    value: (applications as any[]).filter(
                      (item) => item.requesterRole === 'teacher' && item.status === 'pending',
                    ).length,
                  },
                  {
                    label: 'Pending student requests',
                    value: (applications as any[]).filter(
                      (item) => item.requesterRole === 'student' && item.status === 'pending',
                    ).length,
                  },
                  {
                    label: 'Requests with photo updates',
                    value: (applications as any[]).filter((item) => item.requestedPhoto).length,
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                  >
                    <span className="text-sm font-medium text-slate-700">{item.label}</span>
                    <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>

      <Modal
        open={Boolean(selectedApplicationId)}
        onClose={() => setSelectedApplicationId(null)}
        title="Application Review"
        maxWidthClass="max-w-5xl"
      >
        {activeApplication ? (
          <div className="space-y-6">
            <section className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-5">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex items-start gap-4">
                  <RequesterAvatar
                    name={activeApplication.requesterName}
                    photo={activeApplication.requesterPhoto}
                    size="lg"
                  />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${getRoleClasses(
                          activeApplication.requesterRole,
                        )}`}
                      >
                        {activeApplication.requesterRole === 'teacher' ? 'Teacher' : 'Student'}
                      </span>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(
                          activeApplication.status,
                        )}`}
                      >
                        {String(activeApplication.status ?? 'pending').replace(/^\w/, (char) =>
                          char.toUpperCase(),
                        )}
                      </span>
                    </div>
                    <h3 className="mt-3 text-2xl font-semibold text-slate-900">
                      {activeApplication.requesterName}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {activeApplication.requesterIdentifier ?? 'Identifier unavailable'}
                    </p>
                    <p className="mt-3 text-sm text-slate-600">
                      Submitted {formatDateTime(activeApplication.createdAt)}
                    </p>
                    {activeApplication.reviewedAt ? (
                      <p className="mt-1 text-sm text-slate-600">
                        Reviewed {formatDateTime(activeApplication.reviewedAt)} by{' '}
                        {activeApplication.reviewedByName ?? 'Office'}
                      </p>
                    ) : null}
                  </div>
                </div>

                {activeApplication.status === 'pending' ? (
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={reviewMutation.isPending}
                      onClick={() =>
                        reviewMutation.mutate({
                          id: activeApplication.id,
                          status: 'rejected',
                        })
                      }
                      className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <XCircle size={16} />
                      Reject
                    </button>
                    <button
                      type="button"
                      disabled={reviewMutation.isPending}
                      onClick={() =>
                        reviewMutation.mutate({
                          id: activeApplication.id,
                          status: 'approved',
                        })
                      }
                      className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <CheckCircle2 size={16} />
                      Approve and commit
                    </button>
                  </div>
                ) : (
                  <div className="rounded-[22px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                    This application has already been reviewed.
                  </div>
                )}
              </div>
            </section>

            {isSelectedLoading ? (
              <div className="space-y-3">
                {[1, 2].map((item) => (
                  <div key={item} className="h-36 animate-pulse rounded-[26px] bg-slate-100" />
                ))}
              </div>
            ) : (
              <>
                <section className="rounded-[28px] border border-slate-200 bg-white p-5">
                  <div className="flex items-center gap-3">
                    {activeApplication.requesterRole === 'teacher' ? (
                      <GraduationCap size={18} className="text-red-600" />
                    ) : (
                      <UserRound size={18} className="text-emerald-600" />
                    )}
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                        Requested Changes
                      </p>
                      <h4 className="mt-1 text-xl font-semibold text-slate-900">
                        Current vs requested data
                      </h4>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    {getRequestedFieldKeys(activeApplication)
                      .filter((key) => key !== 'profilePhoto')
                      .map((key) => (
                        <div
                          key={key}
                          className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4"
                        >
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                            {toDisplayLabel(key)}
                          </p>
                          <div className="mt-4 space-y-3">
                            <ComparisonRow
                              label="Current"
                              value={formatValue(key, activeApplication.currentData?.[key])}
                            />
                            <ComparisonRow
                              label="Requested"
                              value={formatValue(key, activeApplication.requestedData?.[key])}
                              emphasize
                            />
                          </div>
                        </div>
                      ))}
                  </div>
                </section>

                {activeApplication.requestedPhoto || activeApplication.requesterPhoto ? (
                  <section className="rounded-[28px] border border-slate-200 bg-white p-5">
                    <div className="flex items-center gap-3">
                      <ShieldCheck size={18} className="text-sky-600" />
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                          Photo Review
                        </p>
                        <h4 className="mt-1 text-xl font-semibold text-slate-900">
                          Current and requested profile photos
                        </h4>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      <PhotoCard
                        title="Current Photo"
                        src={
                          activeApplication.currentData?.profilePhoto ??
                          activeApplication.requesterPhoto
                        }
                      />
                      <PhotoCard
                        title="Requested Photo"
                        src={activeApplication.requestedPhoto}
                      />
                    </div>
                  </section>
                ) : null}
              </>
            )}
          </div>
        ) : (
          <div className="py-10 text-center text-sm text-slate-500">
            Select an application from the queue to review it.
          </div>
        )}
      </Modal>
    </AppShell>
  );
}

function RequesterAvatar({
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
      ? 'h-16 w-16 rounded-[22px] text-lg'
      : 'h-14 w-14 rounded-[20px] text-base';

  return (
    <div
      className={`flex ${classes} items-center justify-center overflow-hidden bg-slate-900 font-semibold text-white`}
    >
      {photo ? (
        <SafeImage
          src={photo}
          alt={name}
          className="h-full w-full object-cover"
          fallback={getInitials(name || 'User')}
        />
      ) : (
        getInitials(name || 'User')
      )}
    </div>
  );
}

function ComparisonRow({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 ${
        emphasize
          ? 'border-sky-200 bg-sky-50 text-sky-950'
          : 'border-slate-200 bg-white text-slate-700'
      }`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-70">{label}</p>
      <p className="mt-2 text-sm font-medium">{value}</p>
    </div>
  );
}

function PhotoCard({
  title,
  src,
}: {
  title: string;
  src?: string | null;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{title}</p>
      <div className="mt-4 overflow-hidden rounded-[22px] border border-slate-200 bg-white">
        {src ? (
          <SafeImage
            src={src}
            alt={title}
            className="aspect-[4/3] w-full object-cover"
            fallback={
              <div className="flex aspect-[4/3] items-center justify-center text-sm text-slate-400">
                No photo provided
              </div>
            }
          />
        ) : (
          <div className="flex aspect-[4/3] items-center justify-center text-sm text-slate-400">
            No photo provided
          </div>
        )}
      </div>
    </div>
  );
}
