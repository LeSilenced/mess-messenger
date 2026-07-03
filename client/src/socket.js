import { io } from 'socket.io-client';

let socket = null;

export function getSocket(token) {
  if (socket?.connected) return socket;
  if (socket) socket.disconnect();

  socket = io(window.location.origin, {
    auth: { token },
    transports: ['websocket', 'polling'],
  });
  return socket;
}

export function disconnectSocket() {
  stopPresenceHeartbeat();
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

let heartbeatTimer = null;

export function startPresenceHeartbeat(sock) {
  stopPresenceHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (sock?.connected) sock.emit('heartbeat');
  }, 45000);
}

export function stopPresenceHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}
