// @ts-ignore - sql.js doesn't have official types
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { getDataDir, getDatabasePath } from '../config/runtime';

type SqlJsDatabase = any;

let db: SqlJsDatabase | null = null;
const dbPath = getDatabasePath();

const defaultEffectSettings = {
  embers: {
    primaryColor: '#ffbd81',
    secondaryColor: '#ff8f3e',
    driftSpeed: 1,
    density: 32,
    glow: 0.5
  },
  heartbeat: {
    coreColor: '#d4f9fa',
    ringColor: '#ff3c00',
    pulseRate: 2.6,
    intensity: 0.55
  },
  silicon: {
    gridColor: '#78d1ff',
    glareColor: '#88ffff',
    sweepSpeed: 8,
    gridScale: 48
  }
};

const defaultPlayerTheme = {
  presetId: 'phosphor',
  palette: {
    foreground: '#d4f9fa',
    background: '#000c0c',
    alert: '#ff3c00',
    gradient: {
      type: 'radial',
      angle: 135,
      start: '#1a2f30',
      end: '#000000',
      radius: 68,
      intensity: 0.85,
      enabled: true
    },
    glow: {
      foreground: 0.5,
      background: 0.35,
      alert: 0.5
    },
    media: {
      hueShift: 135,
      saturation: 1.2,
      brightness: 0.82,
      contrast: 1.05
    }
  },
  typography: {
    fontFamily: '"Vga", Menlo, Monaco, Consolas, "Courier New", monospace',
    fontScale: 1,
    lineHeightScale: 1,
    letterSpacingScale: 1
  },
  effects: {
    scanlines: true,
    staticNoise: true,
    vignette: true,
    chromaticAberration: false,
    embers: false,
    heartbeat: false,
    grid: false,
    glare: false
  },
  effectSettings: defaultEffectSettings
};
const defaultPlayerThemeValue = JSON.stringify(defaultPlayerTheme);

