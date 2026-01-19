#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const REPO_ROOT = path.join(__dirname, '..');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...valueParts] = trimmed.split('=');
    const value = valueParts.join('=').trim();
    const name = key.trim();
    if (name && process.env[name] === undefined) {
      process.env[name] = value;
    }
  }
}

function loadEnv() {
  loadEnvFile(path.join(REPO_ROOT, '.env'));
  loadEnvFile(path.join(REPO_ROOT, '.env.local'));
}

function getConfig(target) {
  if (target === 'gm-client') {
    return {
      cwd: path.join(REPO_ROOT, 'gm-client'),
      host: process.env.PHOS_GM_HOST || '0.0.0.0',
      port: process.env.PHOS_GM_PORT || '5173'
    };
  }
  if (target === 'player-client') {
    return {
      cwd: path.join(REPO_ROOT, 'player-client'),
      host: process.env.PHOS_PLAYER_HOST || '0.0.0.0',
      port: process.env.PHOS_PLAYER_PORT || '5174'
    };
  }
  throw new Error(`Unknown preview target: ${target}`);
}

function run() {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: node scripts/run-preview.js <gm-client|player-client>');
    process.exit(1);
  }

  loadEnv();

  const cfg = getConfig(target);
  const args = ['run', 'preview', '--', '--host', cfg.host, '--port', cfg.port];

  const child = spawn('npm', args, {
    cwd: cfg.cwd,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env }
  });

  child.on('close', code => process.exit(code ?? 0));
}

run();
