import CharacterRepository from '../repositories/CharacterRepository';
import { Character } from '../types';

interface PlayerActivityUpdate {
  characterId: number;
  current_app_id?: string | null;
  section?: string | null;
  last_activity_at?: string | null;
}

interface PlayerActivityResult {
  character: Character;
  appChanged: boolean;
}

const hasOwn = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key);

export async function persistPlayerActivity(update: PlayerActivityUpdate): Promise<PlayerActivityResult> {
  const { characterId } = update;
  if (typeof characterId !== 'number' || Number.isNaN(characterId)) {
    throw new Error('Invalid characterId');
  }

  const existing = CharacterRepository.findById(characterId);
  if (!existing) {
    throw new Error('Character not found');
  }

  const updates: Partial<Character> = {};
  let appChanged = false;

  if (hasOwn(update, 'current_app_id')) {
    const sanitizedAppId = update.current_app_id ? String(update.current_app_id) : null;
    updates.current_app_id = sanitizedAppId;
    appChanged = existing.current_app_id !== sanitizedAppId;
  }

  if (hasOwn(update, 'section')) {
    const sectionValue = typeof update.section === 'string' && update.section.trim().length > 0
      ? update.section
      : null;
    updates.current_section = sectionValue;
  }

  updates.last_activity_at = update.last_activity_at || new Date().toISOString();

  const character = await CharacterRepository.update(characterId, updates);
  if (!character) {
    throw new Error('Character not found after update');
  }

  return { character, appChanged };
}