// Initialize sql.js and load/create database
export async function initDatabase() {
  const SQL = await initSqlJs();

  // Ensure data directory exists
  const dataDir = getDataDir();
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Load existing database or create new one
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
    console.log('Database loaded from file');
  } else {
    db = new SQL.Database();
    console.log('New database created');
  }

  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON');

  // Create schema
  db.run(`
    CREATE TABLE IF NOT EXISTS characters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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

  db.run(`
    CREATE TABLE IF NOT EXISTS apps (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      allowed_users TEXT NOT NULL,
      data TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      order_index INTEGER NOT NULL DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      sender TEXT NOT NULL,
      recipients TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      sent_at TEXT NOT NULL,
      read_status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // Initialize default settings if they don't exist
  const settingsCheck = db.exec('SELECT COUNT(*) as count FROM settings');
  const settingsCount = settingsCheck[0]?.values[0]?.[0] || 0;
  if (settingsCount === 0) {
    console.log('Initializing default settings');
    db.run(`INSERT INTO settings (key, value) VALUES 
      ('headerText', 'PHOSPHORITE'),
      ('loginText', 'WELCOME TO THE PHOSPHORITE TERMINAL'),
      ('playerTheme', ?)` , [defaultPlayerThemeValue]);
    console.log('Default settings initialized');
  }

  const playerThemeExists = db.exec(`SELECT value FROM settings WHERE key = 'playerTheme' LIMIT 1`);
  if (!playerThemeExists[0] || playerThemeExists[0].values.length === 0) {
    db.run('INSERT INTO settings (key, value) VALUES (?, ?)', ['playerTheme', defaultPlayerThemeValue]);
  }

  // Migration: Add allowed_users column to existing apps table if it doesn't exist
  try {
    // Check if column exists by trying to select it
    const result = db.exec('SELECT allowed_users FROM apps LIMIT 1');
    // If we get here, column exists
  } catch (error) {
    // Column doesn't exist, add it
    console.log('Migrating apps table: adding allowed_users column');
    db.run('ALTER TABLE apps ADD COLUMN allowed_users TEXT');
    // Update existing apps to have empty array as allowed_users
    db.run('UPDATE apps SET allowed_users = "[]" WHERE allowed_users IS NULL');
    console.log('Migration complete');
  }

  // Migration: ensure apps have order_index column populated sequentially
  try {
    db.exec('SELECT order_index FROM apps LIMIT 1');
  } catch (error) {
    console.log('Migrating apps table: adding order_index column');
    db.run('ALTER TABLE apps ADD COLUMN order_index INTEGER');

    const existingApps = db.exec('SELECT id FROM apps ORDER BY created_at ASC');
    const appRows = existingApps[0]?.values || [];
    appRows.forEach((row: any[], index: number) => {
      const appId = row[0];
      db.run('UPDATE apps SET order_index = ? WHERE id = ?', [index, appId]);
    });
    db.run('UPDATE apps SET order_index = 0 WHERE order_index IS NULL');
    console.log('order_index migration complete');
  }

  // Migration: ensure characters have can_access_messages column
  try {
    db.exec('SELECT can_access_messages FROM characters LIMIT 1');
  } catch (error) {
    console.log('Migrating characters table: adding can_access_messages column');
    db.run('ALTER TABLE characters ADD COLUMN can_access_messages INTEGER NOT NULL DEFAULT 1');
    db.run('UPDATE characters SET can_access_messages = 1 WHERE can_access_messages IS NULL');
    console.log('can_access_messages migration complete');
  }

  // Migration: ensure characters have current_section column
  try {
    db.exec('SELECT current_section FROM characters LIMIT 1');
  } catch (error) {
    console.log('Migrating characters table: adding current_section column');
    db.run('ALTER TABLE characters ADD COLUMN current_section TEXT');
    console.log('current_section migration complete');
  }

  // Migration: ensure characters have last_activity_at column
  try {
    db.exec('SELECT last_activity_at FROM characters LIMIT 1');
  } catch (error) {
    console.log('Migrating characters table: adding last_activity_at column');
    db.run('ALTER TABLE characters ADD COLUMN last_activity_at TEXT');
    console.log('last_activity_at migration complete');
  }

  // Migration: Reset passwords to plain text if they appear to be bcrypt hashes
  try {
    const characters = db.exec('SELECT id, password FROM characters');
    if (characters.length > 0 && characters[0].values.length > 0) {
      characters[0].values.forEach((row: any[]) => {
        const [id, password] = row;
        // Bcrypt hashes start with $2a$, $2b$, or $2y$ and are 60 characters long
        if (password && typeof password === 'string' && password.startsWith('$2') && password.length === 60) {
          console.log(`Resetting password for user ID ${id} to plain text (was bcrypt hash)`);
          // Reset to a default password that the GM can see and change
          db.run('UPDATE characters SET password = ? WHERE id = ?', ['password123', id]);
        }
      });
      console.log('Password migration complete');
    }
  } catch (error) {
    console.log('No password migration needed or error occurred:', error);
  }

  // Save to file
  saveDatabase();

  console.log('Database initialized successfully');
}

// Save database to file
export function saveDatabase() {
  if (!db) {
    throw new Error('Database not initialized');
  }

  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

// Get database instance
export function getDatabase(): SqlJsDatabase {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

// Helper class to make sql.js API similar to better-sqlite3
export class Statement {
  private stmt: any;
  private db: SqlJsDatabase;

  constructor(db: SqlJsDatabase, sql: string) {
    this.db = db;
    this.stmt = db.prepare(sql);
  }

  run(...params: any[]): { lastInsertRowid: number; changes: number } {
    this.stmt.bind(params);
    this.stmt.step();
    const lastInsertRowid = this.db.exec('SELECT last_insert_rowid()')[0]?.values[0]?.[0] as number || 0;
    const changes = this.db.getRowsModified();
    this.stmt.reset();
    saveDatabase(); // Auto-save after write
    return { lastInsertRowid, changes };
  }

  get(...params: any[]): any {
    this.stmt.bind(params);
    const result = this.stmt.step() ? this.stmt.getAsObject() : undefined;
    this.stmt.reset();
    return result;
  }

  all(...params: any[]): any[] {
    this.stmt.bind(params);
    const results: any[] = [];
    while (this.stmt.step()) {
      results.push(this.stmt.getAsObject());
    }
    this.stmt.reset();
    return results;
  }
}

// Mock database object with similar API to better-sqlite3
const dbWrapper = {
  prepare(sql: string): Statement {
    return new Statement(getDatabase(), sql);
  },

  exec(sql: string): void {
    getDatabase().run(sql);
    saveDatabase();
  },

  pragma(pragma: string): void {
    getDatabase().run(`PRAGMA ${pragma}`);
  }
};

export default dbWrapper;
