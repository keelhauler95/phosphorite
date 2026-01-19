import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const playerHost = env.PHOS_PLAYER_HOST || '0.0.0.0';
  const playerPort = Number(env.PHOS_PLAYER_PORT) || 5174;
  const backendPort = Number(env.PHOS_BACKEND_PORT) || 3100;
  const backendHost = env.PHOS_BACKEND_HOST || 'localhost';
  const backendOrigin = env.PHOS_BACKEND_ORIGIN || `http://${backendHost}:${backendPort}`;

  return {
    plugins: [react()],
    server: {
      host: playerHost,
      port: playerPort,
      proxy: {
        '/api': {
          target: backendOrigin,
          changeOrigin: true
        },
        '/socket.io': {
          target: backendOrigin,
          changeOrigin: true,
          ws: true
        }
      }
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              return 'vendor';
            }
          }
        }
      }
    },
    preview: {
      host: playerHost,
      port: playerPort,
      proxy: {
        '/api': {
          target: backendOrigin,
          changeOrigin: true
        },
        '/socket.io': {
          target: backendOrigin,
          changeOrigin: true,
          ws: true
        }
      }
    }
  };
});
