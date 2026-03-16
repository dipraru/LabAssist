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
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
        <div className="flex items-start justify-between mb-3">
          <div>
            <span className="text-xs font-medium text-indigo-600 uppercase tracking-wider">
              Contest Announcement
            </span>
            <h2 className="text-lg font-bold text-slate-900 mt-0.5">{current.title}</h2>
          </div>
          <button
            onClick={() => setQueue((q) => q.slice(1))}
            className="text-slate-400 hover:text-slate-600 ml-4"
          >
            <X size={20} />
          </button>
        </div>
        <p className="text-slate-700 whitespace-pre-wrap">{current.body}</p>
        <div className="mt-4 flex justify-end">
          <button
            onClick={() => setQueue((q) => q.slice(1))}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            Dismiss {queue.length > 1 ? `(${queue.length - 1} more)` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
