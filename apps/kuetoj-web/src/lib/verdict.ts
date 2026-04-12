export function getEffectiveVerdict(submission: {
  manualVerdict?: string | null;
  submissionStatus?: string | null;
}): string {
  const manualVerdict = `${submission?.manualVerdict ?? ''}`.trim().toLowerCase();
  if (manualVerdict && manualVerdict !== 'pending') {
    return manualVerdict;
  }

  const submissionStatus = `${submission?.submissionStatus ?? ''}`.trim().toLowerCase();
  if (submissionStatus) {
    return submissionStatus;
  }

  return manualVerdict || 'pending';
}

export function isAcceptedVerdict(submission: {
  manualVerdict?: string | null;
  submissionStatus?: string | null;
}): boolean {
  return getEffectiveVerdict(submission) === 'accepted';
}

const VERDICT_BADGE_COLOR: Record<string, string> = {
  accepted: 'bg-green-100 text-green-700',
  wrong_answer: 'bg-red-100 text-red-700',
  time_limit_exceeded: 'bg-orange-100 text-orange-700',
  memory_limit_exceeded: 'bg-orange-100 text-orange-700',
  runtime_error: 'bg-rose-100 text-rose-700',
  compilation_error: 'bg-fuchsia-100 text-fuchsia-700',
  presentation_error: 'bg-yellow-100 text-yellow-700',
  partial: 'bg-sky-100 text-sky-700',
  pending: 'bg-amber-100 text-amber-700',
  judging: 'bg-blue-100 text-blue-700',
  skipped: 'bg-slate-100 text-slate-600',
  manual_review: 'bg-blue-100 text-blue-700',
};

export function getVerdictBadgeClass(verdict: string): string {
  return VERDICT_BADGE_COLOR[verdict] ?? 'bg-slate-100 text-slate-600';
}
