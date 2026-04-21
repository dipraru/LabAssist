import { useEffect, useState } from 'react';
import { getSocket } from '../lib/socket';
import { X } from 'lucide-react';

interface Announcement {
  id: string;
  title: string;
  body: string;
  isPinned?: boolean;
  createdAt: string;
}

export function AnnouncementModal() {
  const [queue, setQueue] = useState<Announcement[]>([]);

  useEffect(() => {
    const socket = getSocket();
    const handler = (data: Announcement) => {
      setQueue((prev) => [...prev, data]);
    };
    socket.on('announcement', handler);
    return () => { socket.off('announcement', handler); };
  }, []);

  if (!queue.length) return null;
  const current = queue[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/20">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
          <div className="min-w-0">
            <span className="text-xs font-extrabold uppercase tracking-[0.16em] text-teal-700">Contest Announcement</span>
            <h2 className="mt-1 text-xl font-extrabold text-slate-950">{current.title}</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">{new Date(current.createdAt).toLocaleString()}</p>
          </div>
          <button
            type="button"
            onClick={() => setQueue((q) => q.slice(1))}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Dismiss announcement"
          >
            <X size={20} />
          </button>
        </div>
        <div className="px-6 py-5">
          <p className="whitespace-pre-wrap text-sm font-semibold leading-7 text-slate-700">{current.body}</p>
        </div>
        <div className="flex justify-end border-t border-slate-100 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={() => setQueue((q) => q.slice(1))}
            className="oj-btn-primary px-4 py-2 text-sm"
          >
            Dismiss {queue.length > 1 ? `(${queue.length - 1} more)` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
