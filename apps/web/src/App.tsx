import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';

// Office
import { OfficeDashboard } from './pages/office/OfficeDashboard';
import { ManageTeachers } from './pages/office/ManageTeachers';
import { ManageStudents } from './pages/office/ManageStudents';
import { ManageCourses } from './pages/office/ManageCourses';
import { ManageSemesters } from './pages/office/ManageSemesters';
import { CreateTempJudge } from './pages/office/CreateTempJudge';

// Teacher
import { TeacherDashboard } from './pages/teacher/TeacherDashboard';
import { TeacherCourses } from './pages/teacher/TeacherCourses';
import { AssignmentManage } from './pages/teacher/AssignmentManage';
import { LabTestManage } from './pages/teacher/LabTestManage';
import { LectureSheets } from './pages/teacher/LectureSheets';

// Student
import { StudentDashboard } from './pages/student/StudentDashboard';
import { StudentCourses } from './pages/student/StudentCourses';
import { StudentAssignments } from './pages/student/StudentAssignments';
import { StudentLabTests } from './pages/student/StudentLabTests';
import { StudentProfile } from './pages/student/StudentProfile';

import { useAuthStore } from './store/auth.store';

const KUETOJ_WEB_URL = import.meta.env.VITE_KUETOJ_WEB_URL ?? 'http://localhost:5174';

function redirectToKuetoj(path = '', token?: string) {
  const base = KUETOJ_WEB_URL.replace(/\/$/, '');
  if (token) {
    const params = new URLSearchParams({ token });
    window.location.replace(`${base}/bridge-login?${params.toString()}`);
    return;
  }
  window.location.replace(`${base}${path}`);
}

function RoleRedirect() {
  const { user, token } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'temp_judge' || user.role === 'temp_participant') {
    redirectToKuetoj('', token ?? undefined);
    return null;
  }
  const map: Record<string, string> = {
    office: '/office',
    teacher: '/teacher',
    student: '/student',
  };
  return <Navigate to={map[user.role] ?? '/login'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/unauthorized" element={
        <div className="flex items-center justify-center min-h-screen">
          <p className="text-red-500 text-lg">403 — Not authorised</p>
        </div>
      } />

      {/* Office */}
      <Route element={<ProtectedRoute allowedRoles={['office']} />}>
        <Route path="/office" element={<OfficeDashboard />} />
        <Route path="/office/teachers" element={<ManageTeachers />} />
        <Route path="/office/students" element={<ManageStudents />} />
        <Route path="/office/courses" element={<ManageCourses />} />
        <Route path="/office/semesters" element={<ManageSemesters />} />
        <Route path="/office/temp-judges" element={<CreateTempJudge />} />
      </Route>

      {/* Teacher */}
      <Route element={<ProtectedRoute allowedRoles={['teacher']} />}>
        <Route path="/teacher" element={<TeacherDashboard />} />
        <Route path="/teacher/courses" element={<TeacherCourses />} />
        <Route path="/teacher/assignments" element={<AssignmentManage />} />
        <Route path="/teacher/lab-tests" element={<LabTestManage />} />
        <Route path="/teacher/lecture-sheets" element={<LectureSheets />} />
      </Route>

      {/* Student */}
      <Route element={<ProtectedRoute allowedRoles={['student']} />}>
        <Route path="/student" element={<StudentDashboard />} />
        <Route path="/student/courses" element={<StudentCourses />} />
        <Route path="/student/assignments" element={<StudentAssignments />} />
        <Route path="/student/lab-tests" element={<StudentLabTests />} />
        <Route path="/student/profile" element={<StudentProfile />} />
      </Route>

      <Route path="/judge/*" element={<RoleRedirect />} />
      <Route path="/contest/*" element={<RoleRedirect />} />

      <Route path="/" element={<RoleRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
