// ============================================================
// My Finance Pro — Login Page
// iOS PWA compatible Google Sign-In
// ============================================================

import React, { useState, useEffect } from 'react';
import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
} from 'firebase/auth';
import { auth, googleProvider } from '../firebaseConfig';
import toast from 'react-hot-toast';
import { TrendingUp, Shield, Zap, Globe } from 'lucide-react';

// User type (null for Login page since user is not logged in)
type LoginProps = {
  user: null;
};

// ============================================================
// Detect if running as installed PWA
// ============================================================
function isPWA(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true ||
    document.referrer.includes('android-app://')
  );
}

// ============================================================
// Detect iOS
// ============================================================
function isIOS(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

// ============================================================
// Login Component
// ============================================================
export default function Login({ user }: LoginProps) {
  const [loading, setLoading] = useState(false);
  const [checkingRedirect, setCheckingRedirect] = useState(true);

  // ============================================================
  // Handle redirect result on page load
  // This is called when returning from Google OAuth redirect
  // CRITICAL for iOS PWA where popup doesn't work well
  // ============================================================
  useEffect(() => {
    async function handleRedirectResult() {
      try {
        const result = await getRedirectResult(auth);
        if (result?.user) {
          toast.success(`Welcome back, ${result.user.displayName?.split(' ')[0]}! 👋`);
          // Auth state change will handle navigation via App.tsx
        }
      } catch (error: any) {
        console.error('[Login] Redirect result error:', error);
        
        if (error.code === 'auth/popup-blocked') {
          toast.error('Popup blocked. Please allow popups or try again.');
        } else if (error.code !== 'auth/no-auth-event') {
          // auth/no-auth-event is normal (no redirect happened)
          toast.error('Sign-in failed. Please try again.');
        }
      } finally {
        setCheckingRedirect(false);
      }
    }

    handleRedirectResult();
  }, []);

  // ============================================================
  // Google Sign In — Smart strategy based on platform
  // ============================================================
  async function handleGoogleSignIn() {
    if (loading) return;
    setLoading(true);

    try {
      const useRedirect = isIOS() || isPWA();
      // iOS PWA: use redirect (popup blocked by Safari in standalone mode)
      // Android PWA + Desktop: popup works fine
      
      if (useRedirect) {
        console.log('[Login] Using redirect sign-in (iOS/PWA)');
        await signInWithRedirect(auth, googleProvider);
        // Page will redirect to Google, then return
        // getRedirectResult() handles the response
      } else {
        console.log('[Login] Using popup sign-in');
        const result = await signInWithPopup(auth, googleProvider);
        if (result.user) {
          toast.success(`Welcome, ${result.user.displayName?.split(' ')[0]}! 👋`);
        }
      }
    } catch (error: any) {
      console.error('[Login] Sign-in error:', error);
      setLoading(false);

      switch (error.code) {
        case 'auth/popup-closed-by-user':
          // User closed popup — not an error
          break;
        case 'auth/popup-blocked':
          // Popup blocked — retry with redirect
          toast.loading('Retrying with redirect...', { duration: 2000 });
          setTimeout(async () => {
            try {
              await signInWithRedirect(auth, googleProvider);
            } catch (e) {
              toast.error('Sign-in failed. Please try again.');
            }
          }, 2000);
          break;
        case 'auth/network-request-failed':
          toast.error('No internet connection. Please check your network.');
          break;
        case 'auth/too-many-requests':
          toast.error('Too many attempts. Please wait a moment.');
          break;
        case 'auth/cancelled-popup-request':
          // Multiple popups — ignore
          break;
        default:
          toast.error(`Sign-in failed: ${error.message || 'Unknown error'}`);
      }
    } finally {
      // Only reset if not redirecting
      if (!isIOS() && !isPWA()) {
        setLoading(false);
      }
    }
  }

  // ============================================================
  // Feature list
  // ============================================================
  const features = [
    {
      icon: <TrendingUp size={20} color="#6366f1" />,
      title: 'Track Expenses',
      desc: 'AED & INR support',
    },
    {
      icon: <Globe size={20} color="#10b981" />,
      title: 'Multi-Currency',
      desc: 'UAE & India ready',
    },
    {
      icon: <Zap size={20} color="#f59e0b" />,
      title: 'Smart Reports',
      desc: 'Visual insights',
    },
    {
      icon: <Shield size={20} color="#8b5cf6" />,
      title: 'Secure & Private',
      desc: 'Your data only',
    },
  ];

  // ============================================================
  // Show loading while checking redirect result
  // ============================================================
  if (checkingRedirect) {
    return (
      <div
        style={{
          minHeight: '100dvh',
          background: '#1a1f2e',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            border: '3px solid rgba(99,102,241,0.2)',
            borderTopColor: '#6366f1',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <p style={{ color: '#6366f1', fontSize: '14px', margin: 0 }}>
          Signing you in...
        </p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ============================================================
  // Render Login UI
  // ============================================================
  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'linear-gradient(135deg, #0f1219 0%, #1a1f2e 50%, #0f1630 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 24px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Background decorations */}
      <div
        style={{
          position: 'absolute',
          top: '-100px',
          right: '-100px',
          width: '300px',
          height: '300px',
          background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '-100px',
          left: '-100px',
          width: '300px',
          height: '300px',
          background: 'radial-gradient(circle, rgba(139,92,246,0.1) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* Content Card */}
      <div
        style={{
          width: '100%',
          maxWidth: '400px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '32px',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Logo + Title */}
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: '88px',
              height: '88px',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              borderRadius: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '44px',
              margin: '0 auto 20px',
              boxShadow: '0 20px 60px rgba(99,102,241,0.4)',
            }}
          >
            💰
          </div>
          <h1
            style={{
              fontSize: '28px',
              fontWeight: '800',
              color: '#f1f5f9',
              margin: '0 0 8px',
              letterSpacing: '-0.5px',
            }}
          >
            My Finance Pro
          </h1>
          <p
            style={{
              fontSize: '15px',
              color: '#64748b',
              margin: 0,
              lineHeight: '1.5',
            }}
          >
            Personal finance tracker for{' '}
            <span style={{ color: '#6366f1', fontWeight: '600' }}>UAE</span> &{' '}
            <span style={{ color: '#10b981', fontWeight: '600' }}>India</span> expats
          </p>
        </div>

        {/* Feature Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
            width: '100%',
          }}
        >
          {features.map((feature, index) => (
            <div
              key={index}
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '16px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div>{feature.icon}</div>
              <div>
                <p
                  style={{
                    fontSize: '13px',
                    fontWeight: '700',
                    color: '#f1f5f9',
                    margin: '0 0 2px',
                  }}
                >
                  {feature.title}
                </p>
                <p
                  style={{
                    fontSize: '11px',
                    color: '#64748b',
                    margin: 0,
                  }}
                >
                  {feature.desc}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Sign In Section */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Google Sign In Button */}
          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            style={{
              width: '100%',
              padding: '16px 24px',
              background: loading
                ? 'rgba(99,102,241,0.5)'
                : 'linear-gradient(135deg, #6366f1, #7c3aed)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '16px',
              fontSize: '16px',
              fontWeight: '700',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              transition: 'all 0.2s ease',
              boxShadow: loading ? 'none' : '0 8px 32px rgba(99,102,241,0.4)',
              letterSpacing: '0.3px',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {loading ? (
              <>
                <div
                  style={{
                    width: '20px',
                    height: '20px',
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: '#ffffff',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }}
                />
                {isIOS() || isPWA() ? 'Redirecting...' : 'Signing in...'}
              </>
            ) : (
              <>
                {/* Google Logo SVG */}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                Continue with Google
              </>
            )}
          </button>

          {/* iOS/PWA Notice */}
          {(isIOS() || isPWA()) && (
            <p
              style={{
                textAlign: 'center',
                fontSize: '12px',
                color: '#475569',
                margin: 0,
                lineHeight: '1.5',
              }}
            >
              🔒 You'll be redirected to Google to sign in securely
            </p>
          )}

          {/* Terms */}
          <p
            style={{
              textAlign: 'center',
              fontSize: '12px',
              color: '#475569',
              margin: 0,
              lineHeight: '1.6',
            }}
          >
            By continuing, you agree to our Terms of Service and Privacy Policy.
            Your financial data is encrypted and private.
          </p>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}