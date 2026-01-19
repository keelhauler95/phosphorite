import { Router, Request, Response } from 'express';
import gameTimeService from '../services/gameTimeService';
import { GameTime } from '../types';

const router = Router();

// Get current game time
router.get('/', (req: Request, res: Response) => {
  try {
    const state = gameTimeService.getState();
    res.json(state);
  } catch (error) {
    console.error('Error fetching game time:', error);
    res.status(500).json({ error: 'Failed to fetch game time' });
  }
});

// Set game time manually
router.post('/set', (req: Request, res: Response) => {
  try {
    const { era, day, hour, minute, second } = req.body;

    if (era === undefined || day === undefined || hour === undefined ||
        minute === undefined || second === undefined) {
      return res.status(400).json({ error: 'Missing required fields: era, day, hour, minute, second' });
    }

    // Validate ranges
    if (era < 0 || day < 1 || hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
      return res.status(400).json({ error: 'Invalid time values' });
    }

    const newTime: GameTime = { era, day, hour, minute, second };
    const state = gameTimeService.setGameTime(newTime);

    res.json(state);
  } catch (error) {
    console.error('Error setting game time:', error);
    res.status(500).json({ error: 'Failed to set game time' });
  }
});

// Pause game time
router.post('/pause', (req: Request, res: Response) => {
  try {
    const state = gameTimeService.pause();
    res.json(state);
  } catch (error) {
    console.error('Error pausing game time:', error);
    res.status(500).json({ error: 'Failed to pause game time' });
  }
});

// Resume game time
router.post('/resume', (req: Request, res: Response) => {
  try {
    const state = gameTimeService.resume();
    res.json(state);
  } catch (error) {
    console.error('Error resuming game time:', error);
    res.status(500).json({ error: 'Failed to resume game time' });
  }
});

// Advance time
router.post('/advance', (req: Request, res: Response) => {
  try {
    const { seconds, minutes, hours, days } = req.body;

    let state = gameTimeService.getState();

    if (seconds) state = gameTimeService.advanceSeconds(seconds);
    if (minutes) state = gameTimeService.advanceMinutes(minutes);
    if (hours) state = gameTimeService.advanceHours(hours);
    if (days) state = gameTimeService.advanceDays(days);

    res.json(state);
  } catch (error) {
    console.error('Error advancing game time:', error);
    res.status(500).json({ error: 'Failed to advance game time' });
  }
});

// Rollback time
router.post('/rollback', (req: Request, res: Response) => {
  try {
    const { seconds, minutes, hours, days } = req.body;

    let state = gameTimeService.getState();

    if (seconds) state = gameTimeService.rollbackSeconds(seconds);
    if (minutes) state = gameTimeService.advanceMinutes(-minutes);
    if (hours) state = gameTimeService.advanceHours(-hours);
    if (days) state = gameTimeService.advanceDays(-days);

    res.json(state);
  } catch (error) {
    console.error('Error rolling back game time:', error);
    res.status(500).json({ error: 'Failed to rollback game time' });
  }
});

export default router;
