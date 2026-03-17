import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Plus, GripVertical, X } from 'lucide-react';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { Modal } from '../../components/Modal';
import { getContestPhase } from '../../components/ContestCountdownBar';

type ProblemItem = {
  id: string;
  title: string;
  timeLimitMs?: number;
  memoryLimitKb?: number;
};

type SelectedProblem = {
  problemId: string;
  title: string;
  score?: number;
};

type ContestItem = {
  id: string;
  title: string;
  type: string;
  startTime?: string;
  endTime?: string;
};

const PHASE_COLOR: Record<string, string> = {
  upcoming: 'bg-blue-100 text-blue-700',
  running: 'bg-emerald-100 text-emerald-700',
  old: 'bg-slate-100 text-slate-600',
};

export function JudgeContests() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [showCreateContestModal, setShowCreateContestModal] = useState(false);
  const [showParticipantsModal, setShowParticipantsModal] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'icpc' | 'score_based'>('icpc');
  const [startTime, setStartTime] = useState('');
  const [durationHours, setDurationHours] = useState(2);
  const [durationMinutes, setDurationMinutes] = useState(0);
  const [freezeTime, setFreezeTime] = useState('');
  const [selected, setSelected] = useState<SelectedProblem[]>([]);

  const [participantsContest, setParticipantsContest] = useState<ContestItem | null>(null);
  const [participantCount, setParticipantCount] = useState(10);
  const [participantAccessFrom, setParticipantAccessFrom] = useState('');
  const [participantAccessUntil, setParticipantAccessUntil] = useState('');
  const [latestPdfBase64, setLatestPdfBase64] = useState<string | null>(null);

  const { data: contests = [] } = useQuery({
    queryKey: ['judge-contests'],
    queryFn: () => api.get('/contests/mine').then((r) => r.data),
  });

  const { data: myProblems = [] } = useQuery({
    queryKey: ['judge-problems'],
    queryFn: () => api.get('/contests/problems/mine').then((r) => r.data),
  });

  const availableProblems = useMemo(
    () => (myProblems as ProblemItem[]).filter((p) => !selected.some((s) => s.problemId === p.id)),
    [myProblems, selected],
  );

  const toLocalInput = (iso: string) => {
    const date = new Date(iso);
    const tzOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
  };

  const downloadPdfBase64 = (base64: string, fileName: string) => {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i += 1) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  };

  const resetCreateContestForm = () => {
    setTitle('');
    setDescription('');
    setType('icpc');
    setStartTime('');
    setDurationHours(2);
    setDurationMinutes(0);
    setFreezeTime('');
    setSelected([]);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!title.trim() || !startTime || selected.length === 0) {
        throw new Error('Please fill title, start time, and select at least one problem');
      }
      if (durationHours * 60 + durationMinutes <= 0) {
        throw new Error('Contest duration must be greater than zero');
      }

      const problems = selected.map((p, idx) => ({
        problemId: p.problemId,
        label: String.fromCharCode(65 + idx),
        orderIndex: idx,
        score: type === 'score_based' ? (p.score ?? 100) : undefined,
      }));

      return api.post('/contests', {
        title,
        description: description || undefined,
        type,
        startTime: new Date(startTime).toISOString(),
        durationHours,
        durationMinutes,
        freezeTime: freezeTime ? new Date(freezeTime).toISOString() : undefined,
        problems,
      });
    },
    onSuccess: (res) => {
      toast.success('Contest created');
      qc.invalidateQueries({ queryKey: ['judge-contests'] });
      setShowCreateContestModal(false);
      resetCreateContestForm();
      navigate(`/judge/contests/${res.data.id}`);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message ?? err.message ?? 'Failed to create contest');
    },
  });

  const addProblem = (problem: ProblemItem) => {
    setSelected((prev) => [...prev, { problemId: problem.id, title: problem.title, score: 100 }]);
  };

  const removeProblem = (problemId: string) => {
    setSelected((prev) => prev.filter((p) => p.problemId !== problemId));
  };

  const onDropAt = (dropIndex: number) => {
    if (dragIndex == null || dragIndex === dropIndex) return;
    setSelected((prev) => {
      const next = [...prev];
      const [item] = next.splice(dragIndex, 1);
      next.splice(dropIndex, 0, item);
      return next;
    });
    setDragIndex(null);
  };

  const openParticipantsModal = (contest: ContestItem) => {
    const fallbackFrom = contest.startTime ? toLocalInput(contest.startTime) : '';
    const fallbackUntil = contest.endTime ? toLocalInput(contest.endTime) : '';
    setParticipantsContest(contest);
    setParticipantCount(10);
    setParticipantAccessFrom(fallbackFrom);
    setParticipantAccessUntil(fallbackUntil);
    setLatestPdfBase64(null);
    setShowParticipantsModal(true);
  };

  const createParticipantsMutation = useMutation({
    mutationFn: () => {
      if (!participantsContest) throw new Error('Contest not selected');
      return api.post('/contests/participants/bulk', {
        contestId: participantsContest.id,
        count: participantCount,
        accessFrom: participantAccessFrom ? new Date(participantAccessFrom).toISOString() : undefined,
        accessUntil: participantAccessUntil ? new Date(participantAccessUntil).toISOString() : undefined,
      });
    },
    onSuccess: (res) => {
      const pdf = res.data?.credentialsPdfBase64;
      const created = res.data?.participants?.length ?? 0;
      toast.success(`${created} participants created`);
      if (pdf) {
        setLatestPdfBase64(pdf);
      }
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message ?? err.message ?? 'Failed to create participants');
    },
  });

  const downloadAllCredentialsMutation = useMutation({
    mutationFn: (contestId: string) => api.get(`/contests/${contestId}/participants/credentials-pdf`),
    onSuccess: (res, contestId) => {
      const pdf = res.data?.credentialsPdfBase64;
      if (!pdf) {
        toast.error('No credentials PDF returned');
        return;
      }
      downloadPdfBase64(pdf, `contest-${contestId}-all-credentials.pdf`);
      toast.success('Downloaded all contest credentials');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message ?? err.message ?? 'Failed to download credentials');
    },
  });

  const contestDurationText = useMemo(() => {
    const minutes = durationHours * 60 + durationMinutes;
    if (minutes <= 0) return 'Contest duration must be greater than zero';
    const hours = Math.floor(minutes / 60);
    const restMinutes = minutes % 60;
    return `Duration: ${hours}h ${restMinutes}m`;
  }, [durationHours, durationMinutes]);

  const computedEndTime = useMemo(() => {
    if (!startTime) return null;
    const minutes = durationHours * 60 + durationMinutes;
    if (minutes <= 0) return null;
    const start = new Date(startTime);
    if (Number.isNaN(start.getTime())) return null;
    return new Date(start.getTime() + minutes * 60 * 1000);
  }, [startTime, durationHours, durationMinutes]);

  const sortedContests = useMemo(() => {
    const order: Record<string, number> = { running: 0, upcoming: 1, old: 2 };
    return [...(contests as ContestItem[])].sort((a, b) => {
      const phaseA = getContestPhase(a.startTime ?? '', a.endTime ?? '');
      const phaseB = getContestPhase(b.startTime ?? '', b.endTime ?? '');
      if (order[phaseA] !== order[phaseB]) return order[phaseA] - order[phaseB];
      const timeA = new Date(a.startTime ?? '').getTime();
      const timeB = new Date(b.startTime ?? '').getTime();
      return timeA - timeB;
    });
  }, [contests]);

  const runningContests = useMemo(
    () => sortedContests.filter((contest) => getContestPhase(contest.startTime ?? '', contest.endTime ?? '') === 'running'),
    [sortedContests],
  );

  const upcomingContests = useMemo(
    () => sortedContests.filter((contest) => getContestPhase(contest.startTime ?? '', contest.endTime ?? '') === 'upcoming'),
    [sortedContests],
  );

  const pastContests = useMemo(
    () => sortedContests.filter((contest) => getContestPhase(contest.startTime ?? '', contest.endTime ?? '') === 'old'),
    [sortedContests],
  );

  const phaseLabel = (phase: string) => {
    if (phase === 'running') return 'Running';
    if (phase === 'upcoming') return 'Upcoming';
    return 'Ended';
  };

  const renderContestTable = (title: string, rows: ContestItem[]) => (
    <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-y border-slate-200">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Title</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Type</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Start Time</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">End Time</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Status</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((contest) => {
              const phase = getContestPhase(contest.startTime ?? '', contest.endTime ?? '');
              return (
                <tr key={contest.id} className="hover:bg-slate-50">
                  <td className="px-3 py-3 font-medium text-slate-900">{contest.title}</td>
                  <td className="px-3 py-3 text-slate-700">{contest.type}</td>
                  <td className="px-3 py-3 text-slate-700">{contest.startTime ? new Date(contest.startTime).toLocaleString() : '—'}</td>
                  <td className="px-3 py-3 text-slate-700">{contest.endTime ? new Date(contest.endTime).toLocaleString() : '—'}</td>
                  <td className="px-3 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${PHASE_COLOR[phase] ?? 'bg-slate-100 text-slate-700'}`}>
                      {phaseLabel(phase)}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => navigate(`/judge/contests/${contest.id}`)} className="px-3 py-1.5 text-xs border border-slate-300 rounded-md hover:bg-slate-50">Manage</button>
                      <button onClick={() => openParticipantsModal(contest)} className="px-3 py-1.5 text-xs border border-slate-300 rounded-md hover:bg-slate-50">Create Participants</button>
                      <button
                        onClick={() => downloadAllCredentialsMutation.mutate(contest.id)}
                        disabled={downloadAllCredentialsMutation.isPending}
                        className="px-3 py-1.5 text-xs border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-60"
                      >
                        Download All Credentials
                      </button>
                      <button onClick={() => navigate(`/judge/contests/${contest.id}/standings`)} className="px-3 py-1.5 text-xs border border-slate-300 rounded-md hover:bg-slate-50">Standings</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-500">No contests in this section.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">My Contests</h1>
            <p className="text-sm text-slate-500 mt-1">Manage your contests and build new ones from your own problem set.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreateContestModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium"
            >
              <Plus size={16} /> Create New Contest
            </button>
          </div>
        </section>

        {renderContestTable('Running Contests', runningContests)}
        {renderContestTable('Upcoming Contests', upcomingContests)}
        {renderContestTable('Past Contests', pastContests)}

        <Modal
          open={showCreateContestModal}
          title="Create New Contest"
          onClose={() => {
            setShowCreateContestModal(false);
            resetCreateContestForm();
          }}
          maxWidthClass="max-w-5xl"
        >
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600">Title</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Description (optional)</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600">Type</label>
                  <select value={type} onChange={(e) => setType(e.target.value as 'icpc' | 'score_based')} className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm">
                    <option value="icpc">ICPC</option>
                    <option value="score_based">Score Based</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Freeze Time (optional)</label>
                  <input
                    type="datetime-local"
                    min={startTime || undefined}
                    max={computedEndTime ? toLocalInput(computedEndTime.toISOString()) : undefined}
                    value={freezeTime}
                    onChange={(e) => setFreezeTime(e.target.value)}
                    className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600">Start</label>
                  <input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Duration Hours</label>
                  <input type="number" min={0} value={durationHours} onChange={(e) => setDurationHours(Number(e.target.value || 0))} className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Duration Minutes</label>
                  <input type="number" min={0} max={59} value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value || 0))} className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
                </div>
              </div>
              {contestDurationText && <p className="text-xs text-slate-500">{contestDurationText}</p>}
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-800">Available My Problems</h3>
              <div className="border border-slate-200 rounded-md max-h-60 overflow-auto">
                {availableProblems.map((problem) => (
                  <button
                    key={problem.id}
                    type="button"
                    onClick={() => addProblem(problem)}
                    className="w-full text-left px-3 py-2 border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                  >
                    <p className="text-sm font-medium text-slate-800">{problem.title}</p>
                    <p className="text-xs text-slate-500">TL {problem.timeLimitMs ?? '—'} · ML {problem.memoryLimitKb ?? '—'}</p>
                  </button>
                ))}
                {!availableProblems.length && <p className="text-xs text-slate-500 p-3">No more problems to add.</p>}
              </div>
            </div>
          </div>

          <div className="mt-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-2">Selected Problems (Drag to reorder)</h3>
            <div className="border border-slate-200 rounded-md overflow-hidden">
              {selected.map((item, index) => (
                <div
                  key={item.problemId}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDropAt(index)}
                  className="grid grid-cols-12 items-center gap-2 px-3 py-2 border-b border-slate-100 last:border-b-0 bg-white"
                >
                  <div className="col-span-1 text-slate-400 cursor-grab">
                    <GripVertical size={16} />
                  </div>
                  <div className="col-span-1 text-xs font-semibold text-indigo-700">
                    {String.fromCharCode(65 + index)}
                  </div>
                  <div className="col-span-7 text-sm text-slate-800">{item.title}</div>
                  {type === 'score_based' && (
                    <div className="col-span-2">
                      <input
                        type="number"
                        value={item.score ?? 100}
                        onChange={(e) => {
                          const value = Number(e.target.value || 0);
                          setSelected((prev) => prev.map((p) => (p.problemId === item.problemId ? { ...p, score: value } : p)));
                        }}
                        className="w-full border border-slate-300 rounded-md px-2 py-1 text-xs"
                      />
                    </div>
                  )}
                  {type !== 'score_based' && <div className="col-span-2" />}
                  <div className="col-span-1 text-right">
                    <button type="button" onClick={() => removeProblem(item.problemId)} className="text-red-500 hover:text-red-700">
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))}
              {!selected.length && <p className="text-sm text-slate-500 p-4">Select at least one problem from your list.</p>}
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowCreateContestModal(false);
                resetCreateContestForm();
              }}
              className="px-4 py-2 border border-slate-300 rounded-md text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-md text-sm font-medium"
            >
              {createMutation.isPending ? 'Creating…' : 'Create Contest'}
            </button>
          </div>
        </Modal>

        <Modal
          open={showParticipantsModal}
          title={participantsContest ? `Create Participants — ${participantsContest.title}` : 'Create Participants'}
          onClose={() => setShowParticipantsModal(false)}
          maxWidthClass="max-w-2xl"
        >
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-600">Number of Accounts</label>
              <input
                type="number"
                min={1}
                max={200}
                value={participantCount}
                onChange={(e) => setParticipantCount(Number(e.target.value || 0))}
                className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
              <p className="text-xs text-slate-500 mt-1">You can run this multiple times to create more.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600">Access From (optional)</label>
                <input
                  type="datetime-local"
                  value={participantAccessFrom}
                  onChange={(e) => setParticipantAccessFrom(e.target.value)}
                  className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Access Until (optional)</label>
                <input
                  type="datetime-local"
                  min={participantAccessFrom || undefined}
                  value={participantAccessUntil}
                  onChange={(e) => setParticipantAccessUntil(e.target.value)}
                  className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                />
              </div>
            </div>

            {latestPdfBase64 && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-sm text-emerald-800">Latest batch created successfully.</p>
                <button
                  type="button"
                  onClick={() => {
                    if (!participantsContest) return;
                    downloadPdfBase64(latestPdfBase64, `contest-${participantsContest.id}-latest-credentials.pdf`);
                  }}
                  className="mt-2 px-3 py-1.5 text-xs border border-emerald-300 rounded-md hover:bg-emerald-100"
                >
                  Download Latest Credentials
                </button>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowParticipantsModal(false)} className="px-4 py-2 border border-slate-300 rounded-md text-sm">Close</button>
              <button
                type="button"
                onClick={() => createParticipantsMutation.mutate()}
                disabled={createParticipantsMutation.isPending}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-md text-sm font-medium"
              >
                {createParticipantsMutation.isPending ? 'Creating…' : 'Create Participants'}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </AppShell>
  );
}
