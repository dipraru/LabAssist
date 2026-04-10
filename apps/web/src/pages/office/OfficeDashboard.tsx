import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { Users, BookOpen, FlaskConical, GraduationCap, ChevronRight, LayoutDashboard } from 'lucide-react';

function StatCard({
  label,
  value,
  icon: Icon,
  accentClass,
  iconBg,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  accentClass: string;
  iconBg: string;
}) {
  return (
    <div className="relative bg-white rounded-2xl p-6 shadow-sm ring-1 ring-black/5 overflow-hidden group hover:shadow-md transition-all duration-200">
      <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl ${accentClass}`} />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">{label}</p>
          <p className="text-4xl font-bold text-slate-900 tabular-nums">{value}</p>
        </div>
        <div className={`${iconBg} p-3 rounded-xl`}>
          <Icon size={20} className="opacity-80" />
        </div>
      </div>
    </div>
  );
}

const quickActions = [
  { label: 'Create Teacher', href: '/office/teachers', desc: 'Add faculty member' },
  { label: 'Bulk Create Students', href: '/office/students', desc: 'Import via CSV' },
  { label: 'Create Course', href: '/office/courses', desc: 'New course entry' },
  { label: 'Add Semester', href: '/office/semesters', desc: 'Open a new term' },
  { label: 'Create Temp Judge', href: '/office/judges', desc: 'Temporary evaluator access' },
];

export function OfficeDashboard() {
  const { data: stats } = useQuery({
    queryKey: ['office-stats'],
    queryFn: () => api.get('/office/dashboard').then(r => r.data),
  });

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <AppShell>
      <div className="min-h-screen bg-slate-50">
        {/* Page Header */}
        <div className="bg-white border-b border-slate-200 px-8 py-6 mb-8">
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-indigo-50 rounded-xl">
              <LayoutDashboard size={18} className="text-indigo-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Office Dashboard</h1>
              <p className="text-xs text-slate-400 mt-0.5">{today}</p>
            </div>
          </div>
        </div>

        <div className="px-8 pb-10 space-y-8">
          {/* Stats Grid */}
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">Department Overview</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="Teachers"
                value={stats?.teacherCount ?? 0}
                icon={Users}
                accentClass="bg-blue-500"
                iconBg="bg-blue-50 text-blue-600"
              />
              <StatCard
                label="Students"
                value={stats?.studentCount ?? 0}
                icon={GraduationCap}
                accentClass="bg-emerald-500"
                iconBg="bg-emerald-50 text-emerald-600"
              />
              <StatCard
                label="Courses"
                value={stats?.courseCount ?? 0}
                icon={BookOpen}
                accentClass="bg-violet-500"
                iconBg="bg-violet-50 text-violet-600"
              />
              <StatCard
                label="Active Lab Tests"
                value={stats?.activeLabTestCount ?? 0}
                icon={FlaskConical}
                accentClass="bg-amber-500"
                iconBg="bg-amber-50 text-amber-600"
              />
            </div>
          </div>

          {/* Quick Actions */}
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">Quick Actions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {quickActions.map(item => (
                <a
                  key={item.href}
                  href={item.href}
                  className="group flex items-center justify-between bg-white rounded-xl px-5 py-4 shadow-sm ring-1 ring-black/5 hover:shadow-md hover:ring-indigo-200 transition-all duration-200"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-800 group-hover:text-indigo-700 transition-colors">{item.label}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{item.desc}</p>
                  </div>
                  <ChevronRight size={16} className="text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-all" />
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
