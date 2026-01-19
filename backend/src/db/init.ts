import { initDatabase } from './database';
import fs from 'fs';
import path from 'path';

async function init() {
  // Ensure data directory exists
  const dataDir = path.join(__dirname, '../../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Initialize the database
  await initDatabase();

  console.log('Database initialization complete!');
}

init().catch(err => {
  console.error('Database initialization failed:', err);
  process.exit(1);
});
