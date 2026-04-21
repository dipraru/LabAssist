import type { ReactNode } from 'react';
import { Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { BridgeLoginPage } from './pages/BridgeLoginPage';

// Judge
import { JudgeContests } from './pages/judge/JudgeContests';
import { JudgeProblems } from './pages/judge/JudgeProblems';
import { JudgeProblemEditor } from './pages/judge/JudgeProblemEditor';
import { JudgeLatexGuide } from './pages/judge/JudgeLatexGuide';
import { JudgeContestCreate } from './pages/judge/JudgeContestCreate';
import { ContestManage } from './pages/judge/ContestManage';
import { JudgeContestProblem } from './pages/judge/JudgeContestProblem';
import { PublicContestStandings } from './pages/judge/PublicContestStandings';
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
import { ParticipantContestAccessGate } from './components/ParticipantContestAccessGate';

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
    temp_judge: '/contests',
    temp_participant: '/contests',
  };
  return <Navigate to={map[user.role] ?? '/login'} replace />;
}

function ContestDefaultRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/contests/${id}/problems`} replace />;
}

function LegacyJudgeRedirect() {
  const location = useLocation();
  const nextPath = location.pathname.replace(/^\/judge/, '') || '/';
  return <Navigate to={`${nextPath}${location.search}${location.hash}`} replace />;
}

function LegacyParticipantRedirect() {
  const location = useLocation();
  const nextPath = location.pathname.replace(/^\/contest/, '/contests');
  return <Navigate to={`${nextPath}${location.search}${location.hash}`} replace />;
}

function RoleContestIndex() {
  const { user } = useAuthStore();
  if (user?.role === 'temp_judge') return <JudgeContests />;
  return <ParticipantContestEntry />;
}

function JudgeOnly({ children }: { children: ReactNode }) {
  const { user } = useAuthStore();
  if (user?.role !== 'temp_judge') return <Navigate to="/contests" replace />;
  return children;
}

function ParticipantOnly({ children }: { children: ReactNode }) {
  const { user } = useAuthStore();
  if (user?.role !== 'temp_participant') return <Navigate to="/contests" replace />;
  return <ParticipantContestAccessGate>{children}</ParticipantContestAccessGate>;
}

function RoleContestManagePage({ tab }: { tab: 'problems' | 'status' | 'standings' | 'clarifications' | 'announcements' }) {
  const { user } = useAuthStore();
  if (user?.role === 'temp_judge') return <ContestManage />;
  if (tab === 'problems') return <ParticipantContestAccessGate><ContestProblems /></ParticipantContestAccessGate>;
  if (tab === 'status') return <ParticipantContestAccessGate><ContestView /></ParticipantContestAccessGate>;
  if (tab === 'standings') return <ParticipantContestAccessGate><ParticipantStandings /></ParticipantContestAccessGate>;
  if (tab === 'clarifications') return <ParticipantContestAccessGate><AskClarification /></ParticipantContestAccessGate>;
  return <Navigate to="/contests" replace />;
}

function RoleContestProblemPage() {
  const { user } = useAuthStore();
  if (user?.role === 'temp_judge') return <JudgeContestProblem />;
  return <ParticipantContestAccessGate><ContestProblem /></ParticipantContestAccessGate>;
}

function ContestStandingsEntry() {
  const { id } = useParams<{ id: string }>();
  const { token, user } = useAuthStore();

  if (token && user?.role === 'temp_judge') return <ContestManage />;
  if (token && user?.role === 'temp_participant') {
    return <ParticipantContestAccessGate><ParticipantStandings /></ParticipantContestAccessGate>;
  }

  return <Navigate to={`/contests/${id}/standings/public`} replace />;
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

      <Route path="/contests/:id/standings/public" element={<PublicContestStandings />} />
      <Route path="/contests/:id/standings" element={<ContestStandingsEntry />} />

      <Route element={<ProtectedRoute allowedRoles={['temp_judge', 'temp_participant']} />}>
        <Route path="/contests" element={<RoleContestIndex />} />
        <Route path="/contests/new" element={<JudgeOnly><JudgeContestCreate /></JudgeOnly>} />
        <Route path="/contests/:id" element={<ContestDefaultRedirect />} />
        <Route path="/contests/:id/problems" element={<RoleContestManagePage tab="problems" />} />
        <Route path="/contests/:id/status" element={<RoleContestManagePage tab="status" />} />
        <Route path="/contests/:id/clarifications" element={<RoleContestManagePage tab="clarifications" />} />
        <Route path="/contests/:id/announcements" element={<RoleContestManagePage tab="announcements" />} />
        <Route path="/contests/:id/problems/:problemId" element={<RoleContestProblemPage />} />
        <Route path="/contests/:id/submissions" element={<ParticipantOnly><ContestSubmissions /></ParticipantOnly>} />
        <Route path="/contests/:id/submissions/:submissionId" element={<ParticipantOnly><ContestSubmissionDetail /></ParticipantOnly>} />
        <Route path="/contests/:id/participants" element={<JudgeOnly><ContestParticipants /></JudgeOnly>} />
      </Route>

      {/* Judge tools outside contest runtime */}
      <Route element={<ProtectedRoute allowedRoles={['temp_judge']} />}>
        <Route path="/judge" element={<Navigate to="/contests" replace />} />
        <Route path="/problems" element={<JudgeProblems />} />
        <Route path="/problems/new" element={<JudgeProblemEditor />} />
        <Route path="/problems/latex-guide" element={<JudgeLatexGuide />} />
        <Route path="/problems/:problemId/edit" element={<JudgeProblemEditor />} />
      </Route>

      <Route path="/judge/*" element={<LegacyJudgeRedirect />} />
      <Route path="/contest/*" element={<LegacyParticipantRedirect />} />
      <Route path="/" element={<RoleRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
