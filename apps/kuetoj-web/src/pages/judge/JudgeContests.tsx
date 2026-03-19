import { useEffect, useMemo, useState } from 'react';
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
  problemCode?: string;
  title: string;
  timeLimitMs?: number;
  memoryLimitKb?: number;
};

type SelectedProblem = {
  problemId: string;
  problemCode?: string;
  title: string;
  score?: number;
};

type EditSelectedProblem = SelectedProblem & {
  existing: boolean;
};

function contestProblemLabel(index: number): string {
  return String.fromCharCode(65 + index);
}

type ContestItem = {
  id: string;
  contestNumber?: number | null;
  title: string;
  type: string;
  description?: string;
  isPublicStanding?: boolean;
  startTime?: string;
  endTime?: string;
  participatedCount?: number;
};

const PHASE_COLOR: Record<string, string> = {
  upcoming: 'bg-blue-100 text-blue-700',
  running: 'bg-emerald-100 text-emerald-700',
  old: 'bg-slate-100 text-slate-600',
};

export function JudgeContests() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [nowMs, setNowMs] = useState<number>(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const [showCreateContestModal, setShowCreateContestModal] = useState(false);
  const [showEditContestModal, setShowEditContestModal] = useState(false);
  const [showProblemPickerModal, setShowProblemPickerModal] = useState(false);
  const [showEditProblemPickerModal, setShowEditProblemPickerModal] = useState(false);
  const [showParticipantsModal, setShowParticipantsModal] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [editDragIndex, setEditDragIndex] = useState<number | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'icpc' | 'score_based'>('icpc');
  const [standingVisibility, setStandingVisibility] = useState<'private' | 'public'>('private');
  const [startAtText, setStartAtText] = useState('');
  const [contestLengthText, setContestLengthText] = useState('05:00');
  const [freezeEnabled, setFreezeEnabled] = useState(true);
  const [manualUnfreeze, setManualUnfreeze] = useState(false);
  const [freezeBeforeMinutesText, setFreezeBeforeMinutesText] = useState('60');
  const [freezeAfterMinutesText, setFreezeAfterMinutesText] = useState('0');
  const [problemSearchText, setProblemSearchText] = useState('');
  const [checkedProblemIds, setCheckedProblemIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<SelectedProblem[]>([]);

  const [editingContestId, setEditingContestId] = useState<string | null>(null);
  const [editingContestPhase, setEditingContestPhase] = useState<'upcoming' | 'running' | 'old'>('upcoming');
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editType, setEditType] = useState<'icpc' | 'score_based'>('icpc');
  const [editStandingVisibility, setEditStandingVisibility] = useState<'private' | 'public'>('private');
  const [editStartAtText, setEditStartAtText] = useState('');
  const [editContestLengthText, setEditContestLengthText] = useState('05:00');
  const [editFreezeEnabled, setEditFreezeEnabled] = useState(true);
  const [editManualUnfreeze, setEditManualUnfreeze] = useState(false);
  const [editFreezeBeforeMinutesText, setEditFreezeBeforeMinutesText] = useState('60');
  const [editFreezeAfterMinutesText, setEditFreezeAfterMinutesText] = useState('0');
  const [editProblemSearchText, setEditProblemSearchText] = useState('');
  const [editCheckedProblemIds, setEditCheckedProblemIds] = useState<string[]>([]);
  const [editSelected, setEditSelected] = useState<EditSelectedProblem[]>([]);
  const [isEditLoading, setIsEditLoading] = useState(false);

  const [participantsContest, setParticipantsContest] = useState<ContestItem | null>(null);
  const [participantCsvFileName, setParticipantCsvFileName] = useState('');
  const [participantNames, setParticipantNames] = useState<string[]>([]);
  const [latestPdfBase64, setLatestPdfBase64] = useState<string | null>(null);

  const { data: contests = [] } = useQuery({
    queryKey: ['judge-contests'],
    queryFn: () => api.get('/contests/mine').then((r) => r.data),
  });

  const { data: myProblems = [] } = useQuery({
    queryKey: ['judge-problems'],
    queryFn: () => api.get('/contests/problems/mine').then((r) => r.data),
  });

  const allProblems = myProblems as ProblemItem[];

  const filteredProblems = useMemo(() => {
    const q = problemSearchText.trim().toLowerCase();
    if (!q) return allProblems;
    return allProblems.filter((problem) => {
      const titleText = problem.title?.toLowerCase() ?? '';
      const idText = problem.id?.toLowerCase() ?? '';
      const codeText = problem.problemCode?.toLowerCase() ?? '';
      return titleText.includes(q) || idText.includes(q) || codeText.includes(q);
    });
  }, [allProblems, problemSearchText]);

  const filteredEditProblems = useMemo(() => {
    const q = editProblemSearchText.trim().toLowerCase();
    if (!q) return allProblems;
    return allProblems.filter((problem) => {
      const titleText = problem.title?.toLowerCase() ?? '';
      const idText = problem.id?.toLowerCase() ?? '';
      const codeText = problem.problemCode?.toLowerCase() ?? '';
      return titleText.includes(q) || idText.includes(q) || codeText.includes(q);
    });
  }, [allProblems, editProblemSearchText]);

  const toPlainDateTimeText = (value: Date) => {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    const hour = String(value.getHours()).padStart(2, '0');
    const minute = String(value.getMinutes()).padStart(2, '0');
    const second = String(value.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
  };

  const parseDateTimeText = (text: string): Date | null => {
    const value = text.trim();
    if (!value) return null;

    const matched = value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (matched) {
      const [, year, month, day, hour, minute, second] = matched;
      const parsed = new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second ?? '0'),
      );
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const isoParsed = new Date(value);
    return Number.isNaN(isoParsed.getTime()) ? null : isoParsed;
  };

  const parseDurationText = (text: string): { hours: number; minutes: number; totalMinutes: number } | null => {
    const value = text.trim();
    const matched = value.match(/^(\d{1,3}):(\d{2})$/);
    if (!matched) return null;
    const hours = Number(matched[1]);
    const minutes = Number(matched[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    if (minutes < 0 || minutes > 59 || hours < 0) return null;
    const totalMinutes = hours * 60 + minutes;
    return { hours, minutes, totalMinutes };
  };

  const parseMinutesText = (text: string, label: string): number => {
    const value = text.trim();
    if (!/^\d+$/.test(value)) {
      throw new Error(`${label} must be a non-negative number`);
    }
    return Number(value);
  };

  const durationTextFromStartEnd = (startIso?: string, endIso?: string) => {
    if (!startIso || !endIso) return '05:00';
    const startMs = new Date(startIso).getTime();
    const endMs = new Date(endIso).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) return '05:00';
    const totalMinutes = Math.max(1, Math.round((endMs - startMs) / 60000));
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
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
    const oneHourLater = new Date(Date.now() + 60 * 60 * 1000);
    oneHourLater.setSeconds(0, 0);
    setTitle('');
    setDescription('');
    setType('icpc');
    setStandingVisibility('private');
    setStartAtText(toPlainDateTimeText(oneHourLater));
    setContestLengthText('05:00');
    setFreezeEnabled(true);
    setManualUnfreeze(false);
    setFreezeBeforeMinutesText('60');
    setFreezeAfterMinutesText('0');
    setProblemSearchText('');
    setCheckedProblemIds([]);
    setSelected([]);
  };

  useEffect(() => {
    if (showCreateContestModal && !startAtText) {
      const oneHourLater = new Date(Date.now() + 60 * 60 * 1000);
      oneHourLater.setSeconds(0, 0);
      setStartAtText(toPlainDateTimeText(oneHourLater));
    }
  }, [showCreateContestModal, startAtText]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const parsedStart = parseDateTimeText(startAtText);
      if (!title.trim() || !parsedStart || selected.length === 0) {
        throw new Error('Please fill title, start date-time, and select at least one problem');
      }
      if (parsedStart.getTime() < Date.now()) {
        throw new Error('Start time cannot be before current time');
      }
      const parsedDuration = parseDurationText(contestLengthText);
      if (!parsedDuration || parsedDuration.totalMinutes <= 0) {
        throw new Error('Contest length must be valid (e.g. 05:00) and greater than zero');
      }
      const freezeBeforeMinutes = freezeEnabled
        ? parseMinutesText(freezeBeforeMinutesText, 'Freeze before end minutes')
        : 0;
      const freezeAfterMinutes = freezeEnabled && !manualUnfreeze
        ? parseMinutesText(freezeAfterMinutesText, 'Auto unfreeze minutes')
        : 0;

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
        startTime: parsedStart.toISOString(),
        durationHours: parsedDuration.hours,
        durationMinutes: parsedDuration.minutes,
        standingVisibility,
        freezeEnabled,
        manualUnfreeze: freezeEnabled ? manualUnfreeze : false,
        freezeBeforeMinutes,
        freezeAfterMinutes,
        problems,
      });
    },
    onSuccess: () => {
      toast.success('Contest created');
      qc.invalidateQueries({ queryKey: ['judge-contests'] });
      setShowCreateContestModal(false);
      resetCreateContestForm();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message ?? err.message ?? 'Failed to create contest');
    },
  });

  const addCheckedProblems = () => {
    const checked = new Set(checkedProblemIds);
    const selectedSet = new Set(selected.map((item) => item.problemId));
    const toAppend = allProblems
      .filter((problem) => checked.has(problem.id) && !selectedSet.has(problem.id))
      .map((problem) => ({
        problemId: problem.id,
        problemCode: problem.problemCode,
        title: problem.title,
        score: 100,
      }));
    if (!toAppend.length) return;
    setSelected((prev) => [...prev, ...toAppend]);
    setShowProblemPickerModal(false);
  };

  useEffect(() => {
    if (!showProblemPickerModal) return;
    const selectedIds = selected.map((item) => item.problemId).filter(Boolean);
    setCheckedProblemIds(selectedIds);
  }, [showProblemPickerModal, selected]);

  const removeProblem = (problemId: string) => {
    setSelected((prev) => prev.filter((p) => p.problemId !== problemId));
    setCheckedProblemIds((prev) => prev.filter((id) => id !== problemId));
  };

  const resetEditContestForm = () => {
    setShowEditProblemPickerModal(false);
    setEditingContestId(null);
    setEditingContestPhase('upcoming');
    setEditTitle('');
    setEditDescription('');
    setEditType('icpc');
    setEditStandingVisibility('private');
    setEditStartAtText('');
    setEditContestLengthText('05:00');
    setEditFreezeEnabled(true);
    setEditManualUnfreeze(false);
    setEditFreezeBeforeMinutesText('60');
    setEditFreezeAfterMinutesText('0');
    setEditProblemSearchText('');
    setEditCheckedProblemIds([]);
    setEditSelected([]);
    setIsEditLoading(false);
  };

  const openEditContestModal = async (contest: ContestItem) => {
    setIsEditLoading(true);
    setShowEditContestModal(true);
    try {
      const response = await api.get(`/contests/${contest.contestNumber ?? contest.id}`);
      const details = response.data;
      const phase = getContestPhase(details.startTime ?? '', details.endTime ?? '');
      setEditingContestId(details.id);
      setEditingContestPhase(phase);
      setEditTitle(details.title ?? '');
      setEditDescription(details.description ?? '');
      setEditType(details.type ?? 'icpc');
      setEditStandingVisibility(details.isPublicStanding ? 'public' : 'private');
      setEditStartAtText(details.startTime ? toPlainDateTimeText(new Date(details.startTime)) : '');
      setEditContestLengthText(durationTextFromStartEnd(details.startTime, details.endTime));
      setEditFreezeEnabled(Boolean(details.isStandingFrozen));
      const manual = Boolean(details.isStandingFrozen) && !details.standingUnfreezeTime;
      setEditManualUnfreeze(manual);
      setEditFreezeBeforeMinutesText(String(details.freezeBeforeMinutes ?? 60));
      setEditFreezeAfterMinutesText(String(details.freezeAfterMinutes ?? 0));
      const contestProblems = (details.problems ?? []) as Array<any>;
      const sortedProblems = [...contestProblems].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
      setEditSelected(
        sortedProblems.map((item) => ({
          problemId: item.problemId ?? item.problem?.id,
          problemCode: item.problem?.problemCode,
          title: item.problem?.title ?? 'Untitled Problem',
          score: item.score ?? 100,
          existing: true,
        })).filter((item) => typeof item.problemId === 'string' && item.problemId.length > 0),
      );
      setEditCheckedProblemIds(
        sortedProblems
          .map((item) => item.problemId ?? item.problem?.id)
          .filter((problemId): problemId is string => typeof problemId === 'string' && problemId.length > 0),
      );
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? 'Failed to load contest details');
      setShowEditContestModal(false);
      resetEditContestForm();
    } finally {
      setIsEditLoading(false);
    }
  };

  const toggleEditCheckedProblem = (problemId: string) => {
    setEditCheckedProblemIds((prev) => {
      if (prev.includes(problemId)) return prev.filter((id) => id !== problemId);
      return [...prev, problemId];
    });
  };

  const addCheckedProblemsForEdit = () => {
    const checked = new Set(editCheckedProblemIds);
    const selectedSet = new Set(editSelected.map((item) => item.problemId));
    const toAppend = allProblems
      .filter((problem) => checked.has(problem.id) && !selectedSet.has(problem.id))
      .map((problem) => ({
        problemId: problem.id,
        problemCode: problem.problemCode,
        title: problem.title,
        score: 100,
        existing: false,
      }));
    if (!toAppend.length) return;
    setEditSelected((prev) => [...prev, ...toAppend]);
    setShowEditProblemPickerModal(false);
  };

  useEffect(() => {
    if (!showEditProblemPickerModal) return;
    const selectedIds = editSelected.map((item) => item.problemId).filter(Boolean);
    setEditCheckedProblemIds(selectedIds);
  }, [showEditProblemPickerModal, editSelected]);

  const removeEditProblem = (problemId: string) => {
    setEditSelected((prev) => prev.filter((p) => p.problemId !== problemId));
    setEditCheckedProblemIds((prev) => prev.filter((id) => id !== problemId));
  };

  const randomizeEditSelected = () => {
    if (editingContestPhase !== 'upcoming') return;
    setEditSelected((prev) => {
      const next = [...prev];
      for (let i = next.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
      }
      return next;
    });
  };

  const onEditDropAt = (dropIndex: number) => {
    if (editingContestPhase !== 'upcoming') return;
    if (editDragIndex == null || editDragIndex === dropIndex) return;
    setEditSelected((prev) => {
      const next = [...prev];
      const [item] = next.splice(editDragIndex, 1);
      next.splice(dropIndex, 0, item);
      return next;
    });
    setEditDragIndex(null);
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingContestId) throw new Error('Contest not selected');
      const parsedStart = parseDateTimeText(editStartAtText);
      if (!editTitle.trim() || !parsedStart) {
        throw new Error('Please fill title and valid start date-time');
      }
      if (editingContestPhase === 'upcoming' && parsedStart.getTime() < Date.now()) {
        throw new Error('Start time cannot be before current time');
      }
      const parsedDuration = parseDurationText(editContestLengthText);
      if (!parsedDuration || parsedDuration.totalMinutes <= 0) {
        throw new Error('Contest length must be valid (e.g. 05:00) and greater than zero');
      }
      const freezeBeforeMinutes = editFreezeEnabled
        ? parseMinutesText(editFreezeBeforeMinutesText, 'Freeze before end minutes')
        : 0;
      const freezeAfterMinutes = editFreezeEnabled && !editManualUnfreeze
        ? parseMinutesText(editFreezeAfterMinutesText, 'Auto unfreeze minutes')
        : 0;

      if (!editSelected.length) {
        throw new Error('Select at least one problem');
      }

      const problems = editSelected.map((problem, index) => ({
        problemId: problem.problemId,
        label: contestProblemLabel(index),
        orderIndex: index,
        score: editType === 'score_based' ? (problem.score ?? 100) : undefined,
      }));

      return api.patch(`/contests/${editingContestId}`, {
        title: editTitle,
        description: editDescription || undefined,
        type: editType,
        startTime: editingContestPhase === 'upcoming' ? parsedStart.toISOString() : undefined,
        durationHours: parsedDuration.hours,
        durationMinutes: parsedDuration.minutes,
        standingVisibility: editStandingVisibility,
        freezeEnabled: editFreezeEnabled,
        manualUnfreeze: editFreezeEnabled ? editManualUnfreeze : false,
        freezeBeforeMinutes,
        freezeAfterMinutes,
        problems,
      });
    },
    onSuccess: () => {
      toast.success('Contest updated');
      qc.invalidateQueries({ queryKey: ['judge-contests'] });
      setShowEditContestModal(false);
      resetEditContestForm();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message ?? err.message ?? 'Failed to update contest');
    },
  });

  const toggleCheckedProblem = (problemId: string) => {
    setCheckedProblemIds((prev) => {
      if (prev.includes(problemId)) return prev.filter((id) => id !== problemId);
      return [...prev, problemId];
    });
  };

  const randomizeSelected = () => {
    setSelected((prev) => {
      const next = [...prev];
      for (let i = next.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
      }
      return next;
    });
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
    setParticipantsContest(contest);
    setParticipantCsvFileName('');
    setParticipantNames([]);
    setLatestPdfBase64(null);
    setShowParticipantsModal(true);
  };

  const parseParticipantCsv = (rawText: string): string[] => {
    const stripped = rawText.replace(/^\uFEFF/, '');
    const lines = stripped.split(/\r?\n/);

    while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
      lines.pop();
    }

    const names = lines.map((line) => {
      if (line.includes(',')) {
        throw new Error('CSV must contain exactly one column (participant name only)');
      }
      return line.trim();
    });

    if (!names.length) {
      throw new Error('CSV file is empty');
    }

    if (names.length > 200) {
      throw new Error('Maximum 200 participants are allowed per batch');
    }

    return names;
  };

  const onParticipantCsvSelected = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const names = parseParticipantCsv(text);
      setParticipantCsvFileName(file.name);
      setParticipantNames(names);
    } catch (error: any) {
      setParticipantCsvFileName('');
      setParticipantNames([]);
      toast.error(error?.message ?? 'Failed to parse CSV file');
    }
  };

  const updateParticipantNameAt = (index: number, value: string) => {
    setParticipantNames((prev) => prev.map((name, idx) => (idx === index ? value : name)));
  };

  const addParticipantRow = () => {
    setParticipantNames((prev) => [...prev, '']);
  };

  const removeParticipantRow = (index: number) => {
    setParticipantNames((prev) => prev.filter((_, idx) => idx !== index));
  };

  const createParticipantsMutation = useMutation({
    mutationFn: () => {
      if (!participantsContest) throw new Error('Contest not selected');

      const normalizedNames = participantNames.map((name) => name.trim());
      if (!normalizedNames.length) {
        throw new Error('Please select a CSV file and load participant names first');
      }
      if (normalizedNames.length > 200) {
        throw new Error('Maximum 200 participants are allowed per batch');
      }
      if (normalizedNames.some((name) => !name)) {
        throw new Error('Participant name list contains empty fields. Fill or remove empty rows.');
      }

      return api.post('/contests/participants/bulk', {
        contestId: participantsContest.id,
        names: normalizedNames,
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

  const parsedStartAt = useMemo(() => parseDateTimeText(startAtText), [startAtText]);

  const parsedLength = useMemo(() => parseDurationText(contestLengthText), [contestLengthText]);

  const contestDurationText = useMemo(() => {
    if (!parsedLength || parsedLength.totalMinutes <= 0) return 'Contest length is invalid';
    return `Duration: ${parsedLength.hours}h ${parsedLength.minutes}m`;
  }, [parsedLength]);

  const computedEndTime = useMemo(() => {
    if (!parsedStartAt || !parsedLength || parsedLength.totalMinutes <= 0) return null;
    return new Date(parsedStartAt.getTime() + parsedLength.totalMinutes * 60 * 1000);
  }, [parsedStartAt, parsedLength]);

  const freezeBeforeMinutesPreview = useMemo(() => {
    if (!/^\d+$/.test(freezeBeforeMinutesText.trim())) return 0;
    return Number(freezeBeforeMinutesText.trim());
  }, [freezeBeforeMinutesText]);

  const freezeAfterMinutesPreview = useMemo(() => {
    if (!/^\d+$/.test(freezeAfterMinutesText.trim())) return 0;
    return Number(freezeAfterMinutesText.trim());
  }, [freezeAfterMinutesText]);

  const computedFreezeStart = useMemo(() => {
    if (!freezeEnabled || !computedEndTime) return null;
    return new Date(computedEndTime.getTime() - Math.max(0, freezeBeforeMinutesPreview) * 60 * 1000);
  }, [freezeEnabled, computedEndTime, freezeBeforeMinutesPreview]);

  const computedFreezeEnd = useMemo(() => {
    if (!freezeEnabled || !computedEndTime) return null;
    return new Date(computedEndTime.getTime() + Math.max(0, freezeAfterMinutesPreview) * 60 * 1000);
  }, [freezeEnabled, computedEndTime, freezeAfterMinutesPreview]);

  const sortByNewestStart = (rows: ContestItem[]) => [...rows].sort((a, b) => {
    const timeA = new Date(a.startTime ?? 0).getTime();
    const timeB = new Date(b.startTime ?? 0).getTime();
    return timeB - timeA;
  });

  const sortByEarliestStart = (rows: ContestItem[]) => [...rows].sort((a, b) => {
    const timeA = new Date(a.startTime ?? 0).getTime();
    const timeB = new Date(b.startTime ?? 0).getTime();
    return timeA - timeB;
  });

  const runningContests = useMemo(
    () => sortByNewestStart((contests as ContestItem[]).filter((contest) => getContestPhase(contest.startTime ?? '', contest.endTime ?? '') === 'running')),
    [contests],
  );

  const upcomingContests = useMemo(
    () => sortByEarliestStart((contests as ContestItem[]).filter((contest) => getContestPhase(contest.startTime ?? '', contest.endTime ?? '') === 'upcoming')),
    [contests],
  );

  const pastContests = useMemo(
    () => sortByNewestStart((contests as ContestItem[]).filter((contest) => getContestPhase(contest.startTime ?? '', contest.endTime ?? '') === 'old')),
    [contests],
  );

  const phaseLabel = (phase: string) => {
    if (phase === 'running') return 'Running';
    if (phase === 'upcoming') return 'Upcoming';
    return 'Ended';
  };

  const formatHms = (totalSeconds: number) => {
    const clamped = Math.max(0, totalSeconds);
    const hrs = Math.floor(clamped / 3600).toString().padStart(2, '0');
    const mins = Math.floor((clamped % 3600) / 60).toString().padStart(2, '0');
    const secs = Math.floor(clamped % 60).toString().padStart(2, '0');
    return `${hrs}:${mins}:${secs}`;
  };

  const phaseTime = (contest: ContestItem) => {
    if (!contest.startTime || !contest.endTime) return '—';
    const startMs = new Date(contest.startTime).getTime();
    const endMs = new Date(contest.endTime).getTime();
    const phase = getContestPhase(contest.startTime, contest.endTime);

    if (phase === 'upcoming') {
      const seconds = Math.floor((startMs - nowMs) / 1000);
      if (seconds >= 24 * 60 * 60) {
        const days = Math.ceil(seconds / (24 * 60 * 60));
        return `${days} day${days > 1 ? 's' : ''}`;
      }
      return formatHms(seconds);
    }

    if (phase === 'running') {
      const seconds = Math.floor((endMs - nowMs) / 1000);
      return formatHms(seconds);
    }

    return '—';
  };

  const durationText = (contest: ContestItem) => {
    if (!contest.startTime || !contest.endTime) return '—';
    const startMs = new Date(contest.startTime).getTime();
    const endMs = new Date(contest.endTime).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) return '—';
    const totalMinutes = Math.max(1, Math.round((endMs - startMs) / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes}m`;
  };

  const renderContestTable = (title: string, rows: ContestItem[], section: 'running' | 'upcoming' | 'past') => (
    <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full table-auto text-sm">
          <thead className="bg-slate-50 border-y border-slate-200">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Title</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Duration</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Start Time</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">End Time</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">{section === 'past' ? 'Total Participant' : section === 'upcoming' ? 'Starts In' : 'Remaining'}</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Status</th>
              <th className="px-3 py-2 text-right font-medium text-slate-600 whitespace-nowrap" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((contest) => {
              const phase = getContestPhase(contest.startTime ?? '', contest.endTime ?? '');
              const contestRouteId = String(contest.contestNumber ?? contest.id);
              return (
                <tr key={contest.id} className="hover:bg-slate-50">
                  <td className="px-3 py-3 font-medium text-slate-900 truncate">
                    <button
                      type="button"
                      onClick={() => navigate(`/contests/${contestRouteId}`)}
                      className="text-left text-indigo-700 hover:underline truncate max-w-full"
                    >
                      {contest.title}
                    </button>
                  </td>
                  <td className="px-3 py-3 text-slate-700 text-xs">{durationText(contest)}</td>
                  <td className="px-3 py-3 text-slate-700 truncate">{contest.startTime ? new Date(contest.startTime).toLocaleString() : '—'}</td>
                  <td className="px-3 py-3 text-slate-700 truncate">{contest.endTime ? new Date(contest.endTime).toLocaleString() : '—'}</td>
                  <td className="px-3 py-3 text-slate-700 text-xs">
                    {section === 'past' ? (contest.participatedCount ?? 0) : phaseTime(contest)}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className={`text-xs px-2 py-1 rounded-full ${PHASE_COLOR[phase] ?? 'bg-slate-100 text-slate-700'}`}>
                      {phaseLabel(phase)}
                    </span>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <div className="flex items-center justify-end gap-2">
                      {phase !== 'old' && (
                        <button onClick={() => openEditContestModal(contest)} className="px-3 py-1.5 text-xs border border-slate-300 rounded-md hover:bg-slate-50">Edit</button>
                      )}
                      {phase !== 'old' && (
                        <button onClick={() => openParticipantsModal(contest)} className="px-3 py-1.5 text-xs border border-slate-300 rounded-md hover:bg-slate-50">Create Participants</button>
                      )}
                      <button
                        onClick={() => downloadAllCredentialsMutation.mutate(contest.id)}
                        disabled={downloadAllCredentialsMutation.isPending}
                        className="px-3 py-1.5 text-xs border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-60"
                      >
                        Download All Credentials
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-slate-500">No contests in this section.</td>
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

        {renderContestTable('Running Contests', runningContests, 'running')}
        {renderContestTable('Upcoming Contests', upcomingContests, 'upcoming')}
        {renderContestTable('Past Contests', pastContests, 'past')}

        <Modal
          open={showCreateContestModal}
          title="Create New Contest"
          onClose={() => {
            setShowCreateContestModal(false);
            resetCreateContestForm();
          }}
          maxWidthClass="max-w-3xl"
        >
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-slate-600">Contest Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Enter your contest title" className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600">Contest Description (Optional)</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm resize-none" />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600">Contest Type</label>
              <select value={type} onChange={(e) => setType(e.target.value as 'icpc' | 'score_based')} className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-700 bg-white">
                <option value="icpc">ICPC</option>
                <option value="score_based">Score Based</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600">Standing Visibility</label>
              <select
                value={standingVisibility}
                onChange={(e) => setStandingVisibility(e.target.value as 'private' | 'public')}
                className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-700 bg-white"
              >
                <option value="private">Private</option>
                <option value="public">Public</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600">Start Date &amp; Time (text)</label>
              <input
                value={startAtText}
                onChange={(e) => setStartAtText(e.target.value)}
                placeholder="YYYY-MM-DD HH:mm:ss"
                className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-slate-500">Example: 2026-03-20 10:00:00</p>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600">Contest Length (HH:MM)</label>
              <input
                value={contestLengthText}
                onChange={(e) => setContestLengthText(e.target.value)}
                placeholder="05:00"
                className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-slate-500">{contestDurationText}</p>
            </div>

            <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
              <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={freezeEnabled}
                  onChange={(e) => setFreezeEnabled(e.target.checked)}
                />
                Enable standing freeze
              </label>

              {freezeEnabled && (
                <>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-slate-600">Freeze Before End (minutes)</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={freezeBeforeMinutesText}
                        onChange={(e) => setFreezeBeforeMinutesText(e.target.value)}
                        className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="flex items-end">
                      <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                        <input
                          type="checkbox"
                          checked={manualUnfreeze}
                          onChange={(e) => setManualUnfreeze(e.target.checked)}
                        />
                        Manual unfreeze
                      </label>
                    </div>
                  </div>

                  {!manualUnfreeze && (
                    <div className="mt-3">
                      <label className="text-xs font-medium text-slate-600">Auto Unfreeze After End (minutes)</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={freezeAfterMinutesText}
                        onChange={(e) => setFreezeAfterMinutesText(e.target.value)}
                        className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                      />
                    </div>
                  )}

                  <div className="mt-3 text-xs text-slate-500 space-y-1">
                    <p>Computed End: {computedEndTime ? computedEndTime.toLocaleString() : '—'}</p>
                    <p>Freeze Start: {computedFreezeStart ? computedFreezeStart.toLocaleString() : '—'}</p>
                    <p>Freeze End: {computedFreezeEnd ? computedFreezeEnd.toLocaleString() : '—'}</p>
                  </div>
                </>
              )}
            </div>

            <div className="rounded-lg border border-slate-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-800">Contest Problems</h3>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowProblemPickerModal(true)}
                    className="px-3 py-1.5 text-xs border border-slate-300 rounded-md hover:bg-slate-50"
                  >
                    Add / Remove Problems
                  </button>
                  <button
                    type="button"
                    onClick={randomizeSelected}
                    disabled={selected.length < 2}
                    className="px-3 py-1.5 text-xs border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50"
                  >
                    Random Arrangement
                  </button>
                </div>
              </div>

              <div className="mt-3 border border-slate-200 rounded-md overflow-hidden">
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
                      {contestProblemLabel(index)}
                    </div>
                    <div className="col-span-7 text-sm text-slate-800">
                      <p>{item.title}</p>
                      <p className="text-xs text-slate-500">{item.problemCode ?? item.problemId}</p>
                    </div>
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
                {!selected.length && <p className="text-sm text-slate-500 p-4">Pick problems, then drag to arrange.</p>}
              </div>
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
          open={showEditContestModal}
          title="Edit Contest"
          onClose={() => {
            setShowEditContestModal(false);
            resetEditContestForm();
          }}
          maxWidthClass="max-w-3xl"
        >
          {isEditLoading ? (
            <p className="text-sm text-slate-500">Loading contest details...</p>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-600">Contest Title</label>
                <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Enter your contest title" className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600">Contest Description (Optional)</label>
                <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={3} className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm resize-none" />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600">Contest Type</label>
                <select value={editType} onChange={(e) => setEditType(e.target.value as 'icpc' | 'score_based')} className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-700 bg-white">
                  <option value="icpc">ICPC</option>
                  <option value="score_based">Score Based</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600">Standing Visibility</label>
                <select
                  value={editStandingVisibility}
                  onChange={(e) => setEditStandingVisibility(e.target.value as 'private' | 'public')}
                  className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-700 bg-white"
                >
                  <option value="private">Private</option>
                  <option value="public">Public</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600">Start Date &amp; Time (text)</label>
                <input
                  value={editStartAtText}
                  onChange={(e) => setEditStartAtText(e.target.value)}
                  placeholder="YYYY-MM-DD HH:mm:ss"
                  disabled={editingContestPhase !== 'upcoming'}
                  className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm disabled:bg-slate-100"
                />
                {editingContestPhase !== 'upcoming' && (
                  <p className="mt-1 text-xs text-amber-700">Start time can only be changed for upcoming contests.</p>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600">Contest Length (HH:MM)</label>
                <input
                  value={editContestLengthText}
                  onChange={(e) => setEditContestLengthText(e.target.value)}
                  placeholder="05:00"
                  className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                />
              </div>

              <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
                <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={editFreezeEnabled}
                    onChange={(e) => setEditFreezeEnabled(e.target.checked)}
                  />
                  Enable standing freeze
                </label>

                {editFreezeEnabled && (
                  <>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-slate-600">Freeze Before End (minutes)</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={editFreezeBeforeMinutesText}
                          onChange={(e) => setEditFreezeBeforeMinutesText(e.target.value)}
                          className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                        />
                      </div>
                      <div className="flex items-end">
                        <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                          <input
                            type="checkbox"
                            checked={editManualUnfreeze}
                            onChange={(e) => setEditManualUnfreeze(e.target.checked)}
                          />
                          Manual unfreeze
                        </label>
                      </div>
                    </div>

                    {!editManualUnfreeze && (
                      <div className="mt-3">
                        <label className="text-xs font-medium text-slate-600">Auto Unfreeze After End (minutes)</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={editFreezeAfterMinutesText}
                          onChange={(e) => setEditFreezeAfterMinutesText(e.target.value)}
                          className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                        />
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-800">Contest Problems</h3>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowEditProblemPickerModal(true)}
                      className="px-3 py-1.5 text-xs border border-slate-300 rounded-md hover:bg-slate-50"
                    >
                      Add / Remove Problems
                    </button>
                    <button
                      type="button"
                      onClick={randomizeEditSelected}
                      disabled={editingContestPhase !== 'upcoming' || editSelected.length < 2}
                      className="px-3 py-1.5 text-xs border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50"
                    >
                      Random Arrangement
                    </button>
                  </div>
                </div>
                {editingContestPhase === 'running' && (
                  <p className="mt-2 text-xs text-amber-700">Running contest: existing problem order is locked. You can add or remove problems only.</p>
                )}

                <div className="mt-3 border border-slate-200 rounded-md overflow-hidden">
                  {editSelected.map((item, index) => (
                    <div
                      key={item.problemId}
                      draggable={editingContestPhase === 'upcoming'}
                      onDragStart={() => setEditDragIndex(index)}
                      onDragOver={(e) => editingContestPhase === 'upcoming' && e.preventDefault()}
                      onDrop={() => onEditDropAt(index)}
                      className="grid grid-cols-12 items-center gap-2 px-3 py-2 border-b border-slate-100 last:border-b-0 bg-white"
                    >
                      <div className="col-span-1 text-slate-400 cursor-grab">
                        <GripVertical size={16} />
                      </div>
                      <div className="col-span-1 text-xs font-semibold text-indigo-700">
                        {contestProblemLabel(index)}
                      </div>
                      <div className="col-span-7 text-sm text-slate-800">
                        <p>{item.title}</p>
                        <p className="text-xs text-slate-500">{item.problemCode ?? item.problemId}</p>
                      </div>
                      {editType === 'score_based' && (
                        <div className="col-span-2">
                          <input
                            type="number"
                            value={item.score ?? 100}
                            onChange={(e) => {
                              const value = Number(e.target.value || 0);
                              setEditSelected((prev) => prev.map((p) => (p.problemId === item.problemId ? { ...p, score: value } : p)));
                            }}
                            className="w-full border border-slate-300 rounded-md px-2 py-1 text-xs"
                          />
                        </div>
                      )}
                      {editType !== 'score_based' && <div className="col-span-2" />}
                      <div className="col-span-1 text-right">
                        <button type="button" onClick={() => removeEditProblem(item.problemId)} className="text-red-500 hover:text-red-700">
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {!editSelected.length && <p className="text-sm text-slate-500 p-4">Pick problems to include in this contest.</p>}
                </div>
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditContestModal(false);
                    resetEditContestForm();
                  }}
                  className="px-4 py-2 border border-slate-300 rounded-md text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => updateMutation.mutate()}
                  disabled={updateMutation.isPending}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-md text-sm font-medium"
                >
                  {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          )}
        </Modal>

        <Modal
          open={showEditProblemPickerModal}
          title="Select Problems for Contest"
          onClose={() => setShowEditProblemPickerModal(false)}
          maxWidthClass="max-w-3xl"
        >
          <div className="space-y-3">
            <div>
              <input
                value={editProblemSearchText}
                onChange={(e) => setEditProblemSearchText(e.target.value)}
                placeholder="Search by title, problem code, or ID"
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>

            <div className="border border-slate-200 rounded-md max-h-80 overflow-auto divide-y divide-slate-100">
              {filteredEditProblems.map((problem) => {
                const checked = editCheckedProblemIds.includes(problem.id);
                return (
                  <label key={problem.id} className="flex items-start gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleEditCheckedProblem(problem.id)}
                      className="mt-1"
                    />
                    <div>
                      <p className="text-sm font-medium text-slate-800">{problem.title}</p>
                      <p className="text-xs text-slate-500">{problem.problemCode ?? problem.id}</p>
                    </div>
                  </label>
                );
              })}
              {!filteredEditProblems.length && (
                <p className="text-sm text-slate-500 p-4">No matching problems found.</p>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowEditProblemPickerModal(false)}
                className="px-4 py-2 border border-slate-300 rounded-md text-sm"
              >
                Close
              </button>
              <button
                type="button"
                onClick={addCheckedProblemsForEdit}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-sm font-medium"
              >
                Add Selected
              </button>
            </div>
          </div>
        </Modal>

        <Modal
          open={showProblemPickerModal}
          title="Select Contest Problems"
          onClose={() => setShowProblemPickerModal(false)}
          maxWidthClass="max-w-3xl"
        >
          <div className="space-y-3">
            <div>
              <input
                value={problemSearchText}
                onChange={(e) => setProblemSearchText(e.target.value)}
                placeholder="Search by title, problem code, or ID"
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>

            <div className="border border-slate-200 rounded-md max-h-80 overflow-auto divide-y divide-slate-100">
              {filteredProblems.map((problem) => {
                const checked = checkedProblemIds.includes(problem.id);
                return (
                  <label key={problem.id} className="flex items-start gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCheckedProblem(problem.id)}
                      className="mt-1"
                    />
                    <div>
                      <p className="text-sm font-medium text-slate-800">{problem.title}</p>
                      <p className="text-xs text-slate-500">{problem.problemCode ?? problem.id}</p>
                    </div>
                  </label>
                );
              })}
              {!filteredProblems.length && (
                <p className="text-sm text-slate-500 p-4">No matching problems found.</p>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowProblemPickerModal(false)}
                className="px-4 py-2 border border-slate-300 rounded-md text-sm"
              >
                Close
              </button>
              <button
                type="button"
                onClick={addCheckedProblems}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-sm font-medium"
              >
                Add Selected
              </button>
            </div>
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
              <label className="text-xs font-medium text-slate-600">Participant CSV File</label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const selectedFile = e.target.files?.[0] ?? null;
                  void onParticipantCsvSelected(selectedFile);
                }}
                className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
              <p className="text-xs text-slate-500 mt-1">CSV must contain one column: participant name.</p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-slate-700">Participant Names</p>
                  <p className="text-xs text-slate-500">
                    {participantCsvFileName
                      ? `${participantCsvFileName} · ${participantNames.length} rows loaded`
                      : 'Choose a CSV file to load rows'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addParticipantRow}
                  className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-md hover:bg-slate-100"
                >
                  Add Row
                </button>
              </div>

              <div className="mt-3 max-h-56 overflow-auto space-y-2">
                {participantNames.length ? participantNames.map((name, index) => (
                  <div key={`participant-name-${index}`} className="flex items-center gap-2">
                    <span className="w-8 shrink-0 text-right text-xs text-slate-500">{index + 1}.</span>
                    <input
                      value={name}
                      onChange={(e) => updateParticipantNameAt(index, e.target.value)}
                      placeholder="Participant name"
                      className="flex-1 border border-slate-300 rounded-md px-3 py-1.5 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => removeParticipantRow(index)}
                      className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-md hover:bg-slate-100"
                    >
                      Delete
                    </button>
                  </div>
                )) : (
                  <p className="text-xs text-slate-500">No rows loaded yet.</p>
                )}
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
