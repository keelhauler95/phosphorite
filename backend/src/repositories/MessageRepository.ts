import db from '../db/database';
import { Message } from '../types';
import { v4 as uuidv4 } from 'uuid';
import gameTimeService from '../services/gameTimeService';

class MessageRepository {
  // Create a new message
  async create(message: Omit<Message, 'id' | 'created_at' | 'updated_at'>): Promise<Message> {
    const id = uuidv4();
    const currentGameTime = gameTimeService.getCurrentGameTime();
    const gameTimeJson = gameTimeService.serializeGameTime(currentGameTime);

    // Validate subject length
    if (message.subject.length > 48) {
      throw new Error('Subject must be 48 characters or less');
    }

    const stmt = db.prepare(`
      INSERT INTO messages (id, sender, recipients, subject, body, sent_at, read_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      message.sender,
      JSON.stringify(message.recipients),
      message.subject,
      message.body,
      message.sent_at,
      JSON.stringify(message.read_status),
      gameTimeJson,
      gameTimeJson
    );

    return {
      id,
      ...message,
      created_at: gameTimeJson,
      updated_at: gameTimeJson
    };
  }

  // Get all messages
  async findAll(): Promise<Message[]> {
    const stmt = db.prepare('SELECT * FROM messages ORDER BY sent_at DESC');
    const rows = stmt.all();

    return rows.map((row: any) => this.rowToMessage(row));
  }

  // Get a message by ID
  async findById(id: string): Promise<Message | null> {
    const stmt = db.prepare('SELECT * FROM messages WHERE id = ?');
    const row = stmt.get(id);

    if (!row) return null;

    return this.rowToMessage(row);
  }

  // Get inbox for a specific user
  async findInbox(username: string): Promise<Message[]> {
    const allMessages = await this.findAll();

    // Filter messages where user is a recipient
    return allMessages.filter(msg => msg.recipients.includes(username));
  }

  // Get sent messages for a specific user
  async findSentByUser(username: string): Promise<Message[]> {
    const stmt = db.prepare('SELECT * FROM messages WHERE sender = ? ORDER BY sent_at DESC');
    const rows = stmt.all(username);

    return rows.map((row: any) => this.rowToMessage(row));
  }

  // Update a message
  async update(id: string, updates: Partial<Omit<Message, 'id' | 'created_at' | 'updated_at'>>): Promise<Message | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    // Validate subject length if being updated
    if (updates.subject && updates.subject.length > 48) {
      throw new Error('Subject must be 48 characters or less');
    }

    const currentGameTime = gameTimeService.getCurrentGameTime();
    const gameTimeJson = gameTimeService.serializeGameTime(currentGameTime);

    const updated = {
      ...existing,
      ...updates,
      updated_at: gameTimeJson
    };

    const stmt = db.prepare(`
      UPDATE messages
      SET sender = ?, recipients = ?, subject = ?, body = ?, sent_at = ?, read_status = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      updated.sender,
      JSON.stringify(updated.recipients),
      updated.subject,
      updated.body,
      updated.sent_at,
      JSON.stringify(updated.read_status),
      updated.updated_at,
      id
    );

    return updated;
  }

  // Update read status for a specific user
  async updateReadStatus(messageId: string, username: string, isRead: boolean): Promise<Message | null> {
    const message = await this.findById(messageId);
    if (!message) return null;

    // Check if user is a recipient
    if (!message.recipients.includes(username)) {
      throw new Error('User is not a recipient of this message');
    }

    // Update read status
    const updatedReadStatus = {
      ...message.read_status,
      [username]: isRead
    };

    return this.update(messageId, { read_status: updatedReadStatus });
  }

  // Delete a message
  async delete(id: string): Promise<boolean> {
    const stmt = db.prepare('DELETE FROM messages WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  // Helper to convert database row to Message object
  private rowToMessage(row: any): Message {
    return {
      id: row.id,
      sender: row.sender,
      recipients: JSON.parse(row.recipients),
      subject: row.subject,
      body: row.body,
      sent_at: row.sent_at,
      read_status: JSON.parse(row.read_status),
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }
}

export const messageRepository = new MessageRepository();
