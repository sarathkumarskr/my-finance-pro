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
        // ── App Identity ──
        name: 'My Finance Pro',
        short_name: 'Finance Pro',
        description: 'UAE-India Personal ERP & Finance Tracker',
        
        // ── KEY: These remove URL bar ──
        display: 'standalone',           // ← No browser UI
        display_override: ['standalone', 'fullscreen'],  // ← Fallback options
        
        // ── Visual ──
        theme_color: '#6366f1',          // Top bar color (Android)
        background_color: '#0f1219',     // Splash screen bg
        
        // ── Orientation ──
        orientation: 'portrait-primary',  // Or 'any' if you want rotation
        
        // ── Scope (important for routing) ──
        scope: '/',
        start_url: '/?source=pwa',       // Track PWA opens
        
        // ── Categories ──
        categories: ['finance', 'productivity', 'business'],
        
        // ── Language ──
        lang: 'en',
        dir: 'ltr',
        
        // ── Icons ──
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        
        // ── Shortcuts (long-press app icon) ──
        shortcuts: [
          {
            name: 'Add Expense',
            short_name: 'Expense',
            description: 'Quickly add an expense',
            url: '/expenses?action=add',
            icons: [{ src: '/icon-192.png', sizes: '192x192' }],
          },
          {
            name: 'Add Income',
            short_name: 'Income',
            description: 'Record income',
            url: '/income?action=add',
            icons: [{ src: '/icon-192.png', sizes: '192x192' }],
          },
          {
            name: 'View Reports',
            short_name: 'Reports',
            description: 'See financial reports',
            url: '/reports',
            icons: [{ src: '/icon-192.png', sizes: '192x192' }],
          },
        ],
        
        // ── Screenshots (Android install dialog) ──
        screenshots: [
          {
            src: '/screenshot-mobile.png',
            sizes: '720x1280',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Dashboard view',
          },
        ],
        
        // ── Prevent browser fallback ──
        prefer_related_applications: false,
      },
      
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        
        // Network-first for live data
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/firestore\.googleapis\.com/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'firestore-cache',
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 5,
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
                maxAgeSeconds: 60 * 60 * 24 * 7,
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
      
      devOptions: {
        enabled: false,
      },
    }),
  ],
});