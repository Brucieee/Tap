'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { Mail, Lock, Check, Loader2, ArrowRight } from 'lucide-react';
import Logo from '@/components/Logo';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  
  const router = useRouter();
  const supabase = createClient();

  // Simple client-side regex check for the checkmark visual feedback (matching mockup)
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  // Check if user is already logged in, if so redirect to dashboard
  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.push('/dashboard');
      }
    };
    checkUser();
  }, [supabase, router]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    if (!email || !password) {
      setErrorMsg('Please enter both email and password.');
      setLoading(false);
      return;
    }

    try {
      if (isSignUp) {
        // Register Manual Email/Password
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });

        if (error) throw error;

        if (data.user && data.session) {
          setSuccessMsg('Account created successfully! Redirecting...');
          setTimeout(() => router.push('/dashboard'), 1500);
        } else {
          setSuccessMsg('Registration successful! Please check your email for confirmation link.');
        }
      } else {
        // Login Manual Email/Password
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        setSuccessMsg('Logged in successfully! Redirecting...');
        setTimeout(() => router.push('/dashboard'), 1000);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred during authentication.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{
      display: 'flex',
      minHeight: '100vh',
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem 1.25rem',
      position: 'relative'
    }}>
      <div className="ui-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
        
        {/* Segmented Clock Logo (Increased Size) */}
        <Logo showText={true} width={100} height={100} textColor="var(--brand-navy)" />

        {/* Softer, differentiated subtitle to establish clear brand identity */}
        <div style={{ textAlign: 'center', marginTop: '-0.5rem' }}>
          <h1 style={{ 
            fontSize: '1.1rem', 
            fontWeight: 500, 
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-body)',
            letterSpacing: '0.01em',
            lineHeight: 1.4
          }}>
            {isSignUp ? 'Register to Continue' : 'Log In to Continue'}
          </h1>
        </div>

        {/* Action Form */}
        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column' }}>
          
          {/* Email Rounded Input */}
          <div className="ui-input-wrapper">
            <Mail className="ui-input-icon" />
            <input
              id="email-input"
              type="email"
              placeholder="example@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="ui-input"
              required
              disabled={loading}
            />
            {/* Visual Checkmark indicator - matching the check circle from the screen */}
            {isEmailValid && (
              <span className="ui-input-check" title="Valid email format">
                <Check style={{ width: '10px', height: '10px', strokeWidth: 3 }} />
              </span>
            )}
          </div>

          {/* Password Rounded Input */}
          <div className="ui-input-wrapper" style={{ marginBottom: '1rem' }}>
            <Lock className="ui-input-icon" />
            <input
              id="password-input"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="ui-input"
              required
              disabled={loading}
            />
          </div>

          {/* Checkboxes: Remember me & Forgot Password */}
          <div className="ui-checkbox-container">
            <label className="ui-checkbox-label">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="ui-checkbox"
              />
              Remember me
            </label>
            <a 
              href="#forgot" 
              onClick={(e) => { e.preventDefault(); setErrorMsg('Password recovery is managed via Supabase Console.'); }}
              style={{ color: 'var(--text-muted)', textDecoration: 'none' }}
            >
              Forgot password
            </a>
          </div>

          {/* Alert Message Cards */}
          {errorMsg && (
            <div style={{
              background: '#fef2f2',
              border: '1px solid #fee2e2',
              color: '#991b1b',
              padding: '0.75rem 1rem',
              borderRadius: '16px',
              fontSize: '0.8rem',
              marginBottom: '1.25rem',
              lineHeight: '1.4'
            }}>
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div style={{
              background: '#f0fdf4',
              border: '1px solid #dcfce7',
              color: '#166534',
              padding: '0.75rem 1rem',
              borderRadius: '16px',
              fontSize: '0.8rem',
              marginBottom: '1.25rem',
              lineHeight: '1.4'
            }}>
              {successMsg}
            </div>
          )}

          {/* Action button */}
          {!isSignUp ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
              <button 
                id="auth-submit-btn" 
                type="submit" 
                className="btn-ui-primary" 
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="animate-spin" style={{ width: '18px', height: '18px', animation: 'spin 1.5s linear infinite' }} />
                ) : (
                  'Sign In'
                )}
              </button>
              
              <div style={{ display: 'flex', justifyContent: 'center', margin: '0.5rem 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                Don't have an account?
              </div>

              {/* Secondary Create Account outline button */}
              <button 
                type="button" 
                onClick={() => { setIsSignUp(true); setErrorMsg(''); setSuccessMsg(''); }}
                className="btn-ui-secondary"
                disabled={loading}
              >
                Create Account
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
              <button 
                id="auth-submit-btn" 
                type="submit" 
                className="btn-ui-primary" 
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="animate-spin" style={{ width: '18px', height: '18px', animation: 'spin 1.5s linear infinite' }} />
                ) : (
                  <>
                    Register Account <ArrowRight style={{ width: '18px', height: '18px' }} />
                  </>
                )}
              </button>

              <div style={{ display: 'flex', justifyContent: 'center', margin: '0.5rem 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                Already have an account?
              </div>

              <button 
                type="button" 
                onClick={() => { setIsSignUp(false); setErrorMsg(''); setSuccessMsg(''); }}
                className="btn-ui-secondary"
                disabled={loading}
              >
                Sign In Here
              </button>
            </div>
          )}
        </form>

        <style jsx global>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
          .animate-spin {
            animation: spin 1s linear infinite;
          }
        `}</style>
      </div>
    </main>
  );
}
