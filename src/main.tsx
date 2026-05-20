// ============================================================
// My Finance Pro — Main Entry Point
// ============================================================

import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
import App from './App';
import './index.css';

// ============================================================
// Service Worker Registration
// ============================================================
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.log('[SW] Not supported');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });

    console.log('[SW] Registered:', registration.scope);

    // Handle updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (
          newWorker.state === 'installed' &&
          navigator.serviceWorker.controller
        ) {
          console.log('[SW] Update available');
          
          // Show update toast
          toast(
            (t) => {
              const div = document.createElement('div');
              return React.createElement(
                'div',
                {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                  }
                },
                React.createElement('span', null, '🔄 App updated!'),
                React.createElement(
                  'button',
                  {
                    onClick: () => {
                      newWorker.postMessage('SKIP_WAITING');
                      window.location.reload();
                    },
                    style: {
                      background: '#6366f1',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '4px 12px',
                      fontSize: '13px',
                      cursor: 'pointer',
                      fontWeight: '600',
                    }
                  },
                  'Refresh'
                )
              );
            },
            { duration: 8000 }
          );
        }
      });
    });

    // Controller change = new SW active
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.log('[SW] New version active');
    });

    // Check for updates
    registration.update().catch(() => {});

  } catch (error) {
    console.error('[SW] Registration failed:', error);
  }
}

// ============================================================
// Remove Initial Loader
// ============================================================
function removeInitialLoader() {
  const loader = document.getElementById('initial-loader');
  if (!loader) return;
  
  loader.style.transition = 'opacity 0.4s ease';
  loader.style.opacity = '0';
  
  setTimeout(() => {
    loader.remove();
  }, 400);
}

// ============================================================
// App Initialization
// ============================================================
async function initApp() {
  // Register SW (non-blocking)
  registerServiceWorker();

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