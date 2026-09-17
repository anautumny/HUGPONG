import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../react-dist',
    emptyOutDir: true
  },
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://localhost:3000',
      '/api': 'http://localhost:3000'
    }
  },
  test: {
    environment: 'node'
  }
});
