type PhosphoriteRuntimeConfig = {
  apiBaseUrl?: string;
  socketUrl?: string;
};

declare global {
  interface Window {
    __PHOS_RUNTIME_CONFIG__?: PhosphoriteRuntimeConfig;
  }
}

function getRuntimeConfig(): PhosphoriteRuntimeConfig {
  return window.__PHOS_RUNTIME_CONFIG__ || {};
}

export function getApiBaseUrl(): string {
  return getRuntimeConfig().apiBaseUrl || '/api';
}

export function getSocketUrl(): string {
  return getRuntimeConfig().socketUrl || window.location.origin;
}