import { Router, Request, Response } from 'express';
import { SocketEvent, Broadcast, BroadcastType } from '../types';
import { emitSocketEvent } from '../services/socketService';
import gameTimeService from '../services/gameTimeService';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Send a broadcast
router.post('/', (req: Request, res: Response) => {
  try {
    const { type, recipients, content, mimeType, duration } = req.body;

    if (!type || !recipients || !content || !duration) {
      return res.status(400).json({ 
        error: 'Missing required fields: type, recipients, content, duration' 
      });
    }

    if (!Object.values(BroadcastType).includes(type as BroadcastType)) {
      return res.status(400).json({ error: 'Invalid broadcast type' });
    }

    if (!Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: 'Recipients must be a non-empty array' });
    }

    if (typeof duration !== 'number' || duration <= 0) {
      return res.status(400).json({ error: 'Duration must be a positive number' });
    }

    if (type === BroadcastType.IMAGE && !mimeType) {
      return res.status(400).json({ error: 'mimeType is required for image broadcasts' });
    }

    const broadcast: Broadcast = {
      id: uuidv4(),
      type: type as BroadcastType,
      recipients,
      content,
      mimeType: mimeType || undefined,
      duration,
      timestamp: JSON.stringify(gameTimeService.getCurrentGameTime())
    };

    // Emit socket event to all recipients
    emitSocketEvent(SocketEvent.BROADCAST_SENT, broadcast);

    res.status(200).json({
      success: true,
      broadcast
    });
  } catch (error) {
    console.error('Error sending broadcast:', error);
    res.status(500).json({ error: 'Failed to send broadcast' });
  }
});

export default router;
