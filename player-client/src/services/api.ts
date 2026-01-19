import { Character, GameApp, Message, GameTimeState } from '../types';

const API_BASE = '/api';

// Character authentication
export const charactersApi = {
  async login(username: string, password: string): Promise<Character> {
    const response = await fetch(`${API_BASE}/characters/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Login failed');
    }

    return response.json();
  },

  async getAll(): Promise<Character[]> {
    const response = await fetch(`${API_BASE}/characters`);
    if (!response.ok) throw new Error('Failed to fetch characters');
    return response.json();
  }
};

// Apps
export const appsApi = {
  async getAll(): Promise<GameApp[]> {
    const response = await fetch(`${API_BASE}/apps`);
    if (!response.ok) throw new Error('Failed to fetch apps');
    return response.json();
  },

  async getById(id: string): Promise<GameApp> {
    const response = await fetch(`${API_BASE}/apps/${id}`);
    if (!response.ok) throw new Error('Failed to fetch app');
    return response.json();
  },

  async getByUser(username: string): Promise<GameApp[]> {
    const apps = await this.getAll();
    return apps.filter(app => 
      app.allowed_users.includes(username) || app.allowed_users.includes('*')
    );
  }
};

// Messages
export const messagesApi = {
  async getAll(): Promise<Message[]> {
    const response = await fetch(`${API_BASE}/messages`);
    if (!response.ok) throw new Error('Failed to fetch messages');
    return response.json();
  },

  async getByRecipient(username: string): Promise<Message[]> {
    const response = await fetch(`${API_BASE}/messages/inbox/${username}`);
    if (!response.ok) throw new Error('Failed to fetch inbox messages');
    return response.json();
  },

  async getSentByUser(username: string): Promise<Message[]> {
    const response = await fetch(`${API_BASE}/messages/sent/${username}`);
    if (!response.ok) throw new Error('Failed to fetch sent messages');
    return response.json();
  },

  async create(message: { sender: string; recipients: string[]; subject: string; body: string }): Promise<Message> {
    const response = await fetch(`${API_BASE}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    });
    if (!response.ok) throw new Error('Failed to create message');
    return response.json();
  },

  async markAsRead(messageId: string, username: string): Promise<void> {
    const response = await fetch(`${API_BASE}/messages/${messageId}/read-status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, is_read: true })
    });

    if (!response.ok) throw new Error('Failed to mark message as read');
  }
};

// Game time
export const gameTimeApi = {
  async getCurrent(): Promise<GameTimeState> {
    const response = await fetch(`${API_BASE}/game-time`);
    if (!response.ok) throw new Error('Failed to fetch game time');
    return response.json();
  }
};

// Settings
export const settingsApi = {
  async getAll(): Promise<Record<string, string>> {
    const response = await fetch(`${API_BASE}/settings`);
    if (!response.ok) throw new Error('Failed to fetch settings');
    return response.json();
  }
};

// Terminal
export const terminalApi = {
  async executeCommand(appId: string, username: string, input: string): Promise<{
    status: 'auto-responded' | 'pending' | 'error';
    executionId?: string;
    response: string;
    currentPath?: string;
  }> {
    const response = await fetch(`${API_BASE}/terminal/${appId}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, input })
    });

    if (!response.ok) throw new Error('Failed to execute command');
    return response.json();
  },

  async getExecutionStatus(appId: string, executionId: string): Promise<any> {
    const response = await fetch(`${API_BASE}/terminal/${appId}/execution/${executionId}`);
    if (!response.ok) throw new Error('Failed to fetch execution status');
    return response.json();
  }
};
