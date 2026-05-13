// ============================================================
// My Finance Pro — Main Entry Point
// ============================================================

import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './index.css';

// ============================================================
// Service Worker Registration
// ============================================================
async function registerServiceWorker() {
  // Only register in production & if browser supports it
  if (!('serviceWorker' in navigator)) {
    console.log('[SW] Service Workers not supported');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      // Update SW when user navigates (good for PWA updates)
      updateViaCache: 'none',
    });

    console.log('[SW] Registered successfully:', registration.scope);

    // Check for SW updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (
          newWorker.state === 'installed' &&
          navigator.serviceWorker.controller
        ) {
          // New version available — show update notification
          console.log('[SW] New version available!');
          
          // You can dispatch a custom event here to show update banner
          window.dispatchEvent(new CustomEvent('sw-update-available'));
        }
      });
    });

    // Handle SW controller change (after update)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.log('[SW] Controller changed — new version active');
      // Optional: window.location.reload();
    });

    // Immediate update check
    registration.update().catch(() => {
      // Silent fail if offline
    });

  } catch (error) {
    console.error('[SW] Registration failed:', error);
  }
}

// ============================================================
// Remove Initial Loader
// ============================================================
function removeInitialLoader() {
  const loader = document.getElementById('initial-loader');
  if (loader) {
    loader.style.transition = 'opacity 0.3s ease';
    loader.style.opacity = '0';
    setTimeout(() => {
      loader.remove();
    }, 300);
  }
}

// ============================================================
// App Initialization
// ============================================================
async function initApp() {
  // Register SW first (non-blocking)
  registerServiceWorker();

  // Mount React App
  const rootElement = document.getElementById('root');
  if (!rootElement) throw new Error('Root element not found');

  const root = ReactDOM.createRoot(rootElement);
  
  root.render(
    <React.StrictMode>
      <App onReady={removeInitialLoader} />
      <Toaster
        position="top-center"
        gutter={8}
        containerStyle={{
          top: 'calc(env(safe-area-inset-top, 0px) + 16px)',
        }}
        toastOptions={{
          duration: 3000,
          style: {
            background: '#1e2538',
            color: '#f1f5f9',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: '500',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            padding: '12px 16px',
            maxWidth: '90vw',
          },
          success: {
            iconTheme: {
              primary: '#10b981',
              secondary: '#1e2538',
            },
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: '#1e2538',
            },
          },
        }}
      />
    </React.StrictMode>
  );
}

initApp().catch(console.error);