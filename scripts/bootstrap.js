#!/usr/bin/env node

/**
 * Phosphorite Launcher Bootstrap
 * Interactive control panel for local and LAN multiplayer sessions.
 * Works across Windows, macOS, and Linux.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execSync } = require('child_process');
const readline = require('readline');
const http = require('http');

// ==================== Constants ====================

const REPO_ROOT = path.join(__dirname, '..');
const ENV_FILE = path.join(REPO_ROOT, '.env.local');
const PID_FILE = path.join(REPO_ROOT, '.phosphorite-run.pid');
const LOG_FILE = path.join(REPO_ROOT, '.phosphorite-run.log');

const DEFAULT_CONFIG = {
  backendPort: '3100',
  gmPort: '5173',
  playerPort: '5174',
  backendHost: '0.0.0.0',
  gmHost: '0.0.0.0',
  playerHost: '0.0.0.0',
  backendOrigin: ''
};

const COLORS = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
  darkYellow: '\x1b[33m'
};

// ==================== Utility Functions ====================

function color(text, colorCode) {
  return `${colorCode}${text}${COLORS.reset}`;
}

function clearScreen() {
  process.stdout.write('\x1Bc');
}

function writeSection(title, subtitle = '') {
  console.log();
  console.log(color('==============================', COLORS.cyan));
  console.log(color(` ${title}`, COLORS.cyan));
  if (subtitle) {
    console.log(color(` ${subtitle}`, COLORS.gray));
  }
  console.log(color('==============================', COLORS.cyan));
  console.log();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function prompt(question, defaultValue = '') {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    const displayDefault = defaultValue ? ` [${defaultValue}]` : '';
    rl.question(`${question}${displayDefault}: `, answer => {
      rl.close();
      resolve(answer.trim() || defaultValue);
    });
  });
}

async function promptSingleKey(question, validKeys) {
  return new Promise(resolve => {
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    const onKeypress = (str, key) => {
      if (key && key.ctrl && key.name === 'c') {
        process.emit('SIGINT');
        return;
      }

      const value = (str || '').trim();
      if (!value) {
        return;
      }

      if (Array.isArray(validKeys) && validKeys.length > 0 && !validKeys.includes(value)) {
        process.stdout.write('\x07');
        return;
      }

      process.stdin.off('keypress', onKeypress);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdout.write(value + '\n');
      resolve(value);
    };

    process.stdin.on('keypress', onKeypress);
    process.stdout.write(question);
  });
}

async function waitForKey() {
  console.log(color('\nPress ENTER to continue...', COLORS.yellow));
  return new Promise(resolve => {
    process.stdin.once('data', () => resolve());
  });
}

function readConfig() {
  const cfg = { ...DEFAULT_CONFIG };
  if (!fs.existsSync(ENV_FILE)) return cfg;

  const content = fs.readFileSync(ENV_FILE, 'utf8');
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const [key, ...valueParts] = trimmed.split('=');
    const value = valueParts.join('=').trim();

    switch (key.trim()) {
      case 'PHOS_BACKEND_PORT': cfg.backendPort = value; break;
      case 'PHOS_GM_PORT': cfg.gmPort = value; break;
      case 'PHOS_PLAYER_PORT': cfg.playerPort = value; break;
      case 'PHOS_BACKEND_HOST': cfg.backendHost = value; break;
      case 'PHOS_GM_HOST': cfg.gmHost = value; break;
      case 'PHOS_PLAYER_HOST': cfg.playerHost = value; break;
      case 'PHOS_BACKEND_ORIGIN': cfg.backendOrigin = value; break;
    }
  }

  return cfg;
}

function saveConfig(cfg) {
  const content = [
    `# Auto-created by bootstrap.js on ${new Date().toISOString()}`,
    `PHOS_BACKEND_PORT=${cfg.backendPort}`,
    `PHOS_GM_PORT=${cfg.gmPort}`,
    `PHOS_PLAYER_PORT=${cfg.playerPort}`,
    '',
    '# Listen on every network card so friends can connect',
    `PHOS_BACKEND_HOST=${cfg.backendHost}`,
    `PHOS_GM_HOST=${cfg.gmHost}`,
    `PHOS_PLAYER_HOST=${cfg.playerHost}`,
    `PHOS_BACKEND_ORIGIN=${cfg.backendOrigin}`
  ].join('\n');

  fs.writeFileSync(ENV_FILE, content, 'utf8');
}

function ensureEnvFile() {
  if (!fs.existsSync(ENV_FILE)) {
    saveConfig(DEFAULT_CONFIG);
  }
}

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

    if (name) {
      process.env[name] = value;
    }
  }
}

function isNodeInstalled() {
  try {
    execSync('npm --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function getNpmVersion() {
  try {
    return execSync('npm --version', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function getNodeVersion() {
  try {
    return execSync('node --version', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function dependenciesReady() {
  return fs.existsSync(path.join(REPO_ROOT, 'node_modules'));
}

function buildReady() {
  const backendBuilt = fs.existsSync(path.join(REPO_ROOT, 'backend', 'dist', 'server.js'));
  const gmBuilt = fs.existsSync(path.join(REPO_ROOT, 'gm-client', 'dist', 'index.html'));
  const playerBuilt = fs.existsSync(path.join(REPO_ROOT, 'player-client', 'dist', 'index.html'));
  return backendBuilt && gmBuilt && playerBuilt;
}

async function promptYesNo(question, defaultYes = false) {
  const suffix = defaultYes ? ' [Y/n]: ' : ' [y/N]: ';
  const answer = await prompt(`${question}${suffix}`);
  if (!answer) {
    return defaultYes;
  }
  return /^y(es)?$/i.test(answer);
}

function readPidInfo() {
  if (!fs.existsSync(PID_FILE)) return null;
  const raw = fs.readFileSync(PID_FILE, 'utf8').trim();
  if (!raw) return null;

  try {
    const data = JSON.parse(raw);
    if (typeof data === 'number') {
      return { backend: data };
    }
    if (data && typeof data === 'object') {
      return data;
    }
  } catch {
    // Fall through to numeric parsing
  }

  const pid = parseInt(raw, 10);
  if (!Number.isNaN(pid)) {
    return { backend: pid };
  }
  return null;
}

function writePidInfo(info) {
  fs.writeFileSync(PID_FILE, JSON.stringify(info), 'utf8');
}

function isProcessRunning(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isStackRunning() {
  const info = readPidInfo();
  if (!info) return false;
  const pids = Object.values(info).filter(value => Number.isInteger(value));
  return pids.some(pid => isProcessRunning(pid));
}

function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }

  return ips;
}

function getDefaultLanIP() {
  const ips = getLocalIPs();
  // Prefer 192.168.x.x or 10.x.x.x addresses
  return ips.find(ip => ip.startsWith('192.168.') || ip.startsWith('10.')) || ips[0];
}

async function testServiceHealth(url, timeoutMs = 2000) {
  return new Promise(resolve => {
    const req = http.get(url, { timeout: timeoutMs }, res => {
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServices(backendUrl, gmUrl, playerUrl, maxWaitSeconds = 120) {
  const startTime = Date.now();
  const services = {
    'Phosphorite Server': { url: backendUrl, ready: false, symbol: '○' },
    'Game Master Dashboard': { url: gmUrl, ready: false, symbol: '○' },
    'Player Terminal': { url: playerUrl, ready: false, symbol: '○' }
  };

  console.log();
  console.log(color(' Starting up and connecting components...', COLORS.yellow));
  console.log();

  let lastLineLength = 0;

  while (true) {
    const elapsed = (Date.now() - startTime) / 1000;

    if (elapsed > maxWaitSeconds) {
      console.log();
      console.log(color(` Timeout waiting for services. Check logs: ${LOG_FILE}`, COLORS.red));
      return false;
    }

    // Check each service
    let allReady = true;
    for (const name of Object.keys(services)) {
      if (!services[name].ready) {
        const healthy = await testServiceHealth(services[name].url);
        if (healthy) {
          services[name].ready = true;
          services[name].symbol = '●';
        } else {
          allReady = false;
        }
      }
    }

    // Update display
    const statusParts = Object.keys(services).sort().map(name => {
      return `  ${services[name].symbol} ${name}`;
    });
    const statusLine = statusParts.join('');

    // Clear previous line
    if (lastLineLength > 0) {
      process.stdout.write('\r' + ' '.repeat(lastLineLength));
    }
    lastLineLength = statusLine.length;

    // Write new status
    process.stdout.write('\r' + statusLine);

    if (allReady) {
      console.log();
      console.log();
      console.log(color(' All components ready!', COLORS.green));
      await sleep(1000);
      return true;
    }

    await sleep(500);
  }
}

// ==================== Core Functions ====================

async function runProjectInstall() {
  clearScreen();
  writeSection('Install & Build', 'Setting up dependencies and production assets');

  if (!isNodeInstalled()) {
    console.log(color('Node.js is not installed!', COLORS.red));
    console.log('Please install Node.js from https://nodejs.org and try again.');
    await waitForKey();
    return;
  }

  ensureEnvFile();

  console.log(color('Installing packages (first run may take a few minutes)...', COLORS.yellow));

  return new Promise(resolve => {
    const npmInstall = spawn('npm', ['install'], {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      shell: true
    });

    npmInstall.on('close', code => {
      if (code === 0) {
        console.log();
        console.log(color('Installation summary:', COLORS.green));
        console.log(` - Node version : ${getNodeVersion()}`);
        console.log(` - npm version  : ${getNpmVersion()}`);
        console.log(color(' - Dependencies : ready', COLORS.green));
        runProjectBuild().then(() => resolve());
      } else {
        console.log(color(`Installation failed with exit code ${code}`, COLORS.red));
        waitForKey().then(resolve);
      }
    });
  });
}

async function runProjectBuild() {
  clearScreen();
  writeSection('Build', 'Compiling production assets');

  if (!isNodeInstalled()) {
    console.log(color('Node.js is not installed!', COLORS.red));
    console.log('Please install Node.js from https://nodejs.org and try again.');
    await waitForKey();
    return;
  }

  ensureEnvFile();
  loadEnvFile(path.join(REPO_ROOT, '.env'));
  loadEnvFile(ENV_FILE);

  console.log(color('Building production assets (this may take a few minutes)...', COLORS.yellow));

  return new Promise(resolve => {
    const npmBuild = spawn('npm', ['run', 'build'], {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      shell: true,
      env: { ...process.env }
    });

    npmBuild.on('close', code => {
      if (code === 0) {
        console.log();
        console.log(color('Build complete.', COLORS.green));
        setTimeout(resolve, 1500);
      } else {
        console.log(color(`Build failed with exit code ${code}`, COLORS.red));
        waitForKey().then(resolve);
      }
    });
  });
}

async function startStack() {
  if (isStackRunning()) {
    console.log(color('Already running.', COLORS.yellow));
    await sleep(1000);
    return true;
  }

  if (!dependenciesReady()) {
    console.log(color('Dependencies not found. Running installation...', COLORS.yellow));
    await runProjectInstall();
    if (!dependenciesReady()) {
      console.log(color('Installation incomplete. Cannot start Phosphorite.', COLORS.red));
      await waitForKey();
      return false;
    }
  }

  if (!buildReady()) {
    console.log(color('Production build not found. Building now...', COLORS.yellow));
    await runProjectBuild();
    if (!buildReady()) {
      console.log(color('Build incomplete. Cannot start Phosphorite.', COLORS.red));
      const tryDev = await promptYesNo('Start development servers instead?', false);
      if (tryDev) {
        return startDevStack();
      }
      await waitForKey();
      return false;
    }
  }

  ensureEnvFile();
  loadEnvFile(path.join(REPO_ROOT, '.env'));
  loadEnvFile(ENV_FILE);

  writeSection('Starting Phosphorite', 'Launching services');

  fs.writeFileSync(LOG_FILE, `Phosphorite logs - ${new Date().toISOString()}\n`, 'utf8');

  const cfg = readConfig();
  const backendUrl = `http://localhost:${cfg.backendPort}/api/health`;
  const gmUrl = `http://localhost:${cfg.gmPort}`;
  const playerUrl = `http://localhost:${cfg.playerPort}`;

  return new Promise(async resolve => {
    const childEnv = { ...process.env };
    const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

    const backendProcess = spawn('npm', ['run', 'start'], {
      cwd: path.join(REPO_ROOT, 'backend'),
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
      shell: true,
      env: childEnv
    });

    const gmProcess = spawn('npm', ['run', 'preview', '--', '--host', cfg.gmHost, '--port', cfg.gmPort], {
      cwd: path.join(REPO_ROOT, 'gm-client'),
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
      shell: true,
      env: childEnv
    });

    const playerProcess = spawn('npm', ['run', 'preview', '--', '--host', cfg.playerHost, '--port', cfg.playerPort], {
      cwd: path.join(REPO_ROOT, 'player-client'),
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
      shell: true,
      env: childEnv
    });

    writePidInfo({ backend: backendProcess.pid, gm: gmProcess.pid, player: playerProcess.pid });

    backendProcess.stdout.pipe(logStream);
    backendProcess.stderr.pipe(logStream);
    gmProcess.stdout.pipe(logStream);
    gmProcess.stderr.pipe(logStream);
    playerProcess.stdout.pipe(logStream);
    playerProcess.stderr.pipe(logStream);

    await sleep(2000);

    const processes = [
      { name: 'backend', pid: backendProcess.pid },
      { name: 'gm-client', pid: gmProcess.pid },
      { name: 'player-client', pid: playerProcess.pid }
    ];

    const deadProcess = processes.find(proc => !isProcessRunning(proc.pid));
    if (deadProcess) {
      console.log(color(`Phosphorite ${deadProcess.name} terminated unexpectedly. Check logs at ${LOG_FILE}`, COLORS.red));
      await waitForKey();
      await stopStack(true);
      resolve(false);
      return;
    }

    const ready = await waitForServices(backendUrl, gmUrl, playerUrl);

    if (!ready) {
      console.log(color('Some services failed to start. Check logs: ' + LOG_FILE, COLORS.red));
      const tryDev = await promptYesNo('Start development servers instead?', false);
      if (tryDev) {
        await stopStack(true);
        resolve(await startDevStack());
        return;
      }
      await waitForKey();
      await stopStack(true);
      resolve(false);
      return;
    }

    resolve(true);
  });
}

async function startDevStack() {
  ensureEnvFile();
  loadEnvFile(path.join(REPO_ROOT, '.env'));
  loadEnvFile(ENV_FILE);

  writeSection('Starting Phosphorite', 'Launching development services');

  fs.writeFileSync(LOG_FILE, `Phosphorite logs - ${new Date().toISOString()}\n`, 'utf8');

  const cfg = readConfig();
  const backendUrl = `http://localhost:${cfg.backendPort}/api/health`;
  const gmUrl = `http://localhost:${cfg.gmPort}`;
  const playerUrl = `http://localhost:${cfg.playerPort}`;

  return new Promise(async resolve => {
    const devProcess = spawn('npm', ['run', 'dev'], {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
      shell: true,
      env: { ...process.env }
    });

    writePidInfo({ backend: devProcess.pid });

    const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
    devProcess.stdout.pipe(logStream);
    devProcess.stderr.pipe(logStream);

    await sleep(2000);

    if (!isProcessRunning(devProcess.pid)) {
      console.log(color('Phosphorite terminated unexpectedly. Check logs at ' + LOG_FILE, COLORS.red));
      await waitForKey();
      resolve(false);
      return;
    }

    const ready = await waitForServices(backendUrl, gmUrl, playerUrl);

    if (!ready) {
      console.log(color('Some services failed to start. Check logs: ' + LOG_FILE, COLORS.red));
      await waitForKey();
      await stopStack(true);
      resolve(false);
      return;
    }

    resolve(true);
  });
}

function stopProcessTree(pid) {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
    } else {
      process.kill(-pid, 'SIGTERM');
    }
  } catch {
    // Process may have already exited
  }
}

async function stopStack(silent = false) {
  if (!fs.existsSync(PID_FILE)) {
    if (!silent) {
      console.log(color('Phosphorite is not currently running.', COLORS.yellow));
    }
    return;
  }
  const info = readPidInfo();
  if (!info) {
    fs.unlinkSync(PID_FILE);
    if (!silent) {
      console.log(color('Cleared an invalid PID file.', COLORS.yellow));
    }
    return;
  }

  const pids = Object.values(info).filter(value => Number.isInteger(value));
  if (pids.length === 0) {
    fs.unlinkSync(PID_FILE);
    if (!silent) {
      console.log(color('Cleared an invalid PID file.', COLORS.yellow));
    }
    return;
  }

  if (!silent) {
    writeSection('Stopping Phosphorite');
  }

  for (const pid of pids) {
    if (isProcessRunning(pid)) {
      stopProcessTree(pid);
    }
  }

  if (!silent) {
    console.log(color('Phosphorite stopped.', COLORS.green));
    await sleep(1000);
  }

  try {
    fs.unlinkSync(PID_FILE);
  } catch {
    // File may already be deleted
  }
}

async function showConfigureMenu() {
  ensureEnvFile();

  while (true) {
    clearScreen();
    const cfg = readConfig();
    writeSection('Port Configuration', 'Customize network settings');

    console.log(` Backend port : ${cfg.backendPort}`);
    console.log(` GM port      : ${cfg.gmPort}`);
    console.log(` Player port  : ${cfg.playerPort}`);
    console.log();
    console.log(' [1] Edit ports');
    console.log(' [2] Reset to defaults');
    console.log(' [0] Back');
    console.log();

    const choice = await promptSingleKey('Select option: ', ['0', '1', '2']);

    switch (choice) {
      case '1':
        cfg.backendPort = await prompt('Backend port', cfg.backendPort);
        cfg.gmPort = await prompt('GM dashboard port', cfg.gmPort);
        cfg.playerPort = await prompt('Player terminal port', cfg.playerPort);
        saveConfig(cfg);
        break;
      case '2':
        saveConfig(DEFAULT_CONFIG);
        break;
      case '0':
        return;
      default:
        console.log(color('Please pick 0, 1, or 2.', COLORS.yellow));
        await sleep(800);
    }
  }
}

async function showRunningMenu() {
  clearScreen();
  const cfg = readConfig();
  const defaultIp = getDefaultLanIP();
  const allIps = getLocalIPs();

  writeSection('Phosphorite Running', 'Share these URLs with players');

  if (defaultIp) {
    console.log(color(' Network URLs (for other devices):', COLORS.green));
    console.log(color(`  Game Master Dashboard : http://${defaultIp}:${cfg.gmPort}`, COLORS.cyan));
    console.log(color(`  Player Terminal       : http://${defaultIp}:${cfg.playerPort}`, COLORS.cyan));
    console.log();
  }

  const alternatives = allIps.filter(ip => ip !== defaultIp);
  if (alternatives.length > 0) {
    console.log(color(' Alternative network addresses (if primary doesn\'t work):', COLORS.yellow));
    for (const ip of alternatives) {
      console.log(color(`  Game Master Dashboard : http://${ip}:${cfg.gmPort}`, COLORS.darkYellow));
      console.log(color(`  Player Terminal       : http://${ip}:${cfg.playerPort}`, COLORS.darkYellow));
      console.log();
    }
  }

  console.log(color(' Local URLs (this computer only):', COLORS.gray));
  console.log(`  Game Master Dashboard : http://localhost:${cfg.gmPort}`);
  console.log(`  Player Terminal       : http://localhost:${cfg.playerPort}`);
  console.log();
  console.log(color(` Logs: ${LOG_FILE}`, COLORS.gray));
  console.log();
  console.log(color(' Type \'stop\' and press Enter to shut down Phosphorite.', COLORS.yellow));
  console.log();

  while (true) {
    const input = await prompt('');
    if (input === 'stop') {
      await stopStack();
      return;
    } else if (['back', 'exit', 'menu'].includes(input)) {
      return;
    } else if (input) {
      console.log(color('Unknown command. Type \'stop\' to shut down.', COLORS.yellow));
    }
  }
}

async function showStartStop() {
  if (isStackRunning()) {
    await showRunningMenu();
  } else {
    const started = await startStack();
    if (started) {
      await showRunningMenu();
    }
  }
}

function getInstallStatus() {
  const nodeInstalled = isNodeInstalled();
  const nodeStatus = nodeInstalled ? `Ready (npm ${getNpmVersion()})` : 'Missing';
  const depsStatus = dependenciesReady() ? 'Installed' : 'Run option 1 first';
  const buildStatus = buildReady() ? 'Built' : 'Not built';
  const configStatus = fs.existsSync(ENV_FILE) ? '.env.local present' : 'Not configured';
  const runningStatus = isStackRunning() ? 'Game is running' : 'Stopped';

  return { nodeStatus, depsStatus, buildStatus, configStatus, runningStatus };
}

async function showMainMenu() {
  while (true) {
    clearScreen();
    const status = getInstallStatus();
    const isRunning = isStackRunning();

    writeSection('Phosphorite Launcher', 'Made with Love');

    console.log(` Node.js       : ${status.nodeStatus}`);
    console.log(` Dependencies  : ${status.depsStatus}`);
    console.log(` Build         : ${status.buildStatus}`);
    console.log(` Config file   : ${status.configStatus}`);
    console.log(` Game status   : ${status.runningStatus}`);
    console.log();

    const startLabel = isRunning ? 'View Phosphorite status' : 'Start Phosphorite';
    console.log(' [1] Install or repair');
    console.log(` [2] ${startLabel}`);
    console.log(' [3] Settings');
    console.log(' [0] Exit');
    console.log();

    const choice = await promptSingleKey('Select option: ', ['0', '1', '2', '3']);

    switch (choice) {
      case '1':
        await runProjectInstall();
        break;
      case '2':
        await showStartStop();
        break;
      case '3':
        await showConfigureMenu();
        break;
      case '0':
        await stopStack(true);
        console.log(color('Bye! See you for the next mission.', COLORS.cyan));
        process.exit(0);
      default:
        console.log(color('Please choose 0-3.', COLORS.yellow));
        await sleep(800);
    }
  }
}

// ==================== Entry Point ====================

// Set up stdin for interactive mode
if (process.stdin.isTTY) {
  process.stdin.setRawMode(false);
}

// Handle cleanup on exit
process.on('SIGINT', async () => {
  console.log();
  await stopStack(true);
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await stopStack(true);
  process.exit(0);
});

// Start the launcher
showMainMenu().catch(err => {
  console.error(color('Fatal error:', COLORS.red), err);
  process.exit(1);
});
