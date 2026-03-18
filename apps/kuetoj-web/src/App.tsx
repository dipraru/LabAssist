import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { BridgeLoginPage } from './pages/BridgeLoginPage';

// Judge
import { JudgeContests } from './pages/judge/JudgeContests';
import { JudgeProblems } from './pages/judge/JudgeProblems';
import { ContestManage } from './pages/judge/ContestManage';
import { JudgeContestProblem } from './pages/judge/JudgeContestProblem';
import { JudgeStandingsEntry, PublicContestStandings } from './pages/judge/PublicContestStandings';
import { ContestParticipants } from './pages/judge/ContestParticipants';

// Participant
import { ContestView } from './pages/participant/ContestView';
import { ContestProblems } from './pages/participant/ContestProblems';
import { ContestProblem } from './pages/participant/ContestProblem';
import { ContestSubmissions } from './pages/participant/ContestSubmissions';
import { ContestSubmissionDetail } from './pages/participant/ContestSubmissionDetail';
import { ParticipantStandings } from './pages/participant/ContestStandings';
import { AskClarification } from './pages/participant/AskClarification';
import { ParticipantContestEntry } from './pages/participant/ParticipantContestEntry';

import { useAuthStore } from './store/auth.store';

const LABASSIST_WEB_URL = import.meta.env.VITE_LABASSIST_WEB_URL ?? 'http://localhost:5173';

function redirectToLabassistLogin() {
  const base = LABASSIST_WEB_URL.replace(/\/$/, '');
  window.location.replace(`${base}/login`);
}

function LoginRedirect() {
  redirectToLabassistLogin();
  return null;
}

function RoleRedirect() {
  const { user } = useAuthStore();
  if (!user) {
    redirectToLabassistLogin();
    return null;
  }
  const map: Record<string, string> = {
    temp_judge: '/judge/contests',
    temp_participant: '/contest',
  };
  return <Navigate to={map[user.role] ?? '/login'} replace />;
}

function JudgeContestDefaultRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/judge/contests/${id}/problems`} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRedirect />} />
      <Route path="/bridge-login" element={<BridgeLoginPage />} />
      <Route path="/unauthorized" element={
        <div className="flex items-center justify-center min-h-screen">
          <p className="text-red-500 text-lg">403 — Not authorised</p>
        </div>
      } />

      <Route path="/judge/contests/:id/standings" element={<JudgeStandingsEntry />} />
      <Route path="/judge/contests/:id/standings/public" element={<PublicContestStandings />} />

      {/* Judge */}
      <Route element={<ProtectedRoute allowedRoles={['temp_judge']} />}>
        <Route path="/judge" element={<Navigate to="/judge/contests" replace />} />
        <Route path="/judge/contests" element={<JudgeContests />} />
        <Route path="/judge/problems" element={<JudgeProblems />} />
        <Route path="/judge/contests/:id" element={<JudgeContestDefaultRedirect />} />
        <Route path="/judge/contests/:id/problems" element={<ContestManage />} />
        <Route path="/judge/contests/:id/status" element={<ContestManage />} />
        <Route path="/judge/contests/:id/clarifications" element={<ContestManage />} />
        <Route path="/judge/contests/:id/announcements" element={<ContestManage />} />
        <Route path="/judge/contests/:id/problems/:problemId" element={<JudgeContestProblem />} />
        <Route path="/judge/contests/:id/participants" element={<ContestParticipants />} />
      </Route>

      {/* Participant */}
      <Route element={<ProtectedRoute allowedRoles={['temp_participant']} />}>
        <Route path="/contest" element={<ParticipantContestEntry />} />
        <Route path="/contest/:id" element={<Navigate to="problems" replace />} />
        <Route path="/contest/:id/status" element={<ContestView />} />
        <Route path="/contest/:id/problems" element={<ContestProblems />} />
        <Route path="/contest/:id/problems/:problemId" element={<ContestProblem />} />
        <Route path="/contest/:id/submissions" element={<ContestSubmissions />} />
        <Route path="/contest/:id/submissions/:submissionId" element={<ContestSubmissionDetail />} />
        <Route path="/contest/:id/standings" element={<ParticipantStandings />} />
        <Route path="/contest/:id/clarifications" element={<AskClarification />} />
      </Route>

      <Route path="/" element={<RoleRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
