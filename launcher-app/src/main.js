const { app, BrowserWindow, ipcMain, shell } = require('electron');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const DEFAULT_CONFIG = {
  backendPort: 3100,
  gmPort: 5173,
  playerPort: 5174
};

const LOCAL_HOST = '127.0.0.1';
const BIND_HOST = '0.0.0.0';
const LOG_LIMIT = 500;
const smokeTestMode = process.argv.includes('--smoke-test');
const SERVICE_KEYS = ['backend', 'gm', 'player'];

let mainWindow = null;
let processRegistry = {
  backend: null,
  gm: null,
  player: null
};
let logBuffer = [];

function getRepoRoot() {
  return path.resolve(__dirname, '../..');
}

function getDistributionRoot() {
  if (!app.isPackaged) {
    return getRepoRoot();
  }

  if (process.platform === 'darwin') {
    return path.dirname(path.dirname(path.dirname(path.dirname(process.execPath))));
  }

  return path.dirname(process.execPath);
}

function getWritableRoot() {
  return path.join(getDistributionRoot(), 'phosphorite-data');
}

function getConfigPath() {
  return path.join(getWritableRoot(), 'launcher-config.json');
}

function getLogPath() {
  return path.join(getWritableRoot(), 'launcher.log');
}

function getDataDir() {
  return path.join(getWritableRoot(), 'data');
}

function getRuntimeRoot() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'runtime');
  }

  return path.join(getRepoRoot(), 'launcher-app', 'runtime');
}

function ensureWritableDirectories() {
  fs.mkdirSync(getWritableRoot(), { recursive: true });
  fs.mkdirSync(getDataDir(), { recursive: true });
}

function appendLog(source, chunk) {
  const text = chunk.toString();
  const lines = text.split(/\r?\n/).filter(Boolean);

  if (lines.length === 0) {
    return;
  }

  const timestamp = new Date().toISOString();
  const entries = lines.map(line => `${timestamp} [${source}] ${line}`);

  logBuffer.push(...entries);
  if (logBuffer.length > LOG_LIMIT) {
    logBuffer = logBuffer.slice(-LOG_LIMIT);
  }

  fs.appendFileSync(getLogPath(), entries.join('\n') + '\n', 'utf8');
}

function resetLogFile() {
  ensureWritableDirectories();
  logBuffer = [];
  fs.writeFileSync(getLogPath(), '', 'utf8');
}

function readConfig() {
  ensureWritableDirectories();

  if (!fs.existsSync(getConfigPath())) {
    fs.writeFileSync(getConfigPath(), JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
    return { ...DEFAULT_CONFIG };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(getConfigPath(), 'utf8'));
    return {
      backendPort: normalizePort(parsed.backendPort, DEFAULT_CONFIG.backendPort),
      gmPort: normalizePort(parsed.gmPort, DEFAULT_CONFIG.gmPort),
      playerPort: normalizePort(parsed.playerPort, DEFAULT_CONFIG.playerPort)
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(config) {
  const normalized = {
    backendPort: normalizePort(config.backendPort, DEFAULT_CONFIG.backendPort),
    gmPort: normalizePort(config.gmPort, DEFAULT_CONFIG.gmPort),
    playerPort: normalizePort(config.playerPort, DEFAULT_CONFIG.playerPort)
  };

  ensureWritableDirectories();
  fs.writeFileSync(getConfigPath(), JSON.stringify(normalized, null, 2), 'utf8');
  return normalized;
}

function normalizePort(value, fallback) {
  const port = Number(value);

  if (Number.isInteger(port) && port > 0 && port < 65536) {
    return port;
  }

  return fallback;
}

function arePortsUnique(config) {
  return new Set([config.backendPort, config.gmPort, config.playerPort]).size === 3;
}

function runtimePath(...segments) {
  return path.join(getRuntimeRoot(), ...segments);
}

function assertRuntimeReady() {
  const requiredPaths = [
    runtimePath('backend', 'dist', 'server.js'),
    runtimePath('backend', 'node_modules'),
    runtimePath('gm-client', 'dist', 'index.html'),
    runtimePath('player-client', 'dist', 'index.html'),
    runtimePath('scripts', 'serve-client.js')
  ];

  for (const targetPath of requiredPaths) {
    if (!fs.existsSync(targetPath)) {
      throw new Error(`Missing runtime asset: ${targetPath}`);
    }
  }
}

function isProcessRunning(child) {
  if (!child || !child.pid) {
    return false;
  }

  try {
    process.kill(child.pid, 0);
    return true;
  } catch {
    return false;
  }
}

function spawnNodeProcess(name, scriptPath, args, options = {}) {
  const child = spawn(process.execPath, [scriptPath, ...args], {
    cwd: options.cwd || path.dirname(scriptPath),
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      ...options.env
    }
  });

  child.stdout.on('data', chunk => appendLog(name, chunk));
  child.stderr.on('data', chunk => appendLog(name, chunk));
  child.on('exit', code => {
    appendLog(name, `process exited with code ${code ?? 0}`);
    processRegistry[name] = null;
  });

  return child;
}

function killChildProcess(child) {
  if (!child || !child.pid || !isProcessRunning(child)) {
    return;
  }

  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      windowsHide: true
    });
    killer.unref();
    return;
  }

  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    process.kill(child.pid, 'SIGTERM');
  }
}

