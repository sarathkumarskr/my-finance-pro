import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'inline', // ✅ Force script injection to index.html structure for perfect Android PWA pickup
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'My Finance Pro',
        short_name: 'FinancePro',
        description: 'UAE-India Personal Finance Tracker',
        theme_color: '#0f1219', // ✅ Changed from violet to pitch-dark matching application background index
        background_color: '#0f1219', // ✅ Pure dark baseline layout match
        display: 'standalone', // ✅ System standalone mobile lock frame mapping
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable', // ✅ Android homescreen fix preserved
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
        cleanupOutdatedCaches: true, // ✅ Clear legacy cache files automatically upon client updates
      },
    }),
  ],
});