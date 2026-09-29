import { defineConfig } from 'vite';

// ngrok tunnel host for sharing the preview outside localhost
const NGROK_HOST = 'glowworm-episode-confound.ngrok-free.dev';

export default defineConfig({
  server: {
    allowedHosts: [NGROK_HOST],
  },
  preview: {
    allowedHosts: [NGROK_HOST],
  },
});
