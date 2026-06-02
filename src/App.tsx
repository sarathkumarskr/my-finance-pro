// src/App.tsx
import React, { useEffect, useState, useRef } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth } from './firebaseConfig';
import Login from './pages/Login';
import Layout from './components/Layout';

interface AppProps {
  onReady?: () => void;
}

// ─── Splash Spinner ───────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#1a1f2e',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '20px',
        zIndex: 9998,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div
        style={{
          width: '72px',
          height: '72px',
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          borderRadius: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '36px',
        }}
      >
        💰
      </div>
      <p
        style={{
          color: '#6366f1',
          fontSize: '16px',
          fontWeight: '600',
          margin: 0,
        }}
      >
        My Finance Pro
      </p>
      <div
        style={{
          width: '28px',
          height: '28px',
          border: '3px solid rgba(99,102,241,0.2)',
          borderTopColor: '#6366f1',
          borderRadius: '50%',
          animation: 'mfp-spin 0.8s linear infinite',
        }}
      />
      <style>{`
        @keyframes mfp-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ─── Protected Route Guard ────────────────────────────────────────────────────

function ProtectedRoute({
  user,
  children,
}: {
  user: User | null;
  children: React.ReactNode;
}) {
  const location = useLocation();
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App({ onReady }: AppProps) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const onReadyCalled = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function callOnReady() {
    if (!onReadyCalled.current) {
      onReadyCalled.current = true;
      setTimeout(() => onReady?.(), 100);
    }
  }

  // Online/offline detection
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Auth state listener
  useEffect(() => {
    timeoutRef.current = setTimeout(() => {
      console.warn('[Auth] Timeout! Showing login.');
      setUser(null);
      callOnReady();
    }, 4000);

    let unsubscribe: (() => void) | undefined;

    try {
      unsubscribe = onAuthStateChanged(
        auth,
        (firebaseUser) => {
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          console.log('[Auth] User:', firebaseUser?.email ?? 'none');
          setUser(firebaseUser);
          callOnReady();
        },
        (error) => {
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          console.error('[Auth] Error:', error);
          setUser(null);
          callOnReady();
        }
      );
    } catch (err) {
      console.error('[Auth] Crash:', err);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setUser(null);
      callOnReady();
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      unsubscribe?.();
    };
  }, []);

  // Re-check on tab focus
  useEffect(() => {
    const check = () => {
      if (document.visibilityState === 'visible') {
        setUser(auth.currentUser);
      }
    };
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, []);

  // Loading state
  if (user === undefined) {
    return <Spinner />;
  }

  return (
    <BrowserRouter>
      {!isOnline && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            background: '#f59e0b',
            color: '#1a1f2e',
            textAlign: 'center',
            padding: '8px',
            fontSize: '13px',
            fontWeight: '600',
            zIndex: 9999,
          }}
        >
          📡 Offline — Cached data shown
        </div>
      )}

      <Routes>
        {/* Login route */}
        <Route
          path="/login"
          element={
            user ? <Navigate to="/" replace /> : <Login user={null} />
          }
        />

        {/* All other routes go through Layout (which has its own routes inside) */}
        <Route
          path="/*"
          element={
            <ProtectedRoute user={user}>
              <Layout user={user as User} />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}