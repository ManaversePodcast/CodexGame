import { defineConfig } from 'vite';
export default defineConfig({
  build: { outDir: 'dist/client' },
  server: { proxy: { '/ws': { target: 'ws://127.0.0.1:3001', ws: true } } },
});
