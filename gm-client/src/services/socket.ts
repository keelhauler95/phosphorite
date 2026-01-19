import { io, Socket } from 'socket.io-client';
import { SocketEvent, SocketEventPayload } from '../types';

// Use relative URL for production (nginx proxies /socket.io to backend)
// In development, Vite's proxy handles this
const SOCKET_URL = window.location.origin;

class SocketService {
  private socket: Socket | null = null;

  connect() {
    if (this.socket?.connected) {
      return this.socket;
    }

    this.socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      console.log('Connected to server:', this.socket?.id);
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  on(event: SocketEvent, callback: (payload: SocketEventPayload) => void) {
    if (!this.socket) {
      console.warn('Socket not connected');
      return;
    }
    this.socket.on(event, callback);
  }

  off(event: SocketEvent, callback?: (payload: SocketEventPayload) => void) {
    if (!this.socket) return;
    if (callback) {
      this.socket.off(event, callback);
    } else {
      this.socket.off(event);
    }
  }

  emit(event: SocketEvent, data?: any) {
    if (!this.socket) {
      console.warn('Socket not connected');
      return;
    }
    this.socket.emit(event, data);
  }

  requestSync() {
    this.emit(SocketEvent.SYNC_REQUEST);
  }

  getSocket() {
    return this.socket;
  }
}

export default new SocketService();
