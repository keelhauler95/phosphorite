import axios from 'axios';
import {
  Character,
  GameApp,
  GameTime,
  GameTimeState,
  Message,
  Broadcast,
  BroadcastType,
  GamestatePayload,
  GamestatePreviewResponse,
  GamestateSummaryResponse,
  GamestateSection,
  TerminalExecuteResponse
} from '../types';

// Use relative URL for production (nginx proxies /api to backend)
// In development, Vite's proxy handles this
const API_BASE_URL = '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Characters API
export const charactersApi = {
  getAll: () => api.get<Character[]>('/characters'),
  getById: (id: number) => api.get<Character>(`/characters/${id}`),
  create: (data: Omit<Character, 'id' | 'created_at' | 'updated_at'>) =>
    api.post<Character>('/characters', data),
  update: (id: number, data: Partial<Omit<Character, 'id' | 'username'>>) =>
    api.patch<Character>(`/characters/${id}`, data),
  updateVisualEffects: (id: number, visual_effects: string[]) =>
    api.put<Character>(`/characters/${id}/visual-effects`, { visual_effects }),
  delete: (id: number) => api.delete(`/characters/${id}`)
};

// Apps API
export const appsApi = {
  getAll: (category?: string) => api.get<GameApp[]>('/apps', { params: { category } }),
  getById: (id: string) => api.get<GameApp>(`/apps/${id}`),
  create: (data: Omit<GameApp, 'id' | 'order_index' | 'created_at' | 'updated_at'>) =>
    api.post<GameApp>('/apps', data),
  update: (id: string, data: Partial<Omit<GameApp, 'id'>>) =>
    api.patch<GameApp>(`/apps/${id}`, data),
  reorder: (order: string[]) =>
    api.put<{ success: boolean; apps: GameApp[] }>('/apps/reorder', { order }),
  delete: (id: string) => api.delete(`/apps/${id}`)
};

// Game Time API
export const gameTimeApi = {
  getTime: () => api.get<GameTimeState>('/game-time'),
  setTime: (time: GameTime) => api.post<GameTimeState>('/game-time/set', time),
  pause: () => api.post<GameTimeState>('/game-time/pause'),
  resume: () => api.post<GameTimeState>('/game-time/resume'),
  advance: (params: { seconds?: number; minutes?: number; hours?: number; days?: number }) =>
    api.post<GameTimeState>('/game-time/advance', params),
  rollback: (params: { seconds?: number; minutes?: number; hours?: number; days?: number }) =>
    api.post<GameTimeState>('/game-time/rollback', params)
};

// Messages API
export const messagesApi = {
  getAll: () => api.get<Message[]>('/messages'),
  getById: (id: string) => api.get<Message>(`/messages/${id}`),
  getInbox: (username: string) => api.get<Message[]>(`/messages/inbox/${username}`),
  getSent: (username: string) => api.get<Message[]>(`/messages/sent/${username}`),
  create: (data: Omit<Message, 'id' | 'sent_at' | 'read_status' | 'created_at' | 'updated_at'>) =>
    api.post<Message>('/messages', data),
  update: (id: string, data: Partial<Omit<Message, 'id' | 'created_at' | 'updated_at'>>) =>
    api.patch<Message>(`/messages/${id}`, data),
  updateReadStatus: (id: string, username: string, is_read: boolean) =>
    api.patch<Message>(`/messages/${id}/read-status`, { username, is_read }),
  delete: (id: string) => api.delete(`/messages/${id}`)
};

// Broadcast API
export const broadcastApi = {
  send: (data: {
    type: BroadcastType;
    recipients: string[];
    content: string;
    mimeType?: string;
    duration: number;
  }) => api.post<{ success: boolean; broadcast: Broadcast }>('/broadcast', data)
};

// Gamestate API
export const gamestateApi = {
  export: async () => {
    const response = await api.get<GamestatePayload>('/gamestate/export');
    return response.data;
  },
  summary: () => api.get<GamestateSummaryResponse>('/gamestate/summary'),
  preview: (jsonContent: string) =>
    api.post<GamestatePreviewResponse>('/gamestate/preview', { jsonContent }),
  import: (payload: { jsonContent: string; sections: GamestateSection[] }) =>
    api.post<{ success: boolean; message: string; stats: Record<string, number>; appliedSections: GamestateSection[] }>('/gamestate/import', payload)
};

// Terminal API
export const terminalApi = {
  testCommand: (appId: string, payload: { username: string; input: string }) =>
    api.post<TerminalExecuteResponse>(`/terminal/${appId}/test`, payload)
};
