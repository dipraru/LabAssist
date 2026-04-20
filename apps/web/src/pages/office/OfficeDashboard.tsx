import { useQuery } from '@tanstack/react-query';
import type { ElementType } from 'react';
import {
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  FlaskConical,
  FolderKanban,
  GraduationCap,
  LayoutDashboard,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { AppShell } from '../../components/AppShell';
import { api } from '../../lib/api';

type DashboardStats = {
  teacherCount: number;
  studentCount: number;
  judgeCount: number;
  batchCount: number;
  activeSemesterCount: number;
  courseCount: number;
  activeLabTestCount: number;
  pendingApplicationCount: number;
};

function MetricCard({
  label,
  value,
  icon: Icon,
  tintClass,
  iconClass,
  note,
}: {
  label: string;
  value: number;
  icon: ElementType;
  tintClass: string;
  iconClass: string;
  note: string;
}) {
  return (
    <div className="rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.45)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
            {label}
          </p>
          <p className="mt-3 text-3xl font-semibold text-slate-900 tabular-nums">{value}</p>
          <p className="mt-2 text-sm text-slate-500">{note}</p>
        </div>
        <div className={`rounded-2xl p-3 ${tintClass}`}>
          <Icon size={18} className={iconClass} />
        </div>
      </div>
    </div>
  );
}

function ActionCard({
  href,
  label,
  description,
  badge,
}: {
  href: string;
  label: string;
  description: string;
  badge: string;
}) {
  return (
    <a
      href={href}
      className="group rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-[0_20px_50px_-44px_rgba(15,23,42,0.45)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_24px_60px_-38px_rgba(15,23,42,0.4)]"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
            {badge}
          </span>
          <h3 className="mt-4 text-lg font-semibold text-slate-900">{label}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
        </div>
        <div className="rounded-full bg-slate-100 p-2 text-slate-400 transition group-hover:bg-slate-900 group-hover:text-white">
          <ArrowRight size={16} />
        </div>
      </div>
    </a>
  );
}

export function OfficeDashboard() {
  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ['office-stats'],
    queryFn: () => api.get('/office/dashboard').then((response) => response.data),
  });

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const metrics = [
    {
      label: 'Teachers',
      value: stats?.teacherCount ?? 0,
      icon: Users,
      tintClass: 'bg-blue-50',
      iconClass: 'text-blue-600',
      note: 'Faculty accounts ready for course assignment',
    },
    {
      label: 'Students',
      value: stats?.studentCount ?? 0,
      icon: GraduationCap,
      tintClass: 'bg-emerald-50',
      iconClass: 'text-emerald-600',
      note: 'Student accounts managed by office',
    },
    {
      label: 'Courses',
      value: stats?.courseCount ?? 0,
      icon: BookOpen,
      tintClass: 'bg-violet-50',
      iconClass: 'text-violet-600',
      note: 'Open course records across active and upcoming terms',
    },
    {
      label: 'Pending Applications',
      value: stats?.pendingApplicationCount ?? 0,
      icon: ClipboardCheck,
      tintClass: 'bg-amber-50',
      iconClass: 'text-amber-600',
      note: 'Profile change requests waiting for office review',
    },
    {
      label: 'Active Lab Tests',
      value: stats?.activeLabTestCount ?? 0,
      icon: FlaskConical,
      tintClass: 'bg-rose-50',
      iconClass: 'text-rose-600',
      note: 'Currently running lab activities',
    },
    {
      label: 'Temp Judges',
      value: stats?.judgeCount ?? 0,
      icon: ShieldCheck,
      tintClass: 'bg-cyan-50',
      iconClass: 'text-cyan-600',
      note: 'Temporary evaluator accounts with controlled access',
    },
  ];

  return (
    <AppShell>
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,#dbeafe_0%,#f8fafc_42%,#f8fafc_100%)] pb-10">
        <div className="px-6 pt-6 sm:px-8">
          <section className="overflow-hidden rounded-[34px] border border-slate-200/80 bg-white shadow-[0_30px_90px_-55px_rgba(15,23,42,0.55)]">
            <div className="bg-[radial-gradient(circle_at_top_left,#1e293b,transparent_30%),linear-gradient(135deg,#0f172a_0%,#0f766e_50%,#67e8f9_100%)] px-6 py-8 text-white sm:px-8 sm:py-10">
              <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
                <div className="max-w-3xl">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-50/90 backdrop-blur">
                    <LayoutDashboard size={14} />
                    Office Control Center
                  </div>
                  <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
                    Keep the academic workflow moving without losing the queue.
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-cyan-50/85 sm:text-base">
                    Review pending applications, manage accounts, and keep sessions, batches, and temporary judge access aligned from one place.
                  </p>
                  <p className="mt-4 text-sm font-medium text-cyan-50/80">{today}</p>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-[26px] border border-white/15 bg-white/10 px-5 py-4 backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100/75">
                      Pending Review
                    </p>
                    <p className="mt-3 text-4xl font-semibold tabular-nums">
                      {stats?.pendingApplicationCount ?? 0}
                    </p>
                    <p className="mt-2 text-sm text-cyan-50/80">
                      Applications waiting for approval
                    </p>
                  </div>
                  <div className="rounded-[26px] border border-white/15 bg-white/10 px-5 py-4 backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100/75">
                      Active Semesters
                    </p>
                    <p className="mt-3 text-4xl font-semibold tabular-nums">
                      {stats?.activeSemesterCount ?? 0}
                    </p>
                    <p className="mt-2 text-sm text-cyan-50/80">
                      Terms currently in motion
                    </p>
                  </div>
                  <div className="rounded-[26px] border border-white/15 bg-white/10 px-5 py-4 backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100/75">
                      Total Batches
                    </p>
                    <p className="mt-3 text-4xl font-semibold tabular-nums">
                      {stats?.batchCount ?? 0}
                    </p>
                    <p className="mt-2 text-sm text-cyan-50/80">
                      Intake groups configured so far
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 px-6 py-6 sm:px-8 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.95fr)]">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {metrics.map((metric) => (
                  <MetricCard key={metric.label} {...metric} />
                ))}
              </div>

              <div className="rounded-[30px] border border-slate-200 bg-slate-50/85 p-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-slate-900 p-2 text-white">
                    <Sparkles size={16} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                      Focus Today
                    </p>
                    <h2 className="mt-1 text-xl font-semibold text-slate-900">
                      Office priorities
                    </h2>
                  </div>
                </div>

                <div className="mt-6 space-y-3">
                  {[
                    {
                      title: 'Review profile changes',
                      value: stats?.pendingApplicationCount ?? 0,
                      tone:
                        (stats?.pendingApplicationCount ?? 0) > 0
                          ? 'bg-amber-50 text-amber-700 ring-amber-200'
                          : 'bg-emerald-50 text-emerald-700 ring-emerald-200',
                      helper:
                        (stats?.pendingApplicationCount ?? 0) > 0
                          ? 'Queue needs attention from office'
                          : 'No pending profile requests right now',
                    },
                    {
                      title: 'Monitor active lab tests',
                      value: stats?.activeLabTestCount ?? 0,
                      tone: 'bg-rose-50 text-rose-700 ring-rose-200',
                      helper: 'Running assessments that may require oversight',
                    },
                    {
                      title: 'Coordinate judge access',
                      value: stats?.judgeCount ?? 0,
                      tone: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
                      helper: 'Temporary evaluator accounts currently managed',
                    },
                  ].map((item) => (
                    <div
                      key={item.title}
                      className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-4"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                        <p className="mt-1 text-xs text-slate-500">{item.helper}</p>
                      </div>
                      <span
                        className={`inline-flex min-w-[3rem] items-center justify-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ${item.tone}`}
                      >
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="mt-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                  Quick Actions
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                  Jump into the next task
                </h2>
              </div>
              <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-500 shadow-sm sm:flex">
                <FolderKanban size={16} />
                Shortcuts tuned for office workflows
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              <ActionCard
                href="/office/applications"
                badge="Queue"
                label="Review profile change applications"
                description="Handle pending profile edits first so identity and account records stay clean."
              />
              <ActionCard
                href="/office/students"
                badge="Accounts"
                label="Manage students"
                description="Filter by batch, onboard new students, and clean up incomplete accounts."
              />
              <ActionCard
                href="/office/courses"
                badge="Courses"
                label="Open or maintain courses"
                description="Create sessional courses, assign instructors, and manage safe course deletions."
              />
              <ActionCard
                href="/office/batches"
                badge="Structure"
                label="Configure batches"
                description="Set up new intakes and remove empty batches that are no longer needed."
              />
              <ActionCard
                href="/office/semesters"
                badge="Terms"
                label="Manage semesters"
                description="Track active terms and keep deletions limited to empty semesters only."
              />
              <ActionCard
                href="/office/temp-judges"
                badge="Access"
                label="Issue temp judge credentials"
                description="Create temporary evaluator access and regenerate credentials directly at download time."
              />
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
