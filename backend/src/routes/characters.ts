import { Router, Request, Response } from 'express';
import CharacterRepository from '../repositories/CharacterRepository';
import { Character, SocketEvent } from '../types';
import { emitSocketEvent } from '../services/socketService';
import { persistPlayerActivity } from '../services/playerActivityService';

const router = Router();
type CharacterIdRequest = Request<{ id: string }>;

// Login endpoint - validate username and password
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const characters = CharacterRepository.findAll();
    const character = characters.find(c => c.username === username && c.password === password);

    if (!character) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    res.json(character);
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get all characters
router.get('/', async (req: Request, res: Response) => {
  try {
    const characters = CharacterRepository.findAll();
    res.json(characters);
  } catch (error) {
    console.error('Error fetching characters:', error);
    res.status(500).json({ error: 'Failed to fetch characters' });
  }
});

// Get character by ID
router.get('/:id', async (req: CharacterIdRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const character = CharacterRepository.findById(id);

    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    res.json(character);
  } catch (error) {
    console.error('Error fetching character:', error);
    res.status(500).json({ error: 'Failed to fetch character' });
  }
});

// Create new character
router.post('/', async (req: Request, res: Response) => {
  try {
    const { username, password, first_name, last_name, title, can_access_messages } = req.body;

    if (!username || !password || !first_name || !last_name || !title) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const character = await CharacterRepository.create({
      username,
      password,
      first_name,
      last_name,
      title,
      current_app_id: null,
      can_access_messages: can_access_messages === undefined ? true : !!can_access_messages
    });

    // Emit socket event for real-time update
    emitSocketEvent(SocketEvent.CHARACTER_CREATED, character);

    res.status(201).json(character);
  } catch (error: any) {
    console.error('Error creating character:', error);
    if (error.message?.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: 'Failed to create character' });
  }
});

// Update character
router.patch('/:id', async (req: CharacterIdRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const updates = req.body;

    const character = await CharacterRepository.update(id, updates);

    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    const touchedApp = updates.current_app_id !== undefined;
    const touchedActivity = touchedApp || updates.current_section !== undefined || updates.last_activity_at !== undefined;

    if (touchedApp) {
      emitSocketEvent(SocketEvent.CHARACTER_APP_CHANGED, {
        characterId: id,
        appId: updates.current_app_id,
        character
      });
    } else {
      emitSocketEvent(SocketEvent.CHARACTER_UPDATED, character);
    }

    if (touchedActivity) {
      emitSocketEvent(SocketEvent.CHARACTER_ACTIVITY_UPDATED, {
        characterId: id,
        appId: character.current_app_id,
        section: character.current_section,
        lastActivityAt: character.last_activity_at,
        character
      });
    }

    res.json(character);
  } catch (error) {
    console.error('Error updating character:', error);
    res.status(500).json({ error: 'Failed to update character' });
  }
});

// Report real-time player activity
router.post('/:id/activity', async (req: CharacterIdRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid character ID' });
    }

    const { current_app_id, section, last_activity_at } = req.body || {};

    if (current_app_id === undefined && section === undefined && last_activity_at === undefined) {
      return res.status(400).json({ error: 'At least one activity field is required' });
    }
    const { character, appChanged } = await persistPlayerActivity({
      characterId: id,
      current_app_id,
      section,
      last_activity_at: typeof last_activity_at === 'string' ? last_activity_at : undefined
    });

    if (appChanged) {
      emitSocketEvent(SocketEvent.CHARACTER_APP_CHANGED, {
        characterId: id,
        appId: character.current_app_id,
        character
      });
    }

    emitSocketEvent(SocketEvent.CHARACTER_ACTIVITY_UPDATED, {
      characterId: id,
      appId: character.current_app_id,
      section: character.current_section,
      lastActivityAt: character.last_activity_at,
      character
    });

    res.json({ success: true, character });
  } catch (error) {
    console.error('Error reporting player activity:', error);
    res.status(500).json({ error: 'Failed to report activity' });
  }
});

// Update visual effects
router.put('/:id/visual-effects', async (req: CharacterIdRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { visual_effects } = req.body;

    if (!Array.isArray(visual_effects)) {
      return res.status(400).json({ error: 'visual_effects must be an array' });
    }

    const character = await CharacterRepository.update(id, { visual_effects });

    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // Emit socket event for real-time update to player client
    emitSocketEvent(SocketEvent.VISUAL_EFFECTS_CHANGED, {
      characterId: id,
      username: character.username,
      visual_effects: character.visual_effects
    });

    res.json(character);
  } catch (error) {
    console.error('Error updating visual effects:', error);
    res.status(500).json({ error: 'Failed to update visual effects' });
  }
});

// Delete character
router.delete('/:id', async (req: CharacterIdRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const deleted = CharacterRepository.delete(id);

    if (!deleted) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // Emit socket event for real-time update
    emitSocketEvent(SocketEvent.CHARACTER_DELETED, { id });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting character:', error);
    res.status(500).json({ error: 'Failed to delete character' });
  }
});

export default router;