function getBackendUrl(config) {
  return `http://${LOCAL_HOST}:${config.backendPort}`;
}

function getClientUrl(kind, config) {
  const port = kind === 'gm' ? config.gmPort : config.playerPort;
  return `http://${LOCAL_HOST}:${port}`;
}

function getLanIPs() {
  const interfaces = os.networkInterfaces();
  const ips = new Set();

  for (const records of Object.values(interfaces)) {
    if (!Array.isArray(records)) {
      continue;
    }

    for (const record of records) {
      if (!record || record.internal) {
        continue;
      }

      if (record.family === 'IPv4') {
        ips.add(record.address);
      }
    }
  }

  return [...ips].sort();
}

function getLanShareUrls(config) {
  return getLanIPs().map(ip => ({
    ip,
    gmUrl: `http://${ip}:${config.gmPort}`,
    playerUrl: `http://${ip}:${config.playerPort}`
  }));
}

function checkUrl(url) {
  return new Promise(resolve => {
    const request = http.get(url, { timeout: 1000 }, response => {
      resolve(response.statusCode >= 200 && response.statusCode < 400);
      response.resume();
    });

    request.on('error', () => resolve(false));
    request.on('timeout', () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function getState() {
  const config = readConfig();
  const backendUrl = `${getBackendUrl(config)}/api/health`;
  const gmUrl = `${getClientUrl('gm', config)}/health`;
  const playerUrl = `${getClientUrl('player', config)}/health`;

  const services = {
    backend: {
      running: isProcessRunning(processRegistry.backend),
      healthy: await checkUrl(backendUrl),
      url: getBackendUrl(config)
    },
    gm: {
      running: isProcessRunning(processRegistry.gm),
      healthy: await checkUrl(gmUrl),
      url: getClientUrl('gm', config)
    },
    player: {
      running: isProcessRunning(processRegistry.player),
      healthy: await checkUrl(playerUrl),
      url: getClientUrl('player', config)
    }
  };

  return {
    config,
    services,
    lanShares: getLanShareUrls(config),
    runtimeRoot: getRuntimeRoot(),
    writableRoot: getWritableRoot(),
    dataDir: getDataDir(),
    logPath: getLogPath(),
    logs: [...logBuffer],
    stackRunning: services.backend.running || services.gm.running || services.player.running
  };
}

function spawnBackend(config) {
  const backendEnv = {
    NODE_ENV: 'production',
    PHOS_BACKEND_PORT: String(config.backendPort),
    PHOS_BACKEND_HOST: BIND_HOST,
    PHOS_DATA_DIR: getDataDir()
  };

  processRegistry.backend = spawnNodeProcess(
    'backend',
    runtimePath('backend', 'dist', 'server.js'),
    [],
    {
      cwd: runtimePath('backend'),
      env: backendEnv
    }
  );
}

function spawnClientService(kind, config) {
  const backendOrigin = getBackendUrl(config);
  const staticServerScript = runtimePath('scripts', 'serve-client.js');
  const isGm = kind === 'gm';

  processRegistry[kind] = spawnNodeProcess(
    kind,
    staticServerScript,
    [
      `--root-dir=${runtimePath(isGm ? 'gm-client' : 'player-client', 'dist')}`,
      `--host=${BIND_HOST}`,
      `--port=${isGm ? config.gmPort : config.playerPort}`,
      `--backend-origin=${backendOrigin}`,
      `--title=${isGm ? 'Phosphorite GM' : 'Phosphorite Player'}`
    ]
  );
}

async function startService(serviceName, options = {}) {
  const config = readConfig();

  if (!SERVICE_KEYS.includes(serviceName)) {
    throw new Error(`Unknown service: ${serviceName}`);
  }

  if (!arePortsUnique(config)) {
    throw new Error('Backend, GM, and player ports must all be different.');
  }

  assertRuntimeReady();

  if (options.resetLog) {
    resetLogFile();
  }

  if (isProcessRunning(processRegistry[serviceName])) {
    return;
  }

  if (serviceName === 'backend') {
    spawnBackend(config);
  } else {
    spawnClientService(serviceName, config);
  }

  await new Promise(resolve => setTimeout(resolve, 500));
}

async function stopService(serviceName) {
  if (!SERVICE_KEYS.includes(serviceName)) {
    throw new Error(`Unknown service: ${serviceName}`);
  }

  killChildProcess(processRegistry[serviceName]);
  processRegistry[serviceName] = null;
  await new Promise(resolve => setTimeout(resolve, 350));
}

async function startStack() {
  const stackAlreadyRunning = SERVICE_KEYS.some(key => isProcessRunning(processRegistry[key]));

  if (!stackAlreadyRunning) {
    resetLogFile();
  }

  await startService('backend');
  await startService('gm');
  await startService('player');

  await new Promise(resolve => setTimeout(resolve, 900));
  return getState();
}

async function stopStack() {
  await stopService('player');
  await stopService('gm');
  await stopService('backend');

  await new Promise(resolve => setTimeout(resolve, 500));
  return getState();
}

async function runSmokeTest() {
  try {
    await startStack();

    let healthy = false;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const state = await getState();
      if (state.services.backend.healthy && state.services.gm.healthy && state.services.player.healthy) {
        healthy = true;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (!healthy) {
      throw new Error('Smoke test failed: services did not become healthy in time.');
    }

    await stopStack();
    app.exit(0);
  } catch (error) {
    appendLog('launcher', error.stack || error.message || String(error));
    await stopStack();
    app.exit(1);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 920,
    minHeight: 620,
    backgroundColor: '#081114',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

ipcMain.handle('launcher:get-state', async () => getState());
ipcMain.handle('launcher:save-config', async (_event, config) => {
  saveConfig(config);
  return getState();
});
ipcMain.handle('launcher:start', async () => startStack());
ipcMain.handle('launcher:stop', async () => stopStack());
ipcMain.handle('launcher:start-service', async (_event, service) => {
  await startService(service);
  return getState();
});
ipcMain.handle('launcher:stop-service', async (_event, service) => {
  await stopService(service);
  return getState();
});
ipcMain.handle('launcher:open', async (_event, target) => {
  const config = readConfig();

  if (target === 'gm') {
    await shell.openExternal(getClientUrl('gm', config));
    return;
  }

  if (target === 'player') {
    await shell.openExternal(getClientUrl('player', config));
    return;
  }

  if (target === 'data') {
    await shell.openPath(getWritableRoot());
  }
});

app.whenReady().then(() => {
  ensureWritableDirectories();
  createWindow();

  if (smokeTestMode) {
    runSmokeTest();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  killChildProcess(processRegistry.player);
  killChildProcess(processRegistry.gm);
  killChildProcess(processRegistry.backend);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});