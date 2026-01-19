import { Router, Request, Response } from 'express';
import { getDatabase, saveDatabase } from '../db/database';
import { emitSocketEvent } from '../services/socketService';
import { SocketEvent } from '../types';

const router = Router();

// Get all settings
router.get('/', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const result = db.exec('SELECT key, value FROM settings');
    
    if (!result[0]) {
      return res.json({});
    }

    const settings: Record<string, string> = {};
    result[0].values.forEach((row: any[]) => {
      settings[row[0]] = row[1];
    });

    res.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Update a setting (PUT)
router.put('/:key', async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    const db = getDatabase();
    db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
    
    // Save database to disk
    saveDatabase();

    // Emit socket event for real-time update
    emitSocketEvent(SocketEvent.SETTING_UPDATED, { key, value });

    res.json({ key, value });
  } catch (error) {
    console.error('Error updating setting:', error);
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

// Update a setting (PATCH)
router.patch('/:key', async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    const db = getDatabase();
    db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
    
    // Save database to disk
    saveDatabase();

    // Emit socket event for real-time update
    emitSocketEvent(SocketEvent.SETTING_UPDATED, { key, value });

    res.json({ key, value });
  } catch (error) {
    console.error('Error updating setting:', error);
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

export default router;
