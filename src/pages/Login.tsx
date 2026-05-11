import { useState, useEffect } from 'react';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult
} from 'firebase/auth';
import { auth } from '../firebaseConfig';
import toast from 'react-hot-toast';

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent.toLowerCase());
const isInStandaloneMode = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (window.navigator as any).standalone === true;

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    setLoading(true);
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          toast.success(`Welcome ${result.user.displayName}!`);
        }
      })
      .catch((error) => {
        console.error('❌ Redirect error code:', error.code);
        console.error('❌ Redirect error msg:', error.message);
        setErrorMsg(error.code + ': ' + error.message);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setErrorMsg('');
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    try {
      const ios = isIOS();
      const standalone = isInStandaloneMode();
      console.log('📱 isIOS:', ios);
      console.log('📱 isStandalone:', standalone);

      if (ios) {
        // iOS — always use redirect
        console.log('🔄 Using signInWithRedirect...');
        await signInWithRedirect(auth, provider);
      } else {
        // Desktop/Android — popup
        console.log('🔄 Using signInWithPopup...');
        const result = await signInWithPopup(auth, provider);
        console.log('✅ Login success:', result.user.email);
        toast.success(`Welcome ${result.user.displayName}!`);
      }
    } catch (error: any) {
      console.error('❌ Login error code:', error.code);
      console.error('❌ Login error message:', error.message);
      setErrorMsg(error.code + ': ' + error.message);
      toast.error('Login failed: ' + error.code);
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{
        background: 'var(--card)',
        borderRadius: '24px',
        padding: '48px 32px',
        width: '100%',
        maxWidth: '400px',
        textAlign: 'center',
        border: '1px solid var(--border)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <div style={{
          width: '80px',
          height: '80px',
          background: 'linear-gradient(135deg, var(--primary), #8b5cf6)',
          borderRadius: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 24px',
          fontSize: '36px',
        }}>
          💰
        </div>

        <h1 style={{
          color: 'var(--text)',
          fontSize: '28px',
          fontWeight: '700',
          marginBottom: '8px',
        }}>
          My Finance Pro
        </h1>

        <p style={{
          color: 'var(--muted)',
          fontSize: '14px',
          marginBottom: '40px',
          lineHeight: '1.6',
        }}>
          Track income, expenses, debts, savings,
          UAE/India finances & remittance.
        </p>

        {/* Error Display — Debug */}
        {errorMsg && (
          <div style={{
            background: 'rgba(255,0,0,0.1)',
            border: '1px solid red',
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '16px',
            fontSize: '12px',
            color: 'red',
            textAlign: 'left',
            wordBreak: 'break-all',
          }}>
            ❌ {errorMsg}
          </div>
        )}

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          style={{
            width: '100%',
            padding: '16px',
            background: loading ? 'var(--muted)' : 'var(--primary)',
            color: 'white',
            border: 'none',
            borderRadius: '12px',
            fontSize: '16px',
            fontWeight: '600',
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
          }}
        >
          {loading ? (
            <>
              <div style={{
                width: '20px',
                height: '20px',
                border: '2px solid white',
                borderTop: '2px solid transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }} />
              Signing in...
            </>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="white" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="white" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="white" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="white" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </>
          )}
        </button>

        <div style={{ marginTop: '32px', textAlign: 'left' }}>
          {[
            '🔒 Secure Google login',
            '💱 AED + INR multi-currency',
            '🌍 UAE & India support',
          ].map((feature, i) => (
            <div key={i} style={{
              color: 'var(--muted)',
              fontSize: '13px',
              padding: '6px 0',
            }}>
              {feature}
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}