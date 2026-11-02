import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the build also works when served from a sub-path or as static files.
export default defineConfig({
  base: './',
  plugins: [react()],
  // 5173 is Kokoon's storefront (prekokoon); IoT Studio runs beside it on 5180
  server: { port: 5180, strictPort: true },
  preview: { port: 5180, strictPort: true },
});
