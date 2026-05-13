// ============================================================
// My Finance Pro — App.tsx
// Firebase Auth state management — NO AuthContext
// iOS PWA login persistence fix included
// ============================================================

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from 'react-router-dom';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './firebaseConfig';
import Layout from './components/Layout';
import Login from './pages/Login';

// ============================================================
// Page imports
// ============================================================
import Dashboard from './pages/Dashboard';
import Expenses from './pages/Expenses';
import Income from './pages/Income';
import Budget from './pages/Budget';
import Reports from './pages/Reports';
import Settings from './pages/Settings';

// ============================================================
// Types
// ============================================================
interface AppProps {
  onReady?: () => void;
}

// ============================================================
// Loading Screen Component
// ============================================================
function LoadingScreen() {
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
      }}
    >
      <div
        style={{
          width: '80px',
          height: '80px',
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          borderRadius: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '40px',
          boxShadow: '0 0 40px rgba(99,102,241,0.4)',
        }}
      >
        💰
      </div>
      <p
        style={{
          color: '#6366f1',
          fontSize: '18px',
          fontWeight: '600',
          letterSpacing: '0.5px',
          margin: 0,
        }}
      >
        My Finance Pro
      </p>
      <div
        style={{
          width: '32px',
          height: '32px',
          border: '3px solid rgba(99, 102, 241, 0.2)',
          borderTopColor: '#6366f1',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ============================================================
// Protected Route Wrapper
// ============================================================
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

// ============================================================
// Main App Component
// ============================================================
export default function App({ onReady }: AppProps) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const onReadyCalled = useRef(false);

  // ============================================================
  // Online/Offline detection
  // ============================================================
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // ============================================================
  // Firebase Auth State Observer
  // 
  // KEY: onAuthStateChanged works with IndexedDB persistence.
  // On iOS PWA restart, Firebase reads from IndexedDB and
  // restores the user session automatically.
  // ============================================================
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const unsubscribe = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        // Clear any timeout
        clearTimeout(timeoutId);
        
        setUser(firebaseUser);
        setAuthLoading(false);
        
        // Remove initial HTML loader (once)
        if (!onReadyCalled.current) {
          onReadyCalled.current = true;
          onReady?.();
        }
        
        if (firebaseUser) {
          console.log('[Auth] User signed in:', firebaseUser.email);
        } else {
          console.log('[Auth] No user signed in');
        }
      },
      (error) => {
        console.error('[Auth] Auth state error:', error);
        clearTimeout(timeoutId);
        setAuthLoading(false);
        setUser(null);
        
        if (!onReadyCalled.current) {
          onReadyCalled.current = true;
          onReady?.();
        }
      }
    );

    // Safety timeout — if auth takes too long (iOS cold start)
    timeoutId = setTimeout(() => {
      if (authLoading) {
        console.warn('[Auth] Auth timeout — showing login');
        setAuthLoading(false);
        if (!onReadyCalled.current) {
          onReadyCalled.current = true;
          onReady?.();
        }
      }
    }, 5000); // 5 second max wait

    return () => {
      unsubscribe();
      clearTimeout(timeoutId);
    };
  }, []);

  // ============================================================
  // iOS PWA Visibility Fix
  //
  // When iOS PWA comes back from background, Firebase Auth
  // sometimes needs a refresh. This handles that.
  // ============================================================
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && window.isIOSPWA) {
        // Re-check auth state when app comes to foreground on iOS
        const currentUser = auth.currentUser;
        if (currentUser !== user) {
          setUser(currentUser);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user]);

  // ============================================================
  // Show loading while auth initializes
  // ============================================================
  if (authLoading) {
    return <LoadingScreen />;
  }

  // ============================================================
  // Render
  // ============================================================
  return (
    <BrowserRouter>
      {/* Offline Banner */}
      {!isOnline && (
        <div
          style={{
            position: 'fixed',
            top: 'env(safe-area-inset-top, 0px)',
            left: 0,
            right: 0,
            background: '#f59e0b',
            color: '#1a1f2e',
            textAlign: 'center',
            padding: '8px 16px',
            fontSize: '13px',
            fontWeight: '600',
            zIndex: 9999,
          }}
        >
          📡 Offline — Showing cached data
        </div>
      )}

      <Routes>
        {/* Public Route */}
        <Route
          path="/login"
          element={
            user ? (
              <Navigate to="/" replace />
            ) : (
              <Login user={user as null} />
            )
          }
        />

        {/* Protected Routes */}
        <Route
          path="/*"
          element={
            <ProtectedRoute user={user}>
              <Layout user={user as User}>
                <Routes>
                  <Route path="/" element={<Dashboard user={user as User} />} />
                  <Route path="/expenses" element={<Expenses user={user as User} />} />
                  <Route path="/income" element={<Income user={user as User} />} />
                  <Route path="/budget" element={<Budget user={user as User} />} />
                  <Route path="/reports" element={<Reports user={user as User} />} />
                  <Route path="/settings" element={<Settings user={user as User} />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Layout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

// ============================================================
// Extend Window type for PWA detection flags
// ============================================================
declare global {
  interface Window {
    isIOSPWA: boolean;
    isAndroidPWA: boolean;
  }
}