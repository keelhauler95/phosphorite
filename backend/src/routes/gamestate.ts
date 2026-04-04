import { Router, Request, Response } from 'express';
import { getDatabase, saveDatabase } from '../db/database';
import gameTimeService from '../services/gameTimeService';
import CharacterRepository from '../repositories/CharacterRepository';
import AppRepository from '../repositories/AppRepository';
import { messageRepository } from '../repositories/MessageRepository';
import { emitSocketEvent } from '../services/socketService';
import { GameTimeState, SocketEvent } from '../types';

const router = Router();

type GameStateSection = 'gameTime' | 'characters' | 'apps' | 'messages' | 'settings';
const GAMESTATE_VERSION = '2.0.0';
const DEFAULT_SECTIONS: GameStateSection[] = ['gameTime', 'characters', 'apps', 'messages', 'settings'];

interface SettingsRow {
  key: string;
  value: string;
}

interface GameState {
  version: string;
  exportedAt: string;
  gameTime: GameTimeState;
  characters: Record<string, any>[];
  apps: Record<string, any>[];
  messages: Record<string, any>[];
  settings: SettingsRow[];
  selectedSections?: GameStateSection[];
}

const ensureArray = <T>(value: T | T[] | undefined): T[] => {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
};

const rowsFromResult = (result: any[]) => {
  if (!result[0]) {
    return [] as Record<string, any>[];
  }
  const { columns, values } = result[0];
  return values.map((row: any[]) => {
    const obj: Record<string, any> = {};
    columns.forEach((col: string, idx: number) => {
      obj[col] = row[idx];
    });
    return obj;
  });
};

const getSettingsSnapshot = (): Record<string, string> => {
  try {
    const db = getDatabase();
    const rows = rowsFromResult(db.exec('SELECT key, value FROM settings'));
    return rows.reduce((acc: Record<string, string>, row: Record<string, any>) => {
      const key = row.key;
      if (typeof key === 'string') {
        const rawValue = row.value;
        acc[key] = typeof rawValue === 'string' ? rawValue : String(rawValue ?? '');
      }
      return acc;
    }, {} as Record<string, string>);
  } catch (error) {
    console.error('Failed to build settings snapshot:', error);
    return {};
  }
};

const emitGamestateSync = async (stats?: Record<GameStateSection, number>) => {
  try {
    const [messages, settings] = await Promise.all([
      messageRepository.findAll(),
      Promise.resolve(getSettingsSnapshot())
    ]);

    emitSocketEvent(SocketEvent.SYNC_RESPONSE, {
      characters: CharacterRepository.findAll(),
      apps: AppRepository.findAll(),
      messages,
      settings,
      gameTime: gameTimeService.getState(),
      meta: {
        reason: 'gamestate:import',
        stats
      }
    });
  } catch (error) {
    console.error('Failed to emit gamestate sync event:', error);
  }
};

const parseJsonField = (value: any): any => {
  if (typeof value !== 'string') {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const deepParseJson = (obj: any): any => {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj === 'string') {
    const parsed = parseJsonField(obj);
    if (parsed !== obj) {
      return deepParseJson(parsed);
    }
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => deepParseJson(item));
  }
  
  if (typeof obj === 'object') {
    const result: Record<string, any> = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        result[key] = deepParseJson(obj[key]);
      }
    }
    return result;
  }
  
  return obj;
};

const stringifyJsonField = (value: any): string => {
  if (typeof value === 'string') {
    return value;
  }
  if (value === null || value === undefined) {
    return '';
  }
  return JSON.stringify(value);
};

