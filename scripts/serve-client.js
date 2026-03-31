#!/usr/bin/env node

const fs = require('fs');
const http = require('http');
const path = require('path');

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon'
};

function getArg(name, fallback = '') {
  const prefix = `--${name}=`;
  const arg = process.argv.find(value => value.startsWith(prefix));
  if (arg) {
    return arg.slice(prefix.length);
  }
  return process.env[name.toUpperCase()] || fallback;
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, '');
}

function resolveBackendOrigin(clientHostname, backendPort, backendOriginOverride) {
  if (backendOriginOverride) {
    return normalizeBaseUrl(backendOriginOverride);
  }

  const safeHostname = !clientHostname || clientHostname === '0.0.0.0' ? '127.0.0.1' : clientHostname;
  return `http://${safeHostname}:${backendPort}`;
}

function getRuntimeConfig(clientHostname, backendPort, backendOriginOverride) {
  const backendOrigin = resolveBackendOrigin(clientHostname, backendPort, backendOriginOverride);

  return {
    apiBaseUrl: `${backendOrigin}/api`,
    socketUrl: backendOrigin
  };
}

function resolveSafePath(rootDir, requestPath) {
  const absoluteRoot = path.resolve(rootDir);
  const safeRelativePath = requestPath.replace(/^\/+/, '') || 'index.html';
  const candidatePath = path.resolve(absoluteRoot, safeRelativePath);

  if (!candidatePath.startsWith(absoluteRoot)) {
    return null;
  }

  return candidatePath;
}

function serveFile(filePath, response) {
  const extension = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[extension] || 'application/octet-stream';

  fs.createReadStream(filePath)
    .on('open', () => {
      response.writeHead(200, { 'Content-Type': contentType });
    })
    .on('error', () => {
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Failed to read file.');
    })
    .pipe(response);
}

function main() {
  const rootDir = getArg('root-dir');
  const host = getArg('host', '127.0.0.1');
  const port = Number(getArg('port', '0'));
  const title = getArg('title', 'Phosphorite Client');
  const backendOriginOverride = getArg('backend-origin', '').trim();
  const backendPort = Number(getArg('backend-port', '3100')) || 3100;

  if (!rootDir) {
    throw new Error('Missing --root-dir argument.');
  }

  if (!port) {
    throw new Error('Missing --port argument.');
  }

  const indexPath = path.join(rootDir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    throw new Error(`Client build not found at ${indexPath}`);
  }

  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`);
    const pathname = decodeURIComponent(requestUrl.pathname);

    if (pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ status: 'ok', title }));
      return;
    }

    if (pathname === '/phosphorite-runtime-config.js') {
      const runtimeConfigBody = `window.__PHOS_RUNTIME_CONFIG__ = ${JSON.stringify(
        getRuntimeConfig(requestUrl.hostname, backendPort, backendOriginOverride)
      )};`;
      response.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      response.end(runtimeConfigBody);
      return;
    }

    const candidatePath = resolveSafePath(rootDir, pathname);
    if (!candidatePath) {
      response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Forbidden');
      return;
    }

    if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
      serveFile(candidatePath, response);
      return;
    }

    serveFile(indexPath, response);
  });

  server.listen(port, host, () => {
    console.log(`${title} listening on http://${host}:${port}`);
  });
}

main();