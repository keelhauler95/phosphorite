import db from '../db/database';
import { Character } from '../types';
import gameTimeService from '../services/gameTimeService';

export class CharacterRepository {

  private hydrateCharacter(raw: any): Character {
    if (!raw) {
      return raw;
    }

    let visualEffects: any[] = [];
    if (raw.visual_effects) {
      try {
        visualEffects = JSON.parse(raw.visual_effects);
      } catch (error) {
        visualEffects = [];
      }
    }

    const canAccessValue = raw.can_access_messages;
    const canAccessMessages = (() => {
      if (canAccessValue === undefined || canAccessValue === null) {
        return true;
      }
      if (typeof canAccessValue === 'string') {
        return canAccessValue !== '0';
      }
      return !!canAccessValue;
    })();

    return {
      ...raw,
      can_access_messages: canAccessMessages,
      visual_effects: visualEffects
    } as Character;
  }

  async create(character: Omit<Character, 'id'>): Promise<Character> {
    const currentGameTime = gameTimeService.getCurrentGameTime();
    const gameTimeJson = gameTimeService.serializeGameTime(currentGameTime);

    const stmt = db.prepare(`
      INSERT INTO characters (username, password, first_name, last_name, title, current_app_id, current_section, last_activity_at, can_access_messages, visual_effects, background, personality, fear, secret, motivation, agenda, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      character.username,
      character.password,
      character.first_name,
      character.last_name,
      character.title,
      character.current_app_id || null,
      character.current_section || null,
      character.last_activity_at || null,
      character.can_access_messages === undefined ? 1 : (character.can_access_messages ? 1 : 0),
      JSON.stringify(character.visual_effects || []),
      character.background || '',
      character.personality || '',
      character.fear || '',
      character.secret || '',
      character.motivation || '',
      character.agenda || '',
      gameTimeJson,
      gameTimeJson
    );

    return this.findById(result.lastInsertRowid as number) as Character;
  }

  findAll(): Character[] {
    const stmt = db.prepare(`
      SELECT id, username, password, first_name, last_name, title, current_app_id, current_section, last_activity_at, can_access_messages, visual_effects, background, personality, fear, secret, motivation, agenda, created_at, updated_at
      FROM characters
    `);

    const characters = stmt.all() as any[];
    return characters.map(char => this.hydrateCharacter(char)) as Character[];
  }

  findById(id: number): Character | undefined {
    const stmt = db.prepare(`
      SELECT id, username, password, first_name, last_name, title, current_app_id, current_section, last_activity_at, can_access_messages, visual_effects, background, personality, fear, secret, motivation, agenda, created_at, updated_at
      FROM characters
      WHERE id = ?
    `);

    const char = stmt.get(id) as any;
    if (!char) return undefined;

    return this.hydrateCharacter(char);
  }

  findByUsername(username: string): Character | undefined {
    const stmt = db.prepare(`
      SELECT * FROM characters WHERE username = ?
    `);

    const char = stmt.get(username) as any;
    if (!char) return undefined;

    return this.hydrateCharacter(char);
  }

  async update(id: number, updates: Partial<Omit<Character, 'id' | 'username'>>): Promise<Character | undefined> {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.password !== undefined) {
      fields.push('password = ?');
      values.push(updates.password);
    }
    if (updates.first_name !== undefined) {
      fields.push('first_name = ?');
      values.push(updates.first_name);
    }
    if (updates.last_name !== undefined) {
      fields.push('last_name = ?');
      values.push(updates.last_name);
    }
    if (updates.title !== undefined) {
      fields.push('title = ?');
      values.push(updates.title);
    }
    if (updates.current_app_id !== undefined) {
      fields.push('current_app_id = ?');
      values.push(updates.current_app_id);
    }
    if (updates.current_section !== undefined) {
      fields.push('current_section = ?');
      values.push(updates.current_section);
    }
    if (updates.last_activity_at !== undefined) {
      fields.push('last_activity_at = ?');
      values.push(updates.last_activity_at);
    }
    if (updates.can_access_messages !== undefined) {
      fields.push('can_access_messages = ?');
      values.push(updates.can_access_messages ? 1 : 0);
    }
    if (updates.visual_effects !== undefined) {
      fields.push('visual_effects = ?');
      values.push(JSON.stringify(updates.visual_effects));
    }
    if (updates.background !== undefined) {
      fields.push('background = ?');
      values.push(updates.background);
    }
    if (updates.personality !== undefined) {
      fields.push('personality = ?');
      values.push(updates.personality);
    }
    if (updates.fear !== undefined) {
      fields.push('fear = ?');
      values.push(updates.fear);
    }
    if (updates.secret !== undefined) {
      fields.push('secret = ?');
      values.push(updates.secret);
    }
    if (updates.motivation !== undefined) {
      fields.push('motivation = ?');
      values.push(updates.motivation);
    }
    if (updates.agenda !== undefined) {
      fields.push('agenda = ?');
      values.push(updates.agenda);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    // Always update the updated_at field with current game time
    const currentGameTime = gameTimeService.getCurrentGameTime();
    const gameTimeJson = gameTimeService.serializeGameTime(currentGameTime);
    fields.push('updated_at = ?');
    values.push(gameTimeJson);

    values.push(id);
    const stmt = db.prepare(`
      UPDATE characters
      SET ${fields.join(', ')}
      WHERE id = ?
    `);

    stmt.run(...values);
    return this.findById(id);
  }

  delete(id: number): boolean {
    const stmt = db.prepare('DELETE FROM characters WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  async verifyPassword(username: string, password: string): Promise<boolean> {
    const character = this.findByUsername(username);
    if (!character) return false;
    return character.password === password;
  }
}

export default new CharacterRepository();
