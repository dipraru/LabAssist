import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { Users, BookOpen, FlaskConical } from 'lucide-react';

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <div className={`bg-white rounded-xl p-5 shadow-sm border border-slate-100`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="text-3xl font-bold text-slate-900 mt-1">{value}</p>
        </div>
        <div className={`${color} p-3 rounded-xl`}>{icon}</div>
      </div>
    </div>
  );
}

export function OfficeDashboard() {
  const { data: stats } = useQuery({
    queryKey: ['office-stats'],
    queryFn: () => api.get('/office/dashboard').then(r => r.data),
  });

  return (
    <AppShell>
      <div>
        <h1 className="text-2xl font-bold text-slate-900 mb-1">Office Dashboard</h1>
        <p className="text-slate-500 text-sm mb-6">Department overview</p>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard label="Teachers" value={stats?.teacherCount ?? 0} icon={<Users size={22} className="text-blue-600" />} color="bg-blue-50" />
          <StatCard label="Students" value={stats?.studentCount ?? 0} icon={<Users size={22} className="text-green-600" />} color="bg-green-50" />
          <StatCard label="Courses" value={stats?.courseCount ?? 0} icon={<BookOpen size={22} className="text-purple-600" />} color="bg-purple-50" />
          <StatCard label="Active Lab Tests" value={stats?.activeLabTestCount ?? 0} icon={<FlaskConical size={22} className="text-orange-600" />} color="bg-orange-50" />
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
          <h2 className="font-semibold text-slate-800 mb-3">Quick Actions</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: 'Create Teacher', href: '/office/teachers' },
              { label: 'Bulk Create Students', href: '/office/students' },
              { label: 'Create Course', href: '/office/courses' },
              { label: 'Add Semester', href: '/office/semesters' },
              { label: 'Create Temp Judge', href: '/office/judges' },
            ].map(item => (
              <a key={item.href} href={item.href}
                className="flex items-center justify-center py-2.5 px-4 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-lg text-sm font-medium text-slate-700 hover:text-indigo-700 transition-colors">
                {item.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
