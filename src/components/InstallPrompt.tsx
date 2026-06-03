// src/components/InstallPrompt.tsx
import { useState, useEffect } from 'react';
import { Download, X, Smartphone, Share2, Plus } from 'lucide-react';

// BeforeInstallPrompt event type (Chrome/Edge/Android)
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export default function InstallPrompt() {
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    // Detect iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(iOS);

    // Detect if already installed (standalone mode)
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://');
    setIsStandalone(standalone);

    // Don't show prompt if already installed
    if (standalone) return;

    // Check if user previously dismissed
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (dismissed) {
      const dismissedTime = parseInt(dismissed);
      const daysSince = (Date.now() - dismissedTime) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) return; // Don't show again for 7 days
    }

    // Listen for install prompt (Android/Desktop)
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPromptEvent(e as BeforeInstallPromptEvent);
      
      // Wait 30 seconds before showing (let user explore first)
      setTimeout(() => setShowPrompt(true), 30000);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // For iOS, show after 30 seconds since no event
    if (iOS && !standalone) {
      setTimeout(() => setShowPrompt(true), 30000);
    }

    // Listen for successful install
    window.addEventListener('appinstalled', () => {
      console.log('[PWA] App installed successfully!');
      setShowPrompt(false);
      setInstallPromptEvent(null);
      localStorage.setItem('pwa-installed', 'true');
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!installPromptEvent) {
      // iOS — show guide
      if (isIOS) {
        setShowIOSGuide(true);
      }
      return;
    }

    try {
      await installPromptEvent.prompt();
      const choice = await installPromptEvent.userChoice;
      
      if (choice.outcome === 'accepted') {
        console.log('[PWA] User accepted install');
      } else {
        console.log('[PWA] User dismissed install');
      }
      
      setInstallPromptEvent(null);
      setShowPrompt(false);
    } catch (err) {
      console.error('[PWA] Install error:', err);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  };

  // Don't show if already installed
  if (isStandalone) return null;

  // iOS Install Guide Modal
  if (showIOSGuide) {
    return (
      <div
        onClick={(e) => {
          if (e.target === e.currentTarget) setShowIOSGuide(false);
        }}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: 16,
        }}
      >
        <div
          style={{
            background: 'var(--card)',
            borderRadius: 20,
            padding: 24,
            maxWidth: 360,
            width: '100%',
            border: '1px solid var(--border)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 16,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontWeight: 800,
                fontSize: 17,
              }}
            >
              <Smartphone size={22} color="var(--primary)" />
              Install on iPhone
            </div>
            <button
              onClick={() => setShowIOSGuide(false)}
              style={{
                background: 'var(--hover)',
                border: 'none',
                borderRadius: 8,
                padding: 6,
                cursor: 'pointer',
                color: 'var(--text)',
              }}
            >
              <X size={18} />
            </button>
          </div>

          <p
            style={{
              fontSize: 14,
              color: 'var(--muted)',
              marginBottom: 20,
              lineHeight: 1.5,
            }}
          >
            Follow these steps to install My Finance Pro as an app on your
            iPhone:
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              {
                num: '1',
                text: (
                  <>
                    Tap the <strong>Share</strong> button{' '}
                    <Share2
                      size={14}
                      style={{
                        display: 'inline',
                        verticalAlign: 'middle',
                        color: 'var(--primary)',
                      }}
                    />{' '}
                    at the bottom of Safari
                  </>
                ),
              },
              {
                num: '2',
                text: (
                  <>
                    Scroll down and tap <strong>"Add to Home Screen"</strong>{' '}
                    <Plus
                      size={14}
                      style={{
                        display: 'inline',
                        verticalAlign: 'middle',
                        color: 'var(--primary)',
                      }}
                    />
                  </>
                ),
              },
              {
                num: '3',
                text: (
                  <>
                    Tap <strong>"Add"</strong> in the top right corner
                  </>
                ),
              },
              {
                num: '4',
                text: (
                  <>
                    Open <strong>My Finance Pro</strong> from your home screen
                    — no URL bar! 🎉
                  </>
                ),
              },
            ].map((step) => (
              <div
                key={step.num}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: 12,
                  borderRadius: 12,
                  background: 'var(--hover)',
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: 'var(--primary)',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: 13,
                    flexShrink: 0,
                  }}
                >
                  {step.num}
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.5, flex: 1 }}>
                  {step.text}
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: 20,
              padding: 12,
              borderRadius: 10,
              background: 'rgba(99,102,241,0.08)',
              border: '1px solid rgba(99,102,241,0.2)',
              fontSize: 12,
              color: 'var(--muted)',
              textAlign: 'center',
            }}
          >
            💡 <strong>Tip:</strong> Make sure you're using Safari (not Chrome)
            on iPhone for installation to work.
          </div>
        </div>
      </div>
    );
  }

  // Bottom install prompt
  if (!showPrompt) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 80,
        left: 16,
        right: 16,
        zIndex: 9998,
        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
        color: '#fff',
        padding: '14px 16px',
        borderRadius: 16,
        boxShadow: '0 8px 32px rgba(99,102,241,0.4)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        maxWidth: 400,
        margin: '0 auto',
        animation: 'slideUp 0.4s ease-out',
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          background: 'rgba(255,255,255,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Download size={20} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 800,
            fontSize: 14,
            marginBottom: 2,
          }}
        >
          Install My Finance Pro
        </div>
        <div style={{ fontSize: 11, opacity: 0.9 }}>
          {isIOS
            ? 'Add to home screen for app-like experience'
            : 'Get the full app experience without URL bar'}
        </div>
      </div>

      <button
        onClick={handleInstall}
        style={{
          padding: '8px 14px',
          borderRadius: 10,
          border: 'none',
          background: '#fff',
          color: '#6366f1',
          fontWeight: 800,
          fontSize: 12,
          cursor: 'pointer',
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}
      >
        Install
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
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}