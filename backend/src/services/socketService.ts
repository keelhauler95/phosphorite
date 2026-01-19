import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { SocketEvent, SocketEventPayload, Character } from '../types';
import CharacterRepository from '../repositories/CharacterRepository';
import AppRepository from '../repositories/AppRepository';
import { messageRepository } from '../repositories/MessageRepository';
import { getDatabase } from '../db/database';
import gameTimeService from './gameTimeService';
import { persistPlayerActivity } from './playerActivityService';

function getSettingsSnapshot(): Record<string, string> {
  try {
    const db = getDatabase();
    const result = db.exec('SELECT key, value FROM settings');

    if (!result[0]) {
      return {};
    }

    return result[0].values.reduce((acc: Record<string, string>, row: any[]) => {
      acc[row[0]] = row[1];
      return acc;
    }, {});
  } catch (error) {
    console.error('Failed to build settings snapshot for sync:', error);
    return {};
  }
}

let io: SocketIOServer | null = null;
const playerSockets: Map<number, Socket> = new Map();

function broadcastPlayerActivity(characterId: number, character: Character, appChanged: boolean) {
  if (appChanged) {
    emitSocketEvent(SocketEvent.CHARACTER_APP_CHANGED, {
      characterId,
      appId: character.current_app_id,
      character
    });
  }

  emitSocketEvent(SocketEvent.CHARACTER_ACTIVITY_UPDATED, {
    characterId,
    appId: character.current_app_id,
    section: character.current_section,
    lastActivityAt: character.last_activity_at,
    character
  });
}

export function initializeSocketIO(server: HTTPServer) {
  io = new SocketIOServer(server, {
    cors: {
      origin: '*', // Configure this properly in production
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);

    socket.data = socket.data || {};
    socket.data.characterId = socket.data.characterId || undefined;
    socket.data.skipDisconnectActivity = false;

    socket.on(SocketEvent.PLAYER_SESSION_BIND, async (payload: any) => {
      try {
        const characterId = Number(payload?.characterId);
        if (!characterId || Number.isNaN(characterId)) {
          return;
        }

        const previousCharacterId = socket.data.characterId;
        if (previousCharacterId && previousCharacterId !== characterId) {
          const boundSocket = playerSockets.get(previousCharacterId);
          if (boundSocket && boundSocket.id === socket.id) {
            playerSockets.delete(previousCharacterId);
          }
        }

        const existingSocket = playerSockets.get(characterId);
        if (existingSocket && existingSocket.id !== socket.id) {
          existingSocket.data = existingSocket.data || {};
          existingSocket.data.skipDisconnectActivity = true;
          existingSocket.emit(SocketEvent.PLAYER_SESSION_CONFLICT, {
            message: 'Session terminated: login detected on another terminal.',
            characterId
          });

          try {
            const { character, appChanged } = await persistPlayerActivity({
              characterId,
              current_app_id: null,
              section: 'Session conflict'
            });
            broadcastPlayerActivity(characterId, character, appChanged);
          } catch (error) {
            console.error('Failed to persist activity for session conflict:', error);
          }

          playerSockets.delete(characterId);
          existingSocket.data.characterId = undefined;
          existingSocket.disconnect(true);
        }

        socket.data.characterId = characterId;
        socket.data.skipDisconnectActivity = false;
        playerSockets.set(characterId, socket);
      } catch (error) {
        console.error('Failed to bind player session:', error);
      }
    });

    socket.on(SocketEvent.PLAYER_SESSION_UNBIND, (payload: any = {}) => {
      const rawId = payload?.characterId ?? socket.data.characterId;
      const characterId = typeof rawId === 'number' ? rawId : Number(rawId);
      if (!characterId || Number.isNaN(characterId)) {
        return;
      }

      if (playerSockets.get(characterId)?.id === socket.id) {
        playerSockets.delete(characterId);
      }

      socket.data.characterId = undefined;
      socket.data.skipDisconnectActivity = Boolean(payload?.suppressDisconnectActivity);
    });

    socket.on(SocketEvent.PLAYER_ACTIVITY_REPORT, async (payload: any) => {
      try {
        const characterId = Number(payload?.characterId);
        if (!characterId || Number.isNaN(characterId)) {
          return;
        }

        const { character, appChanged } = await persistPlayerActivity({
          characterId,
          current_app_id: payload?.current_app_id ?? undefined,
          section: payload?.section ?? undefined,
          last_activity_at: typeof payload?.last_activity_at === 'string' ? payload.last_activity_at : undefined
        });

        broadcastPlayerActivity(characterId, character, appChanged);
      } catch (error) {
        console.error('Failed to persist player activity via socket:', error);
      }
    });

    // Handle sync request - send full game state
    socket.on(SocketEvent.SYNC_REQUEST, async () => {
      try {
        const characters = CharacterRepository.findAll();
        const apps = AppRepository.findAll();
        const gameTime = gameTimeService.getState();
        const [messages, settings] = await Promise.all([
          messageRepository.findAll(),
          Promise.resolve(getSettingsSnapshot())
        ]);

        const payload: SocketEventPayload = {
          event: SocketEvent.SYNC_RESPONSE,
          data: {
            characters,
            apps,
            messages,
            settings,
            gameTime
          },
          timestamp: Date.now()
        };

        socket.emit(SocketEvent.SYNC_RESPONSE, payload);
      } catch (error) {
        console.error('Failed to process sync request:', error);
      }
    });

    // Notify all clients when someone connects
    emitSocketEvent(SocketEvent.CLIENT_CONNECTED, {
      socketId: socket.id,
      timestamp: Date.now()
    });

    socket.on('disconnect', async () => {
      console.log(`Client disconnected: ${socket.id}`);

      const characterId: number | undefined = socket.data?.characterId;
      if (characterId && playerSockets.get(characterId)?.id === socket.id) {
        playerSockets.delete(characterId);
      }

      if (characterId && !socket.data?.skipDisconnectActivity) {
        try {
          const { character, appChanged } = await persistPlayerActivity({
            characterId,
            current_app_id: null,
            section: 'IDLE'
          });
          broadcastPlayerActivity(characterId, character, appChanged);
        } catch (error) {
          console.error('Failed to persist disconnect activity:', error);
        }
      }

      emitSocketEvent(SocketEvent.CLIENT_DISCONNECTED, {
        socketId: socket.id,
        timestamp: Date.now()
      });
    });
  });

  console.log('Socket.IO initialized');
  return io;
}

export function emitSocketEvent(event: SocketEvent, data: any) {
  if (!io) {
    console.warn('Socket.IO not initialized, cannot emit event:', event);
    return;
  }

  const payload: SocketEventPayload = {
    event,
    data,
    timestamp: Date.now()
  };

  io.emit(event, payload);
  console.log(`Emitted event: ${event}`, data);
}

export function getIO(): SocketIOServer | null {
  return io;
}
