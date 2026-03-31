import path from 'path';

export function getDataDir(): string {
  const customDataDir = process.env.PHOS_DATA_DIR;

  if (customDataDir && customDataDir.trim()) {
    return path.resolve(customDataDir);
  }

  return path.join(__dirname, '../../data');
}

export function getDatabasePath(): string {
  return path.join(getDataDir(), 'phosphorite.db');
}