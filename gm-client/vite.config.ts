import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const gmHost = env.PHOS_GM_HOST || '0.0.0.0';
  const gmPort = Number(env.PHOS_GM_PORT) || 5173;
  const backendPort = Number(env.PHOS_BACKEND_PORT) || 3100;
  const backendHost = env.PHOS_BACKEND_HOST || 'localhost';
  const backendOrigin = env.PHOS_BACKEND_ORIGIN || `http://${backendHost}:${backendPort}`;

  return {
    plugins: [react()],
    server: {
      host: gmHost,
      port: gmPort,
      proxy: {
        '/api': {
          target: backendOrigin,
          changeOrigin: true
        },
        '/socket.io': {
          target: backendOrigin,
          ws: true
        }
      }
    },
    build: {
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
                return 'react-vendor';
              }
              if (id.includes('socket.io-client')) {
                return 'socket-vendor';
              }
              if (id.includes('axios')) {
                return 'axios-vendor';
              }
              if (id.includes('lucide-react')) {
                return 'icons-vendor';
              }
              if (id.includes('@uiw/react-textarea-code-editor')) {
                return 'editor-vendor';
              }
            }
            return undefined;
          }
        }
      }
    },
    preview: {
      host: gmHost,
      port: gmPort,
      proxy: {
        '/api': {
          target: backendOrigin,
          changeOrigin: true
        },
        '/socket.io': {
          target: backendOrigin,
          ws: true
        }
      }
    }
  };
});
