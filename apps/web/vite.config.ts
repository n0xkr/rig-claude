import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico'],
      manifest: {
        name: 'Rigabras - Gestão Logística',
        short_name: 'Rigabras TMS',
        description: 'Ecossistema Integrado de Gestão Logística (TMS + WMS) - Rigabras Transportes',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/v1'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'rigabras-api-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          r3f: ['@react-three/fiber', '@react-three/drei'],
          motion: ['framer-motion'],
        },
      },
    },
  },
  // `host: '127.0.0.1'` (em vez do padrão do Vite, que só faz bind em `::1`
  // nesta máquina Windows): sem isso, qualquer cliente que resolva
  // `localhost`/`127.0.0.1` para IPv4 primeiro (curl neste sandbox,
  // Playwright/Chromium) recebia "connection refused" mesmo com o dev
  // server rodando — encontrado ao tentar acessar a app pela primeira vez
  // nesta sessão de testes.
  server: { port: 5173, host: '127.0.0.1' },
  preview: { port: 5173, host: '127.0.0.1' },
});
