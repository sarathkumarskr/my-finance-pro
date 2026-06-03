// src/components/PWAUpdatePrompt.tsx
import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X } from 'lucide-react';

export default function PWAUpdatePrompt() {
  const [showPrompt, setShowPrompt] = useState(false);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('[PWA] Service Worker registered');
      // Check for updates every 60 minutes
      r && setInterval(() => {
        r.update();
      }, 60 * 60 * 1000);
    },
    onRegisterError(error) {
      console.error('[PWA] SW registration error:', error);
    },
    onNeedRefresh() {
      console.log('[PWA] New version available!');
      setShowPrompt(true);
    },
  });

  useEffect(() => {
    if (needRefresh) setShowPrompt(true);
  }, [needRefresh]);

  const handleUpdate = () => {
    updateServiceWorker(true);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setNeedRefresh(false);
  };

  if (!showPrompt) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 80,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
        color: '#fff',
        padding: '14px 20px',
        borderRadius: 16,
        boxShadow: '0 8px 24px rgba(99,102,241,0.4)',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        maxWidth: '90vw',
        animation: 'slideUp 0.3s ease-out',
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: 'rgba(255,255,255,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <RefreshCw size={18} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 2 }}>
          New version available! 🎉
        </div>
        <div style={{ fontSize: 12, opacity: 0.9 }}>
          Update now to get the latest features
        </div>
      </div>

      <button
        onClick={handleUpdate}
        style={{
          padding: '8px 14px',
          borderRadius: 10,
          border: 'none',
          background: '#fff',
          color: '#6366f1',
          fontWeight: 800,
          fontSize: 13,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        Update
      </button>

      <button
        onClick={handleDismiss}
        style={{
          background: 'rgba(255,255,255,0.15)',
          border: 'none',
          borderRadius: 8,
          padding: 6,
          cursor: 'pointer',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <X size={14} />
      </button>

      <style>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
      `}</style>
    </div>
  );
}