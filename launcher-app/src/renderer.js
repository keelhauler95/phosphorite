const state = {
  busy: false
};

const elements = {
  backendPort: document.getElementById('backendPort'),
  gmPort: document.getElementById('gmPort'),
  playerPort: document.getElementById('playerPort'),
  saveButton: document.getElementById('saveButton'),
  startButton: document.getElementById('startButton'),
  stopButton: document.getElementById('stopButton'),
  startBackendButton: document.getElementById('startBackendButton'),
  stopBackendButton: document.getElementById('stopBackendButton'),
  startGmButton: document.getElementById('startGmButton'),
  stopGmButton: document.getElementById('stopGmButton'),
  startPlayerButton: document.getElementById('startPlayerButton'),
  stopPlayerButton: document.getElementById('stopPlayerButton'),
  openGmButton: document.getElementById('openGmButton'),
  openPlayerButton: document.getElementById('openPlayerButton'),
  openDataButton: document.getElementById('openDataButton'),
  message: document.getElementById('message'),
  runtimeRoot: document.getElementById('runtimeRoot'),
  dataDir: document.getElementById('dataDir'),
  logs: document.getElementById('logs'),
  stackState: document.getElementById('stackState'),
  backendStatus: document.getElementById('backendStatus'),
  gmStatus: document.getElementById('gmStatus'),
  playerStatus: document.getElementById('playerStatus'),
  lanShareList: document.getElementById('lanShareList'),
  backendUrl: document.getElementById('backendUrl'),
  gmUrl: document.getElementById('gmUrl'),
  playerUrl: document.getElementById('playerUrl')
};

const actionButtons = [
  'saveButton',
  'startButton',
  'stopButton',
  'startBackendButton',
  'stopBackendButton',
  'startGmButton',
  'stopGmButton',
  'startPlayerButton',
  'stopPlayerButton',
  'openGmButton',
  'openPlayerButton',
  'openDataButton'
].map(key => elements[key]);

function setMessage(message, isError = false) {
  elements.message.textContent = message;
  elements.message.dataset.tone = isError ? 'error' : 'default';
}

function setBusy(isBusy) {
  state.busy = isBusy;
  for (const button of actionButtons) {
    if (button) {
      button.disabled = isBusy;
    }
  }
}

function renderBadge(element, service) {
  element.textContent = service.healthy ? 'Healthy' : service.running ? 'Starting' : 'Stopped';
  element.dataset.state = service.healthy ? 'healthy' : service.running ? 'starting' : 'stopped';
}

function renderState(snapshot) {
  elements.backendPort.value = snapshot.config.backendPort;
  elements.gmPort.value = snapshot.config.gmPort;
  elements.playerPort.value = snapshot.config.playerPort;

  elements.runtimeRoot.textContent = snapshot.runtimeRoot;
  elements.dataDir.textContent = snapshot.dataDir;
  elements.logs.textContent = snapshot.logs.length > 0 ? snapshot.logs.join('\n') : 'No logs yet.';
  elements.logs.scrollTop = elements.logs.scrollHeight;
  elements.stackState.textContent = snapshot.stackRunning ? 'Running' : 'Idle';
  elements.backendUrl.textContent = snapshot.services.backend.url;
  elements.gmUrl.textContent = snapshot.services.gm.url;
  elements.playerUrl.textContent = snapshot.services.player.url;

  renderBadge(elements.backendStatus, snapshot.services.backend);
  renderBadge(elements.gmStatus, snapshot.services.gm);
  renderBadge(elements.playerStatus, snapshot.services.player);

  elements.startBackendButton.disabled = state.busy || snapshot.services.backend.running;
  elements.stopBackendButton.disabled = state.busy || !snapshot.services.backend.running;
  elements.startGmButton.disabled = state.busy || snapshot.services.gm.running;
  elements.stopGmButton.disabled = state.busy || !snapshot.services.gm.running;
  elements.startPlayerButton.disabled = state.busy || snapshot.services.player.running;
  elements.stopPlayerButton.disabled = state.busy || !snapshot.services.player.running;

  elements.openGmButton.disabled = !snapshot.services.gm.healthy;
  elements.openPlayerButton.disabled = !snapshot.services.player.healthy;

  if (!snapshot.lanShares || snapshot.lanShares.length === 0) {
    elements.lanShareList.innerHTML = '<p class="lan-empty">No LAN interface detected. Connect to a local network to get share links.</p>';
  } else {
    elements.lanShareList.innerHTML = snapshot.lanShares
      .map(share => `
        <article class="lan-share-item">
          <h4>${share.ip}</h4>
          <p><strong>GM:</strong> ${share.gmUrl}</p>
          <p><strong>Player:</strong> ${share.playerUrl}</p>
        </article>
      `)
      .join('');
  }
}

