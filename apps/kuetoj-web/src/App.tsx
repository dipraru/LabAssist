import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { BridgeLoginPage } from './pages/BridgeLoginPage';

// Judge
import { JudgeContests } from './pages/judge/JudgeContests';
import { JudgeProblems } from './pages/judge/JudgeProblems';
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
    temp_judge: '/judge/contests',
    temp_participant: '/contest',
  };
  return <Navigate to={map[user.role] ?? '/login'} replace />;
}

function ParticipantLanding() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white px-4">
      <p className="text-sm text-center">Open your assigned contest link to start participating.</p>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/bridge-login" element={<BridgeLoginPage />} />
      <Route path="/unauthorized" element={
        <div className="flex items-center justify-center min-h-screen">
          <p className="text-red-500 text-lg">403 — Not authorised</p>
        </div>
      } />

      {/* Judge */}
      <Route element={<ProtectedRoute allowedRoles={['temp_judge']} />}>
        <Route path="/judge" element={<Navigate to="/judge/contests" replace />} />
        <Route path="/judge/contests" element={<JudgeContests />} />
        <Route path="/judge/problems" element={<JudgeProblems />} />
        <Route path="/judge/contests/:id" element={<ContestManage />} />
        <Route path="/judge/contests/:id/standings" element={<JudgeContestStandings />} />
        <Route path="/judge/contests/:id/participants" element={<ContestParticipants />} />
      </Route>

      {/* Participant */}
      <Route element={<ProtectedRoute allowedRoles={['temp_participant']} />}>
        <Route path="/contest" element={<ParticipantLanding />} />
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
