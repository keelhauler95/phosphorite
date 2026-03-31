import { io, Socket } from 'socket.io-client';
import { SocketEvent } from '../types';
import { getSocketUrl } from '../utils/runtimeConfig';

class SocketService {
  private socket: Socket | null = null;
  private listeners: Map<string, Set<Function>> = new Map();

  connect() {
    if (this.socket?.connected) {
      return this.socket;
    }

    this.socket = io(getSocketUrl(), {
      transports: ['websocket'],
      autoConnect: true
    });

    this.socket.on('connect', () => {
      console.log('Socket connected');
    });

    this.socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    // Set up event forwarding
    this.socket.onAny((eventName, ...args) => {
      const handlers = this.listeners.get(eventName);
      if (handlers) {
        handlers.forEach(handler => handler(...args));
      }
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  on(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    // Return unsubscribe function
    return () => {
      const handlers = this.listeners.get(event);
      if (handlers) {
        handlers.delete(callback);
      }
    };
  }

  emit(event: string, data?: any) {
    if (this.socket) {
      this.socket.emit(event, data);
    }
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  requestSync() {
    this.emit(SocketEvent.SYNC_REQUEST);
  }
}

export const socketService = new SocketService();
