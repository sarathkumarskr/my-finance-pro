import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
} from 'firebase/auth';
import { LogIn, ShieldCheck, Wallet, Globe2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { auth, googleProvider } from '../firebaseConfig';

export default function Login() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          toast.success('Welcome ' + result.user.displayName);
          navigate('/');
        }
      })
      .catch((err) => console.error(err));
  }, [navigate]);

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      toast.success('Login successful!');
      navigate('/');
    } catch (popupError: any) {
      if (
        popupError.code === 'auth/popup-blocked' ||
        popupError.code === 'auth/cancelled-popup-request'
      ) {
        try {
          await signInWithRedirect(auth, googleProvider);
        } catch (redirectError) {
          toast.error('Login failed. Please try again.');
          setLoading(false);
        }
      } else if (popupError.code === 'auth/unauthorized-domain') {
        toast.error(
          'Domain not authorized. Add this domain in Firebase Console → Authentication → Settings → Authorized domains'
        );
        setLoading(false);
      } else {
        toast.error('Login failed: ' + popupError.message);
        setLoading(false);
      }
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="logo-circle">M</div>
        <h1 className="login-title">My Finance Pro</h1>
        <p className="login-subtitle">
          Track income, expenses, debts, savings, UAE/India finances, remittance
          and payment modes in one secure PWA.
        </p>
        <button
          className="google-btn"
          onClick={handleGoogleLogin}
          disabled={loading}
        >
          <LogIn size={19} />
          {loading ? 'Signing in...' : 'Continue with Google'}
        </button>
        <div className="login-features">
          <div className="login-feature">
            <ShieldCheck size={18} />
            Secure Google login
          </div>
          <div className="login-feature">
            <Wallet size={18} />
            AED + INR multi-currency tracking
          </div>
          <div className="login-feature">
            <Globe2 size={18} />
            Multi-country support
          </div>
        </div>
      </div>
    </div>
  );
}
