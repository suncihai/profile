import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub project page: https://suncihai.github.io/profile/
// Every local asset therefore has to be requested under `/profile/`, which is why
// application code resolves local frames through `import.meta.env.BASE_URL`.
// Remote R2 frames are absolute URLs and are unaffected by this base.
export default defineConfig({
  base: '/',
  plugins: [react()],
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
  },
});
