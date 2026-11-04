import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: { manualChunks: { recharts: ['recharts'], vendor: ['react', 'react-dom', 'react-router-dom', 'axios', 'date-fns'] } },
    },
  },
  server: {
    port: 5173,
    // Only used if VITE_API_URL is set to a relative "/api".
    proxy: { '/api': 'http://localhost:3000' },
  },
});