const buildSnapshot = (): GameState => {
  const db = getDatabase();
  const characters = rowsFromResult(db.exec('SELECT * FROM characters'));

  if (characters.length) {
    characters.forEach((character: Record<string, any>) => {
      if (character.visual_effects === undefined) {
        character.visual_effects = '[]';
      }
      character.visual_effects = parseJsonField(character.visual_effects);
      character.created_at = deepParseJson(parseJsonField(character.created_at));
      character.updated_at = deepParseJson(parseJsonField(character.updated_at));
    });
  }

  const apps = rowsFromResult(db.exec('SELECT * FROM apps'));
  apps.forEach((app: Record<string, any>) => {
    app.allowed_users = parseJsonField(app.allowed_users);
    app.data = parseJsonField(app.data);
    app.created_at = parseJsonField(app.created_at);
    app.updated_at = parseJsonField(app.updated_at);
  });

  const messages = rowsFromResult(db.exec('SELECT * FROM messages'));
  messages.forEach((message: Record<string, any>) => {
    message.recipients = deepParseJson(parseJsonField(message.recipients));
    message.read_status = deepParseJson(parseJsonField(message.read_status));
    message.sent_at = deepParseJson(parseJsonField(message.sent_at));
    message.created_at = deepParseJson(parseJsonField(message.created_at));
    message.updated_at = deepParseJson(parseJsonField(message.updated_at));
  });

  const settings = rowsFromResult(db.exec('SELECT * FROM settings')) as SettingsRow[];
  settings.forEach((setting: Record<string, any>) => {
    setting.value = deepParseJson(parseJsonField(setting.value));
  });

  return {
    version: GAMESTATE_VERSION,
    exportedAt: new Date().toISOString(),
    gameTime: gameTimeService.getState(),
    characters,
    apps,
    messages,
    settings,
    selectedSections: [...DEFAULT_SECTIONS]
  };
};

const extractSelectedSections = (value: unknown): GameStateSection[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const recognized: GameStateSection[] = [];
  value.forEach((entry) => {
    if (typeof entry !== 'string') {
      return;
    }
    const normalized = entry.trim() as GameStateSection;
    if (DEFAULT_SECTIONS.includes(normalized) && !recognized.includes(normalized)) {
      recognized.push(normalized);
    }
  });
  return recognized.length ? recognized : undefined;
};

const coerceNumber = (value: unknown, fallback = 0) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : fallback;
  }
  return fallback;
};

const coerceBoolean = (value: unknown, fallback = true) => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    return !['false', '0', 'no'].includes(value.toLowerCase());
  }
  return fallback;
};

const extractSectionArray = (value: any, nestedKey?: string) => {
  if (Array.isArray(value)) {
    return value;
  }
  if (nestedKey && value && typeof value === 'object' && Array.isArray(value[nestedKey])) {
    return value[nestedKey];
  }
  return ensureArray(value);
};

const normalizeSettingValue = (value: unknown): string => {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const normalizeAllowedUsers = (value: unknown): string[] => {
  if (value === undefined || value === null) {
    return [];
  }

  const candidate = parseJsonField(value);

  const normalizeEntries = (entries: unknown[]): string[] => {
    const deduped = new Set(
      entries
        .map((entry) => {
          if (typeof entry === 'string') {
            return entry.trim();
          }
          if (entry && typeof entry === 'object') {
            if (typeof (entry as any).username === 'string') {
              return (entry as any).username.trim();
            }
            if (typeof (entry as any).value === 'string') {
              return (entry as any).value.trim();
            }
          }
          return '';
        })
        .filter(Boolean)
    );
    return Array.from(deduped);
  };

  if (Array.isArray(candidate)) {
    return normalizeEntries(candidate);
  }

  if (typeof candidate === 'string') {
    const trimmed = candidate.trim();
    if (!trimmed) {
      return [];
    }
    if (trimmed === '*' || trimmed.toLowerCase() === 'all') {
      return ['*'];
    }
    if (trimmed.includes(',')) {
      return normalizeEntries(trimmed.split(','));
    }

    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      const reparsed = parseJsonField(trimmed);
      if (Array.isArray(reparsed)) {
        return normalizeEntries(reparsed);
      }
      if (reparsed && typeof reparsed === 'object') {
        const nestedList =
          (reparsed as any).allowed_users ??
          (reparsed as any).allowedUsers ??
          (reparsed as any).users ??
          (reparsed as any).list;
        if (nestedList !== undefined) {
          return normalizeAllowedUsers(nestedList);
        }
      }
    }

    return [trimmed];
  }

  if (candidate && typeof candidate === 'object') {
    const nestedList =
      (candidate as any).allowed_users ??
      (candidate as any).allowedUsers ??
      (candidate as any).users ??
      (candidate as any).list;
    if (nestedList !== undefined) {
      return normalizeAllowedUsers(nestedList);
    }
  }

  return [];
};

