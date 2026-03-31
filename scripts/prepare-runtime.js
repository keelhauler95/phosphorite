#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const RUNTIME_ROOT = path.join(REPO_ROOT, 'launcher-app', 'runtime');

function ensureExists(targetPath, description) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Missing ${description}: ${targetPath}`);
  }
}

function resetDirectory(targetPath) {
  fs.rmSync(targetPath, { recursive: true, force: true });
  fs.mkdirSync(targetPath, { recursive: true });
}

function copyRecursive(source, destination) {
  fs.cpSync(source, destination, { recursive: true, force: true });
}

function runNpmInstall(targetDirectory) {
  execSync('npm install --omit=dev', {
    cwd: targetDirectory,
    stdio: 'inherit',
    shell: true
  });
}

function main() {
  const backendDist = path.join(REPO_ROOT, 'backend', 'dist');
  const backendPackageJson = path.join(REPO_ROOT, 'backend', 'package.json');
  const backendPackageLock = path.join(REPO_ROOT, 'backend', 'package-lock.json');
  const gmDist = path.join(REPO_ROOT, 'gm-client', 'dist');
  const playerDist = path.join(REPO_ROOT, 'player-client', 'dist');
  const staticServerScript = path.join(REPO_ROOT, 'scripts', 'serve-client.js');

  ensureExists(backendDist, 'backend build output');
  ensureExists(backendPackageJson, 'backend package.json');
  ensureExists(backendPackageLock, 'backend package-lock.json');
  ensureExists(gmDist, 'GM client build output');
  ensureExists(playerDist, 'player client build output');
  ensureExists(staticServerScript, 'client server script');

  resetDirectory(RUNTIME_ROOT);

  const runtimeBackendDir = path.join(RUNTIME_ROOT, 'backend');
  fs.mkdirSync(runtimeBackendDir, { recursive: true });
  copyRecursive(backendDist, path.join(runtimeBackendDir, 'dist'));
  fs.copyFileSync(backendPackageJson, path.join(runtimeBackendDir, 'package.json'));
  fs.copyFileSync(backendPackageLock, path.join(runtimeBackendDir, 'package-lock.json'));
  runNpmInstall(runtimeBackendDir);

  copyRecursive(gmDist, path.join(RUNTIME_ROOT, 'gm-client', 'dist'));
  copyRecursive(playerDist, path.join(RUNTIME_ROOT, 'player-client', 'dist'));
  fs.mkdirSync(path.join(RUNTIME_ROOT, 'scripts'), { recursive: true });
  fs.copyFileSync(staticServerScript, path.join(RUNTIME_ROOT, 'scripts', 'serve-client.js'));

  console.log(`Prepared launcher runtime in ${RUNTIME_ROOT}`);
}

main();