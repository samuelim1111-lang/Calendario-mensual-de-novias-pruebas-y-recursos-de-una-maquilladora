// Vite + React + Tailwind CSS 4: la misma base que usa Lovable.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { host: '::', port: 8080 },
});
