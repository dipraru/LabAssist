import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const token = localStorage.getItem('kuetoj_token');
    socket = io('/notifications', {
      auth: { token },
      transports: ['websocket'],
      autoConnect: true,
    });
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function joinContest(contestId: string) {
  getSocket().emit('join-contest', { contestId });
}

export function leaveContest(contestId: string) {
  getSocket().emit('leave-contest', { contestId });
}
