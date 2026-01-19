import db, { getDatabase, saveDatabase } from '../db/database';
import { App, AppCategory, MapAppData } from '../types';
import { v4 as uuidv4 } from 'uuid';
import gameTimeService from '../services/gameTimeService';
import { normalizeMapAppData } from '../utils/mapAppData';

export class AppRepository {
  private mapRow(row: any): App {
    const app: App = {
      ...row,
      allowed_users: row.allowed_users ? JSON.parse(row.allowed_users) : [],
      data: row.data ? JSON.parse(row.data) : null,
      order_index: typeof row.order_index === 'number' ? row.order_index : 0
    };

    if (app.category === AppCategory.MAP && app.data) {
      app.data = normalizeMapAppData(app.data as MapAppData) || app.data;
    }

    return app;
  }

  private getNextOrderIndex(): number {
    const stmt = db.prepare('SELECT MAX(order_index) as max_order FROM apps');
    const row = stmt.get() as { max_order?: number } | undefined;
    const maxOrder = typeof row?.max_order === 'number' ? row.max_order : -1;
    return maxOrder + 1;
  }

  create(app: Omit<App, 'id' | 'order_index'>): App {
    const id = uuidv4();
    const dataJson = app.data ? JSON.stringify(app.data) : null;
    const allowedUsersJson = JSON.stringify(app.allowed_users || []);
    const currentGameTime = gameTimeService.getCurrentGameTime();
    const gameTimeJson = gameTimeService.serializeGameTime(currentGameTime);
    const orderIndex = this.getNextOrderIndex();

    const stmt = db.prepare(`
      INSERT INTO apps (id, name, category, allowed_users, data, created_at, updated_at, order_index)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, app.name, app.category, allowedUsersJson, dataJson, gameTimeJson, gameTimeJson, orderIndex);
    return this.findById(id) as App;
  }

  findAll(): App[] {
    const stmt = db.prepare('SELECT * FROM apps ORDER BY order_index ASC, created_at ASC');
    const rows = stmt.all() as any[];
    return rows.map(row => this.mapRow(row));
  }

  findById(id: string): App | undefined {
    const stmt = db.prepare('SELECT * FROM apps WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) return undefined;
    return this.mapRow(row);
  }

  findByCategory(category: string): App[] {
    const stmt = db.prepare('SELECT * FROM apps WHERE category = ? ORDER BY order_index ASC, created_at ASC');
    const rows = stmt.all(category) as any[];

    return rows.map(row => this.mapRow(row));
  }

  update(id: string, updates: Partial<Omit<App, 'id'>>): App | undefined {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.category !== undefined) {
      fields.push('category = ?');
      values.push(updates.category);
    }
    if (updates.allowed_users !== undefined) {
      fields.push('allowed_users = ?');
      values.push(JSON.stringify(updates.allowed_users));
    }
    if (updates.data !== undefined) {
      fields.push('data = ?');
      values.push(JSON.stringify(updates.data));
    }
    if (updates.order_index !== undefined) {
      fields.push('order_index = ?');
      values.push(updates.order_index);
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
      UPDATE apps
      SET ${fields.join(', ')}
      WHERE id = ?
    `);

    stmt.run(...values);
    return this.findById(id);
  }

  reorder(order: string[]): App[] {
    const currentApps = this.findAll();
    if (currentApps.length === 0) {
      return [];
    }

    const appMap = new Map(currentApps.map(app => [app.id, app]));
    const seen = new Set<string>();
    const sanitizedOrder = order.filter(id => {
      if (seen.has(id) || !appMap.has(id)) {
        return false;
      }
      seen.add(id);
      return true;
    });

    const remaining = currentApps
      .filter(app => !seen.has(app.id))
      .map(app => app.id);

    const finalOrder = [...sanitizedOrder, ...remaining];
    const currentGameTime = gameTimeService.getCurrentGameTime();
    const gameTimeJson = gameTimeService.serializeGameTime(currentGameTime);
    const rawDb = getDatabase();
    const stmt = rawDb.prepare('UPDATE apps SET order_index = ?, updated_at = ? WHERE id = ?');
    try {
      finalOrder.forEach((id, index) => {
        stmt.run([index, gameTimeJson, id]);
      });
    } finally {
      stmt.free();
    }

    saveDatabase();
    return this.findAll();
  }

  delete(id: string): boolean {
    const stmt = db.prepare('DELETE FROM apps WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }
}

export default new AppRepository();
