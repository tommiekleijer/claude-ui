import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const backendPort = Number(process.env.PORT ?? 4317);

export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: { outDir: '../dist/web', emptyOutDir: true },
  server: {
    host: '127.0.0.1',
    port: Number(process.env.VITE_PORT ?? 5173),
    strictPort: true,
    proxy: { '/ws': { target: `ws://127.0.0.1:${backendPort}`, ws: true } },
    // vertex is een gelinkt pakket in ../vertex (tokens en lettertype); Vite moet daar bestanden uit mogen serveren.
    fs: { allow: [fileURLToPath(new URL('.', import.meta.url)), fileURLToPath(new URL('../vertex', import.meta.url))] },
  },
});
