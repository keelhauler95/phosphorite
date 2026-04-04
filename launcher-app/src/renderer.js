const state = {
  busy: false,
  pendingConfig: null,
  snapshot: null
};

const portFieldMap = {
  backend: 'backendPort',
  gm: 'gmPort',
  player: 'playerPort'
};

const elements = {
  headerIcon: document.getElementById('headerIcon'),
  backendPort: document.getElementById('backendPort'),
  gmPort: document.getElementById('gmPort'),
  playerPort: document.getElementById('playerPort'),
  stackToggleButton: document.getElementById('stackToggleButton'),
  toggleBackendButton: document.getElementById('toggleBackendButton'),
  toggleGmButton: document.getElementById('toggleGmButton'),
  togglePlayerButton: document.getElementById('togglePlayerButton'),
  openGmButton: document.getElementById('openGmButton'),
  openPlayerButton: document.getElementById('openPlayerButton'),
  openDataButton: document.getElementById('openDataButton'),
  openLogButton: document.getElementById('openLogButton'),
  message: document.getElementById('message'),
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
  'stackToggleButton',
  'toggleBackendButton',
  'toggleGmButton',
  'togglePlayerButton',
  'openGmButton',
  'openPlayerButton',
  'openDataButton',
  'openLogButton'
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

  if (state.snapshot) {
    renderState(state.snapshot);
  }
}

function renderBadge(element, service) {
  element.textContent = service.healthy ? 'Healthy' : service.running ? 'Starting' : 'Stopped';
  element.dataset.state = service.healthy ? 'healthy' : service.running ? 'starting' : 'stopped';
}

function renderToggleButton(button, isRunning, startLabel, stopLabel) {
  const iconUse = button.querySelector('use');
  const label = button.querySelector('span');

  if (iconUse) {
    iconUse.setAttribute('href', isRunning ? '#icon-stop' : '#icon-play');
  }

  if (label) {
    label.textContent = isRunning ? stopLabel : startLabel;
  }

  button.dataset.mode = isRunning ? 'stop' : 'start';
}

function setPortEditable(input, isEditable) {
  input.disabled = !isEditable;
  input.closest('.service-port-field')?.classList.toggle('is-disabled', !isEditable);
}

function snapshotConfigToInputs(config) {
  return {
    backendPort: String(config.backendPort),
    gmPort: String(config.gmPort),
    playerPort: String(config.playerPort)
  };
}

function syncPendingConfig(snapshot) {
  const snapshotInputs = snapshotConfigToInputs(snapshot.config);

  if (!state.pendingConfig) {
    state.pendingConfig = snapshotInputs;
    return;
  }

  for (const [serviceName, fieldName] of Object.entries(portFieldMap)) {
    if (snapshot.services[serviceName].running) {
      state.pendingConfig[fieldName] = snapshotInputs[fieldName];
    }
  }
}

