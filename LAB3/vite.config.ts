import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: 'frontend',
  build: {
    outDir: '../public',
    emptyOutDir: true, // Clear public folder before build
  },
  server: {
    port: 3000,
    proxy: {
      '/look': 'http://localhost:8080',
      '/flip': 'http://localhost:8080',
      '/replace': 'http://localhost:8080',
      '/watch': 'http://localhost:8080',
    },
  },
});