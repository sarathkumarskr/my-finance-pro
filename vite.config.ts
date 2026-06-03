import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'inline',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      
      manifest: {
        name: 'My Finance Pro',
        short_name: 'FinancePro',
        description: 'UAE-India Personal Finance Tracker',
        theme_color: '#0f1219',
        background_color: '#0f1219',
        display: 'standalone',
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
            purpose: 'any maskable',
          },
        ],
      },
      
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
        cleanupOutdatedCaches: true,
        
        // 🔥 KEY ADDITIONS — force instant updates
        clientsClaim: true,           // ← Take control of all tabs immediately
        skipWaiting: true,            // ← Don't wait for old SW to finish
        
        // Network-first for API calls (always fresh data)
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/firestore\.googleapis\.com/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'firestore-cache',
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 5, // 5 minutes
              },
            },
          },
          {
            urlPattern: /^https:\/\/firebasestorage\.googleapis\.com/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'firebase-storage',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts',
            },
          },
        ],
      },
      
      // 🆕 Show update notification to users
      devOptions: {
        enabled: false, // PWA in dev mode (set true only for testing)
      },
    }),
  ],
});