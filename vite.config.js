import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // Avoid scanning static demo HTML/assets under public/talkinghead.
    entries: ['index.html', 'src/**/*.{js,jsx,ts,tsx}'],
  },
  server: {
    port: 5174,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
  },
  base: './',
});
