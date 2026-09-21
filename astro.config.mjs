import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://waspetinsuranceworthit.com',
  output: 'static',
  adapter: cloudflare(),
  build: {
    // Lighthouse flagged the single CSS file as render-blocking (343 ms).
    inlineStylesheets: 'always',
  },
  integrations: [
    react(),
    sitemap(),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