function renderState(snapshot) {
  state.snapshot = snapshot;
  syncPendingConfig(snapshot);

  elements.backendPort.value = state.pendingConfig.backendPort;
  elements.gmPort.value = state.pendingConfig.gmPort;
  elements.playerPort.value = state.pendingConfig.playerPort;
  elements.headerIcon.src = snapshot.launcherIconUrl;

  elements.stackState.textContent = snapshot.stackRunning ? 'Running' : 'Idle';
  elements.backendUrl.textContent = snapshot.services.backend.url;
  elements.gmUrl.textContent = snapshot.services.gm.url;
  elements.playerUrl.textContent = snapshot.services.player.url;

  renderBadge(elements.backendStatus, snapshot.services.backend);
  renderBadge(elements.gmStatus, snapshot.services.gm);
  renderBadge(elements.playerStatus, snapshot.services.player);

  renderToggleButton(elements.stackToggleButton, snapshot.stackRunning, 'Start All', 'Stop All');
  renderToggleButton(elements.toggleBackendButton, snapshot.services.backend.running, 'Start', 'Stop');
  renderToggleButton(elements.toggleGmButton, snapshot.services.gm.running, 'Start', 'Stop');
  renderToggleButton(elements.togglePlayerButton, snapshot.services.player.running, 'Start', 'Stop');

  setPortEditable(elements.backendPort, !state.busy && !snapshot.services.backend.running);
  setPortEditable(elements.gmPort, !state.busy && !snapshot.services.gm.running);
  setPortEditable(elements.playerPort, !state.busy && !snapshot.services.player.running);

  elements.stackToggleButton.disabled = state.busy;
  elements.toggleBackendButton.disabled = state.busy;
  elements.toggleGmButton.disabled = state.busy;
  elements.togglePlayerButton.disabled = state.busy;
  elements.openGmButton.disabled = state.busy || !snapshot.services.gm.healthy;
  elements.openPlayerButton.disabled = state.busy || !snapshot.services.player.healthy;

  if (!snapshot.lanShares || snapshot.lanShares.length === 0) {
    elements.lanShareList.dataset.count = '0';
    elements.lanShareList.innerHTML = '<p class="lan-empty">No LAN interface detected. Connect to a local network to get share links.</p>';
  } else {
    elements.lanShareList.dataset.count = String(snapshot.lanShares.length);
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

function getPendingConfig() {
  return {
    backendPort: Number(state.pendingConfig.backendPort),
    gmPort: Number(state.pendingConfig.gmPort),
    playerPort: Number(state.pendingConfig.playerPort)
  };
}

async function persistPendingConfig() {
  const snapshot = await window.phosphoriteLauncher.saveConfig(getPendingConfig());
  state.pendingConfig = snapshotConfigToInputs(snapshot.config);
  return snapshot;
}

async function startStack() {
  setBusy(true);
  setMessage('');

  try {
    await persistPendingConfig();
    const snapshot = await window.phosphoriteLauncher.start();
    renderState(snapshot);
  } catch (error) {
    setMessage(error.message || 'Failed to start services.', true);
  } finally {
    setBusy(false);
  }
}

async function stopStack() {
  setBusy(true);
  setMessage('');

  try {
    const snapshot = await window.phosphoriteLauncher.stop();
    renderState(snapshot);
  } catch (error) {
    setMessage(error.message || 'Failed to stop services.', true);
  } finally {
    setBusy(false);
  }
}

async function startService(serviceName, label) {
  setBusy(true);
  setMessage('');

  try {
    await persistPendingConfig();
    const snapshot = await window.phosphoriteLauncher.startService(serviceName);
    renderState(snapshot);
  } catch (error) {
    setMessage(error.message || `Failed to start ${label}.`, true);
  } finally {
    setBusy(false);
  }
}

async function stopService(serviceName, label) {
  setBusy(true);
  setMessage('');

  try {
    const snapshot = await window.phosphoriteLauncher.stopService(serviceName);
    renderState(snapshot);
  } catch (error) {
    setMessage(error.message || `Failed to stop ${label}.`, true);
  } finally {
    setBusy(false);
  }
}

async function openTarget(target, label) {
  setBusy(true);
  setMessage('');

  try {
    await window.phosphoriteLauncher.open(target);
    const snapshot = await window.phosphoriteLauncher.getState();
    renderState(snapshot);
  } catch (error) {
    setMessage(error.message || `Failed to open ${label}.`, true);
  } finally {
    setBusy(false);
  }
}

async function toggleStack() {
  if (!state.snapshot) {
    return;
  }

  if (state.snapshot.stackRunning) {
    await stopStack();
    return;
  }

  await startStack();
}

async function toggleService(serviceName, label) {
  if (!state.snapshot) {
    return;
  }

  if (state.snapshot.services[serviceName].running) {
    await stopService(serviceName, label);
    return;
  }

  await startService(serviceName, label);
}

elements.stackToggleButton.addEventListener('click', toggleStack);
elements.toggleBackendButton.addEventListener('click', () => toggleService('backend', 'backend'));
elements.toggleGmButton.addEventListener('click', () => toggleService('gm', 'GM view'));
elements.togglePlayerButton.addEventListener('click', () => toggleService('player', 'player view'));
elements.openGmButton.addEventListener('click', () => openTarget('gm', 'GM view'));
elements.openPlayerButton.addEventListener('click', () => openTarget('player', 'player view'));
elements.openDataButton.addEventListener('click', () => openTarget('data', 'data folder'));
elements.openLogButton.addEventListener('click', () => openTarget('log', 'log file'));

elements.backendPort.addEventListener('input', event => {
  state.pendingConfig.backendPort = event.target.value;
});

elements.gmPort.addEventListener('input', event => {
  state.pendingConfig.gmPort = event.target.value;
});

elements.playerPort.addEventListener('input', event => {
  state.pendingConfig.playerPort = event.target.value;
});

refreshState();
window.setInterval(refreshState, 2000);