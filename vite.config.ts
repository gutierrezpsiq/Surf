import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}', 'basemap/*.json', 'data/spots.json'], maximumFileSizeToCacheInBytes: 4_000_000 },
      manifest: {
        name: 'Swell Sul — previsão de surf PR · SC · RS',
        short_name: 'Swell Sul',
        description: 'Onde e quando surfar no litoral sul do Brasil, com consenso de vários modelos.',
        lang: 'pt-BR',
        theme_color: '#0d366b',
        background_color: '#0d0d0d',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 1500 },
});