async function refreshState() {
  const snapshot = await window.phosphoriteLauncher.getState();
  renderState(snapshot);
}

async function saveConfig() {
  setBusy(true);
  setMessage('Saving configuration...');

  try {
    const snapshot = await window.phosphoriteLauncher.saveConfig({
      backendPort: Number(elements.backendPort.value),
      gmPort: Number(elements.gmPort.value),
      playerPort: Number(elements.playerPort.value)
    });
    renderState(snapshot);
    setMessage('Configuration saved.');
  } catch (error) {
    setMessage(error.message || 'Failed to save configuration.', true);
  } finally {
    setBusy(false);
  }
}

async function startStack() {
  setBusy(true);
  setMessage('Starting services...');

  try {
    const snapshot = await window.phosphoriteLauncher.start();
    renderState(snapshot);
    setMessage('Services started.');
  } catch (error) {
    setMessage(error.message || 'Failed to start services.', true);
  } finally {
    setBusy(false);
  }
}

async function stopStack() {
  setBusy(true);
  setMessage('Stopping services...');

  try {
    const snapshot = await window.phosphoriteLauncher.stop();
    renderState(snapshot);
    setMessage('Services stopped.');
  } catch (error) {
    setMessage(error.message || 'Failed to stop services.', true);
  } finally {
    setBusy(false);
  }
}

async function startService(serviceName, label) {
  setBusy(true);
  setMessage(`Starting ${label}...`);

  try {
    const snapshot = await window.phosphoriteLauncher.startService(serviceName);
    renderState(snapshot);
    setMessage(`${label} started.`);
  } catch (error) {
    setMessage(error.message || `Failed to start ${label}.`, true);
  } finally {
    setBusy(false);
  }
}

async function stopService(serviceName, label) {
  setBusy(true);
  setMessage(`Stopping ${label}...`);

  try {
    const snapshot = await window.phosphoriteLauncher.stopService(serviceName);
    renderState(snapshot);
    setMessage(`${label} stopped.`);
  } catch (error) {
    setMessage(error.message || `Failed to stop ${label}.`, true);
  } finally {
    setBusy(false);
  }
}

elements.saveButton.addEventListener('click', saveConfig);
elements.startButton.addEventListener('click', startStack);
elements.stopButton.addEventListener('click', stopStack);
elements.startBackendButton.addEventListener('click', () => startService('backend', 'backend'));
elements.stopBackendButton.addEventListener('click', () => stopService('backend', 'backend'));
elements.startGmButton.addEventListener('click', () => startService('gm', 'GM view'));
elements.stopGmButton.addEventListener('click', () => stopService('gm', 'GM view'));
elements.startPlayerButton.addEventListener('click', () => startService('player', 'player view'));
elements.stopPlayerButton.addEventListener('click', () => stopService('player', 'player view'));
elements.openGmButton.addEventListener('click', () => window.phosphoriteLauncher.open('gm'));
elements.openPlayerButton.addEventListener('click', () => window.phosphoriteLauncher.open('player'));
elements.openDataButton.addEventListener('click', () => window.phosphoriteLauncher.open('data'));

refreshState();
window.setInterval(refreshState, 2000);