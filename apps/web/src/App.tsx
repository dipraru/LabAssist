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
import { StudentNotifications } from './pages/student/StudentNotifications';

// Judge
import { JudgeDashboard } from './pages/judge/JudgeDashboard';
import { ContestCreate } from './pages/judge/ContestCreate';
import { ContestManage } from './pages/judge/ContestManage';
import { ContestStandings as JudgeContestStandings } from './pages/judge/ContestStandings';
import { ContestParticipants } from './pages/judge/ContestParticipants';

// Participant
import { ContestView } from './pages/participant/ContestView';
import { ContestProblem } from './pages/participant/ContestProblem';
import { ContestSubmit } from './pages/participant/ContestSubmit';
import { ParticipantStandings } from './pages/participant/ContestStandings';
import { AskClarification } from './pages/participant/AskClarification';

import { useAuthStore } from './store/auth.store';

function RoleRedirect() {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  const map: Record<string, string> = {
    office: '/office',
    teacher: '/teacher',
    student: '/student',
    temp_judge: '/judge',
    temp_participant: '/contest',
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
        <Route path="/student/notifications" element={<StudentNotifications />} />
      </Route>

      {/* Judge */}
      <Route element={<ProtectedRoute allowedRoles={['temp_judge']} />}>
        <Route path="/judge" element={<JudgeDashboard />} />
        <Route path="/judge/contests/create" element={<ContestCreate />} />
        <Route path="/judge/contests/:id" element={<ContestManage />} />
        <Route path="/judge/contests/:id/standings" element={<JudgeContestStandings />} />
        <Route path="/judge/contests/:id/participants" element={<ContestParticipants />} />
      </Route>

      {/* Participant */}
      <Route element={<ProtectedRoute allowedRoles={['temp_participant']} />}>
        <Route path="/contest/:id" element={<ContestView />} />
        <Route path="/contest/:id/problems/:problemId" element={<ContestProblem />} />
        <Route path="/contest/:id/submit" element={<ContestSubmit />} />
        <Route path="/contest/:id/standings" element={<ParticipantStandings />} />
        <Route path="/contest/:id/clarifications" element={<AskClarification />} />
      </Route>

      <Route path="/" element={<RoleRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
