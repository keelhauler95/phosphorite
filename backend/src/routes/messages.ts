import { Router } from 'express';
import { messageRepository } from '../repositories/MessageRepository';
import CharacterRepository from '../repositories/CharacterRepository';
import { emitSocketEvent } from '../services/socketService';
import { SocketEvent } from '../types';
import gameTimeService from '../services/gameTimeService';

const router = Router();

// Get all messages (GM view)
router.get('/', async (req, res) => {
  try {
    const messages = await messageRepository.findAll();
    res.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Get inbox for a specific user (player view)
router.get('/inbox/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const character = CharacterRepository.findByUsername(username);

    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    if (character.can_access_messages === false) {
      return res.status(403).json({ error: 'Messages disabled for this character' });
    }

    const messages = await messageRepository.findInbox(username);
    
    // Check for duplicates
    const ids = messages.map(m => m.id);
    const uniqueIds = new Set(ids);
    if (ids.length !== uniqueIds.size) {
      console.error(`DUPLICATE MESSAGES IN INBOX for ${username}:`, ids.length, 'messages but only', uniqueIds.size, 'unique IDs');
    } else {
      console.log(`Inbox for ${username}: ${messages.length} unique messages`);
    }
    
    res.json(messages);
  } catch (error) {
    console.error('Error fetching inbox:', error);
    res.status(500).json({ error: 'Failed to fetch inbox' });
  }
});

// Get sent messages for a specific user
router.get('/sent/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const character = CharacterRepository.findByUsername(username);

    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    if (character.can_access_messages === false) {
      return res.status(403).json({ error: 'Messages disabled for this character' });
    }

    const messages = await messageRepository.findSentByUser(username);
    res.json(messages);
  } catch (error) {
    console.error('Error fetching sent messages:', error);
    res.status(500).json({ error: 'Failed to fetch sent messages' });
  }
});

// Get a specific message
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const message = await messageRepository.findById(id);

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    res.json(message);
  } catch (error) {
    console.error('Error fetching message:', error);
    res.status(500).json({ error: 'Failed to fetch message' });
  }
});

// Create a new message
router.post('/', async (req, res) => {
  try {
    const { sender, recipients, subject, body, sent_at } = req.body;

    // Validation
    if (!sender || !recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: 'Sender and at least one recipient are required' });
    }

    if (!subject || subject.length > 48) {
      return res.status(400).json({ error: 'Subject is required and must be 48 characters or less' });
    }

    if (!body) {
      return res.status(400).json({ error: 'Body is required' });
    }

    // Use custom sent_at if provided, otherwise use current game time
    let sentAt: string;
    if (sent_at) {
      sentAt = sent_at; // Already JSON string from client
    } else {
      const currentGameTime = gameTimeService.getCurrentGameTime();
      sentAt = gameTimeService.serializeGameTime(currentGameTime);
    }

    // Initialize read status (all recipients marked as unread)
    const readStatus: { [username: string]: boolean } = {};
    recipients.forEach((username: string) => {
      readStatus[username] = false;
    });

    const message = await messageRepository.create({
      sender,
      recipients,
      subject,
      body,
      sent_at: sentAt,
      read_status: readStatus
    });

    // Broadcast message creation to all clients
    emitSocketEvent(SocketEvent.MESSAGE_CREATED, message);

    res.status(201).json(message);
  } catch (error) {
    console.error('Error creating message:', error);
    res.status(500).json({ error: 'Failed to create message' });
  }
});

// Update a message (GM only)
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Validate subject length if being updated
    if (updates.subject && updates.subject.length > 48) {
      return res.status(400).json({ error: 'Subject must be 48 characters or less' });
    }

    const message = await messageRepository.update(id, updates);

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Broadcast message update to all clients
    emitSocketEvent(SocketEvent.MESSAGE_UPDATED, message);

    res.json(message);
  } catch (error) {
    console.error('Error updating message:', error);
    res.status(500).json({ error: 'Failed to update message' });
  }
});

// Update read status for a message (player action)
router.patch('/:id/read-status', async (req, res) => {
  try {
    const { id } = req.params;
    const { username, is_read } = req.body;

    if (!username || typeof is_read !== 'boolean') {
      return res.status(400).json({ error: 'Username and is_read (boolean) are required' });
    }

    const message = await messageRepository.updateReadStatus(id, username, is_read);

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Broadcast read status change
    emitSocketEvent(SocketEvent.MESSAGE_READ_STATUS_CHANGED, {
      messageId: id,
      username,
      is_read
    });

    res.json(message);
  } catch (error: any) {
    console.error('Error updating read status:', error);
    res.status(500).json({ error: error.message || 'Failed to update read status' });
  }
});

// Delete a message
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const success = await messageRepository.delete(id);

    if (!success) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Broadcast message deletion
    emitSocketEvent(SocketEvent.MESSAGE_DELETED, { id });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

export default router;