const parseJsonDocument = (jsonContent: string): GameState => {
  let parsed: any;
  try {
    parsed = JSON.parse(jsonContent);
  } catch (error) {
    throw new Error('Invalid gamestate JSON: unable to parse content');
  }

  const root = parsed?.GameState || parsed?.gamestate || parsed;
  if (!root || typeof root !== 'object') {
    throw new Error('Invalid gamestate JSON: missing GameState root node');
  }

  const rawGameTime = root.GameTime || root.gameTime;
  const gameTime: GameTimeState = rawGameTime ? {
    era: coerceNumber(rawGameTime.era, 0),
    day: coerceNumber(rawGameTime.day, 1),
    hour: coerceNumber(rawGameTime.hour, 0),
    minute: coerceNumber(rawGameTime.minute, 0),
    second: coerceNumber(rawGameTime.second, 0),
    is_paused: coerceBoolean(rawGameTime.is_paused, true),
    real_time_ref: coerceNumber(rawGameTime.real_time_ref, Date.now())
  } : gameTimeService.getState();

  const settingsRaw = extractSectionArray(root.Settings || root.settings, 'Setting');
  const settings: SettingsRow[] = settingsRaw
    .map((setting: any) => {
      if (!setting || typeof setting !== 'object') {
        return null;
      }
      const key = setting.key ?? setting.Key;
      if (!key) {
        return null;
      }
      const rawValue = setting.value ?? setting.Value ?? '';
      return {
        key,
        value: normalizeSettingValue(rawValue)
      };
    })
    .filter(Boolean) as SettingsRow[];

  const toObjects = (collection: any[]): Record<string, any>[] =>
    collection.filter((entry) => entry && typeof entry === 'object');

  const rawApps = toObjects(extractSectionArray(root.apps || root.Apps, 'App'));
  const normalizedApps = rawApps.map((app) => {
    const allowedUsersSource =
      app.allowed_users ??
      app.allowedUsers ??
      app.users ??
      app.allowed ??
      app.access?.allowed_users ??
      app.access?.allowedUsers ??
      app.access?.users ??
      app.permissions;

    return {
      ...app,
      allowed_users: normalizeAllowedUsers(allowedUsersSource)
    };
  });

  return {
    version: typeof root.version === 'string' ? root.version : GAMESTATE_VERSION,
    exportedAt: typeof root.exportedAt === 'string' ? root.exportedAt : new Date().toISOString(),
    gameTime,
    characters: toObjects(extractSectionArray(root.characters || root.Characters, 'Character')),
    apps: normalizedApps,
    messages: toObjects(extractSectionArray(root.messages || root.Messages, 'Message')),
    settings,
    selectedSections: extractSelectedSections(root.selectedSections || root.__selectedSections || root.sections)
  };
};

const summarizeState = (state: GameState) => ({
  characters: state.characters.length,
  apps: state.apps.length,
  messages: state.messages.length,
  settings: state.settings.length
});

const normalizeSections = (sections: unknown): GameStateSection[] => {
  if (!Array.isArray(sections)) {
    return [...DEFAULT_SECTIONS];
  }

  const recognized: GameStateSection[] = [];
  sections.forEach((section) => {
    if (typeof section !== 'string') {
      return;
    }
    const normalized = section.trim().toLowerCase() as GameStateSection;
    if (DEFAULT_SECTIONS.includes(normalized) && !recognized.includes(normalized)) {
      recognized.push(normalized);
    }
  });

  return recognized.length ? recognized : [...DEFAULT_SECTIONS];
};

const GAME_TIME_FIELD_PATTERN = /(timestamp|created_at|updated_at|sent_at|last_activity_at)$/i;

const looksLikeGameTimeObject = (value: any): boolean => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const keys: Array<keyof GameTimeState> = ['era', 'day', 'hour', 'minute', 'second'];
  return keys.every((key) => key in value);
};

const serializeEmbeddedGameTime = (value: any): string => {
  if (typeof value === 'string') {
    return value;
  }

  if (value && typeof value === 'object') {
    const normalized: Record<string, any> = {
      era: coerceNumber(value.era, 0),
      day: coerceNumber(value.day, 1),
      hour: coerceNumber(value.hour, 0),
      minute: coerceNumber(value.minute, 0),
      second: coerceNumber(value.second, 0)
    };

    if (Object.prototype.hasOwnProperty.call(value, 'is_paused')) {
      normalized.is_paused = coerceBoolean(value.is_paused, false);
    }
    if (Object.prototype.hasOwnProperty.call(value, 'real_time_ref')) {
      normalized.real_time_ref = coerceNumber(value.real_time_ref, Date.now());
    }

    return JSON.stringify(normalized);
  }

  return JSON.stringify({
    era: 0,
    day: 1,
    hour: 0,
    minute: 0,
    second: 0
  });
};

