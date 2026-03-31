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
  backendUrl: document.getElementById('backendUrl'),
  gmUrl: document.getElementById('gmUrl'),
  playerUrl: document.getElementById('playerUrl')
};

function setMessage(message, isError = false) {
  elements.message.textContent = message;
  elements.message.dataset.tone = isError ? 'error' : 'default';
}

function setBusy(isBusy) {
  state.busy = isBusy;
  const disabled = isBusy;

  elements.saveButton.disabled = disabled;
  elements.startButton.disabled = disabled;
  elements.stopButton.disabled = disabled;
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

  elements.openGmButton.disabled = !snapshot.services.gm.healthy;
  elements.openPlayerButton.disabled = !snapshot.services.player.healthy;
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

elements.saveButton.addEventListener('click', saveConfig);
elements.startButton.addEventListener('click', startStack);
elements.stopButton.addEventListener('click', stopStack);
elements.openGmButton.addEventListener('click', () => window.phosphoriteLauncher.open('gm'));
elements.openPlayerButton.addEventListener('click', () => window.phosphoriteLauncher.open('player'));
elements.openDataButton.addEventListener('click', () => window.phosphoriteLauncher.open('data'));

refreshState();
window.setInterval(refreshState, 2000);