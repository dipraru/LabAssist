import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { Upload, FileText, ChevronDown, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';

function courseCode(course: any): string {
  return course?.courseCode ?? course?.code ?? 'N/A';
}

function courseTitle(course: any): string {
  return course?.title ?? course?.name ?? 'Untitled Course';
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  graded: 'bg-green-100 text-green-700',
  late: 'bg-orange-100 text-orange-700',
  submitted: 'bg-blue-100 text-blue-700',
};

export function StudentAssignments() {
  const qc = useQueryClient();
  const [filterCourse, setFilterCourse] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<{ [key: string]: File }>({});
  const [notes, setNotes] = useState<{ [key: string]: string }>({});
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'submitted' | 'overdue'>('all');
  const [sortBy, setSortBy] = useState<'due_asc' | 'due_desc' | 'marks_desc'>('due_asc');

  const { data: courses = [], isLoading: coursesLoading } = useQuery({
    queryKey: ['student-courses'],
    queryFn: () => api.get('/courses/my').then(r => r.data),
  });

  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery({
    queryKey: ['student-assignments', filterCourse],
    queryFn: () => api.get(`/assignments/course/${filterCourse}`).then(r => r.data),
    enabled: !!filterCourse,
  });

  useEffect(() => {
    if (!filterCourse && (courses as any[]).length > 0) {
      setFilterCourse((courses as any[])[0].id);
    }
  }, [courses, filterCourse]);

  const submitMutation = useMutation({
    mutationFn: ({ id, file, note }: { id: string; file: File; note: string }) => {
      const fd = new FormData();
      fd.append('file', file);
      if (note) fd.append('notes', note);
      return api.post(`/assignments/${id}/submit`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: (_, vars) => {
      toast.success('Submitted!');
      setUploadFile(prev => { const n = { ...prev }; delete n[vars.id]; return n; });
      setNotes(prev => { const n = { ...prev }; delete n[vars.id]; return n; });
      qc.invalidateQueries({ queryKey: ['student-assignments'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Submission failed'),
  });

  const isExpired = (deadline: string) => new Date(deadline) < new Date();

  const visibleAssignments = useMemo(() => {
    const nowMs = Date.now();
    const list = [...((assignments as any[]) ?? [])];

    const filtered = list.filter((a: any) => {
      const hasSubmission = Boolean(a?.mySubmission);
      const deadlineMs = a?.deadline ? new Date(a.deadline).getTime() : null;
      const overdue = deadlineMs != null && Number.isFinite(deadlineMs) && deadlineMs < nowMs;

      if (statusFilter === 'pending') return !hasSubmission && !(overdue && !a?.allowLateSubmission);
      if (statusFilter === 'submitted') return hasSubmission;
      if (statusFilter === 'overdue') return overdue && !hasSubmission;
      return true;
    });

    filtered.sort((a: any, b: any) => {
      const aDeadline = a?.deadline ? new Date(a.deadline).getTime() : Number.POSITIVE_INFINITY;
      const bDeadline = b?.deadline ? new Date(b.deadline).getTime() : Number.POSITIVE_INFINITY;
      if (sortBy === 'due_desc') return bDeadline - aDeadline;
      if (sortBy === 'marks_desc') return (b?.totalMarks ?? 0) - (a?.totalMarks ?? 0);
      return aDeadline - bDeadline;
    });

    return filtered;
  }, [assignments, statusFilter, sortBy]);

  return (
    <AppShell>
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold text-slate-900 mb-6">Assignments</h1>

        <div className="mb-4">
          {coursesLoading ? (
            <div className="h-10 w-64 bg-slate-100 rounded-lg animate-pulse" />
          ) : (
            <select value={filterCourse} onChange={e => setFilterCourse(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm">
              <option value="">- select course -</option>
              {(courses as any[]).map((c: any) => <option key={c.id} value={c.id}>{courseCode(c)} - {courseTitle(c)}</option>)}
            </select>
          )}
        </div>

        <div className="space-y-3">
          {!!filterCourse && !assignmentsLoading && (
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-100 rounded-xl p-3">
              <div className="flex flex-wrap gap-2">
                {[
                  { key: 'all', label: 'All' },
                  { key: 'pending', label: 'Pending' },
                  { key: 'submitted', label: 'Submitted' },
                  { key: 'overdue', label: 'Overdue' },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setStatusFilter(item.key as 'all' | 'pending' | 'submitted' | 'overdue')}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                      statusFilter === item.key
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'due_asc' | 'due_desc' | 'marks_desc')}
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
              >
                <option value="due_asc">Sort: Due Soon</option>
                <option value="due_desc">Sort: Latest Due</option>
                <option value="marks_desc">Sort: Highest Marks</option>
              </select>
            </div>
          )}

          {assignmentsLoading && !!filterCourse && (
            <>
              {[1, 2].map((k) => (
                <div key={k} className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 animate-pulse">
                  <div className="h-4 w-44 bg-slate-100 rounded mb-2" />
                  <div className="h-3 w-56 bg-slate-100 rounded" />
                </div>
              ))}
            </>
          )}
          {visibleAssignments.map((a: any) => {
            const sub = a.mySubmission;
            const expired = isExpired(a.deadline);
            return (
              <div key={a.id} className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                <button onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50">
                  <div className="text-left">
                    <p className="font-semibold text-slate-800">{a.title}</p>
                    <p className="text-xs text-slate-500">
                      Due: {a.deadline?.slice(0,16).replace('T',' ')} · {a.totalMarks} marks
                      {expired && !a.allowLateSubmission && <span className="ml-2 text-red-500">Closed</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {sub && <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${STATUS_COLOR[sub.status] ?? 'bg-slate-100 text-slate-600'}`}>{sub.status}</span>}
                    {!sub && <span className="px-2 py-0.5 text-xs rounded-full bg-slate-100 text-slate-500">Not submitted</span>}
                    {expandedId === a.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </div>
                </button>

                {expandedId === a.id && (
                  <div className="border-t border-slate-100 px-5 py-4">
                    {a.caption && <p className="text-sm text-slate-600 mb-3">{a.caption}</p>}

                    {sub ? (
                      <div className="bg-slate-50 rounded-lg p-3 text-sm">
                        <p className="font-medium text-slate-700">Your Submission</p>
                        <p className="text-slate-500 text-xs mt-1">File: {sub.fileName}</p>
                        {sub.score != null && <p className="text-slate-700 mt-1">Score: <span className="font-bold">{sub.score}</span> / {a.totalMarks}</p>}
                        {sub.feedback && <p className="text-slate-600 mt-1">Feedback: {sub.feedback}</p>}
                        <a href={`/uploads/${sub.fileUrl}`} target="_blank" rel="noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline">
                          <FileText size={12} /> Download
                        </a>
                      </div>
                    ) : (
                      <div>
                        {(!expired || a.allowLateSubmission) ? (
                          <div className="space-y-3">
                            <div>
                              <label className="block text-sm font-medium text-slate-700 mb-1">Submit File (max 10MB)</label>
                              <label className={`flex items-center gap-2 px-4 py-3 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${uploadFile[a.id] ? 'border-indigo-400 bg-indigo-50' : 'border-slate-300 hover:border-slate-400'}`}>
                                <Upload size={16} className="text-slate-400" />
                                <span className="text-sm text-slate-600">{uploadFile[a.id] ? uploadFile[a.id].name : 'Choose file…'}</span>
                                <input type="file" className="hidden"
                                  onChange={e => { const f = e.target.files?.[0]; if (f) setUploadFile(prev => ({ ...prev, [a.id]: f })); }} />
                              </label>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-slate-700 mb-1">Notes (optional)</label>
                              <textarea value={notes[a.id] ?? ''} onChange={e => setNotes(prev => ({ ...prev, [a.id]: e.target.value }))}
                                rows={2} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none" />
                            </div>
                            <button
                              disabled={!uploadFile[a.id] || submitMutation.isPending}
                              onClick={() => submitMutation.mutate({ id: a.id, file: uploadFile[a.id], note: notes[a.id] ?? '' })}
                              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                              Submit
                            </button>
                          </div>
                        ) : (
                          <p className="text-sm text-red-500">Submission closed — deadline passed</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {filterCourse && !assignmentsLoading && !visibleAssignments.length && <p className="text-center text-slate-400 py-6">No assignments for current filters</p>}
          {!filterCourse && <p className="text-center text-slate-400 py-6">Select a course to see assignments</p>}
        </div>
      </div>
    </AppShell>
  );
}