const normalizeEmbeddedGameTimes = (value: any): any => {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeEmbeddedGameTimes(entry));
  }

  if (value && typeof value === 'object') {
    const result: Record<string, any> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (GAME_TIME_FIELD_PATTERN.test(key) && looksLikeGameTimeObject(entry)) {
        result[key] = serializeEmbeddedGameTime(entry);
        continue;
      }
      result[key] = normalizeEmbeddedGameTimes(entry);
    }
    return result;
  }

  return value;
};

const normalizeAppDataPayload = (data: any) => {
  if (!data || typeof data !== 'object') {
    return data;
  }
  return normalizeEmbeddedGameTimes(data);
};

router.get('/summary', (_req: Request, res: Response) => {
  try {
    const snapshot = buildSnapshot();
    res.json({
      meta: {
        version: snapshot.version,
        generatedAt: snapshot.exportedAt
      },
      counts: summarizeState(snapshot),
      gameTime: snapshot.gameTime
    });
  } catch (error) {
    console.error('Error building gamestate summary:', error);
    res.status(500).json({ error: 'Failed to build gamestate summary' });
  }
});

router.get('/export', (_req: Request, res: Response) => {
  try {
    const snapshot = buildSnapshot();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="gamestate_${Date.now()}.json"`);
    res.json(snapshot);
  } catch (error) {
    console.error('Error exporting gamestate:', error);
    res.status(500).json({ error: 'Failed to export gamestate' });
  }
});

router.post('/preview', (req: Request, res: Response) => {
  try {
    const { jsonContent } = req.body;
    if (!jsonContent || typeof jsonContent !== 'string') {
      return res.status(400).json({ error: 'JSON content is required' });
    }

    const parsed = parseJsonDocument(jsonContent);

    res.json({
      meta: {
        version: parsed.version,
        exportedAt: parsed.exportedAt
      },
      counts: summarizeState(parsed),
      gameState: parsed
    });
  } catch (error) {
    console.error('Error previewing gamestate:', error);
    res.status(400).json({
      error: 'Failed to preview gamestate XML',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

router.post('/import', async (req: Request, res: Response) => {
  try {
    const { jsonContent, sections } = req.body;

    if (!jsonContent || typeof jsonContent !== 'string') {
      return res.status(400).json({ error: 'JSON content is required' });
    }

    const parsedState = parseJsonDocument(jsonContent);
    const sectionsToApply = normalizeSections(sections);
    const sectionsSet = new Set(sectionsToApply);

    const db = getDatabase();
    const stats: Record<GameStateSection, number> = {
      gameTime: 0,
      characters: 0,
      apps: 0,
      messages: 0,
      settings: 0
    };

    if (sectionsSet.has('messages')) {
      db.run('DELETE FROM messages');
      const insertMessage = db.prepare(`
        INSERT INTO messages (id, sender, recipients, subject, body, sent_at, read_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      try {
        parsedState.messages.forEach((msg, index) => {
          try {
            insertMessage.run([
              msg.id,
              msg.sender,
              stringifyJsonField(msg.recipients),
              msg.subject,
              msg.body,
              stringifyJsonField(msg.sent_at),
              stringifyJsonField(msg.read_status),
              stringifyJsonField(msg.created_at),
              stringifyJsonField(msg.updated_at)
            ]);
          } catch (error) {
            console.error(`Failed to insert message ${index + 1}`, error);
            throw error;
          }
        });
      } finally {
        insertMessage.free();
      }
      stats.messages = parsedState.messages.length;
    }

    if (sectionsSet.has('characters')) {
      db.run('DELETE FROM characters');
      db.run('DROP TABLE IF EXISTS characters');
      db.run(`
        CREATE TABLE characters (
          id INTEGER PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          first_name TEXT NOT NULL,
          last_name TEXT NOT NULL,
          title TEXT NOT NULL,
          current_app_id TEXT,
          current_section TEXT,
          last_activity_at TEXT,
          can_access_messages INTEGER NOT NULL DEFAULT 1,
          visual_effects TEXT NOT NULL DEFAULT '[]',
          background TEXT DEFAULT '',
          personality TEXT DEFAULT '',
          fear TEXT DEFAULT '',
          secret TEXT DEFAULT '',
          motivation TEXT DEFAULT '',
          agenda TEXT DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (current_app_id) REFERENCES apps(id) ON DELETE SET NULL
        )
      `);

      const insertCharacter = db.prepare(`
        INSERT INTO characters (id, username, password, first_name, last_name, title, current_app_id, current_section, last_activity_at, can_access_messages, visual_effects, background, personality, fear, secret, motivation, agenda, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      try {
        parsedState.characters.forEach((character, index) => {
          try {
            const visualEffects = Array.isArray(character.visual_effects)
              ? JSON.stringify(character.visual_effects)
              : (character.visual_effects ?? '[]');

            const canAccessMessagesValue = (() => {
              if (typeof character.can_access_messages === 'number') {
                return character.can_access_messages ? 1 : 0;
              }
              if (typeof character.can_access_messages === 'boolean') {
                return character.can_access_messages ? 1 : 0;
              }
              return 1;
            })();

            insertCharacter.run([
              character.id,
              character.username,
              character.password,
              character.first_name,
              character.last_name,
              character.title,
              character.current_app_id === 'null' ? null : (character.current_app_id || null),
              character.current_section || null,
              character.last_activity_at || null,
              canAccessMessagesValue,
              visualEffects,
              character.background || '',
              character.personality || '',
              character.fear || '',
              character.secret || '',
              character.motivation || '',
              character.agenda || '',
              stringifyJsonField(character.created_at),
              stringifyJsonField(character.updated_at)
            ]);
          } catch (error) {
            console.error(`Failed to insert character ${index + 1}`, error);
            throw error;
          }
        });
      } finally {
        insertCharacter.free();
      }

      stats.characters = parsedState.characters.length;
    }

    if (sectionsSet.has('apps')) {
      db.run('DELETE FROM apps');
      const insertApp = db.prepare(`
        INSERT INTO apps (id, name, category, allowed_users, data, created_at, updated_at, order_index)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      try {
        parsedState.apps.forEach((app, index) => {
          try {
            const orderIndex = typeof app.order_index === 'number' ? app.order_index : index;
            const normalizedAppData = normalizeAppDataPayload(app.data);
            insertApp.run([
              app.id,
              app.name,
              app.category,
              stringifyJsonField(app.allowed_users),
              stringifyJsonField(normalizedAppData),
              stringifyJsonField(app.created_at),
              stringifyJsonField(app.updated_at),
              orderIndex
            ]);
          } catch (error) {
            console.error(`Failed to insert app ${index + 1}`, error);
            throw error;
          }
        });
      } finally {
        insertApp.free();
      }
      stats.apps = parsedState.apps.length;
    }

    if (sectionsSet.has('settings')) {
      db.run('DELETE FROM settings');
      const insertSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
      try {
        parsedState.settings.forEach((setting, index) => {
          try {
            insertSetting.run([setting.key, stringifyJsonField(setting.value)]);
          } catch (error) {
            console.error(`Failed to insert setting ${index + 1}`, error);
            throw error;
          }
        });
      } finally {
        insertSetting.free();
      }
      stats.settings = parsedState.settings.length;
    }

    if (sectionsSet.has('gameTime')) {
      gameTimeService.setGameTime({
        era: parsedState.gameTime.era,
        day: parsedState.gameTime.day,
        hour: parsedState.gameTime.hour,
        minute: parsedState.gameTime.minute,
        second: parsedState.gameTime.second
      });

      if (parsedState.gameTime.is_paused) {
        gameTimeService.pause();
      } else {
        gameTimeService.resume();
      }

      stats.gameTime = 1;
    }

    saveDatabase();

    await emitGamestateSync(stats);

    res.json({
      success: true,
      message: 'Gamestate imported successfully',
      appliedSections: sectionsToApply,
      stats
    });
  } catch (error) {
    console.error('Error importing gamestate:', error);
    res.status(500).json({
      error: 'Failed to import gamestate',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;
