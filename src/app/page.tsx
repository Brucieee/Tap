import React from 'react';
import Link from 'next/link';
import Logo from '@/components/Logo';
import { createClient } from '@/utils/supabase/server';
import { ArrowRight } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  return (
    <div style={{
      minHeight: '100vh',
      width: '100%',
      backgroundColor: '#f5f6fa', // Exact same light canvas background as the login page
      backgroundImage: `
        linear-gradient(rgba(17, 51, 85, 0.02) 1px, transparent 1px),
        linear-gradient(90deg, rgba(17, 51, 85, 0.02) 1px, transparent 1px)
      `,
      backgroundSize: '24px 24px',
      color: 'var(--text-primary)',
      fontFamily: 'var(--font-body)',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Dynamic drifting background ambient disks */}
      <div 
        className="floating-disk-1"
        style={{
          position: 'absolute',
          top: '-15%',
          left: '-15%',
          width: '600px',
          height: '600px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(17, 51, 85, 0.05) 0%, rgba(245, 246, 250, 0) 70%)',
          pointerEvents: 'none',
          zIndex: 0
        }} 
      />
      <div 
        className="floating-disk-2"
        style={{
          position: 'absolute',
          bottom: '-15%',
          right: '-15%',
          width: '600px',
          height: '600px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(17, 51, 85, 0.03) 0%, rgba(245, 246, 250, 0) 70%)',
          pointerEvents: 'none',
          zIndex: 0
        }} 
      />

      {/* Header Navigation */}
      <header className="hero-header">
        {/* Render text-only Logo on navbar by disabling showClock */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Logo showClock={false} showText={true} textColor="var(--brand-navy)" />
        </div>
      </header>

      {/* Hero Section */}
      <main className="hero-main">
        {/* Hero content */}
        <div className="hero-content">
          <h1 className="hero-title">
            Automated Attendance. <br />
            <span style={{
              background: 'linear-gradient(135deg, var(--brand-navy) 0%, #2974a6 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              Be on time.
            </span>
          </h1>
 
          <div className="hero-cta-container">
            <Link 
              href={session ? "/dashboard" : "/login"} 
              className="hero-cta-btn"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.65rem',
                backgroundColor: 'var(--brand-navy)',
                color: '#ffffff',
                padding: '0.95rem 2.25rem',
                borderRadius: '30px',
                fontWeight: 700,
                fontSize: '1.05rem',
                textDecoration: 'none',
                boxShadow: '0 10px 20px rgba(17, 51, 85, 0.2)'
              }}
            >
              {session ? 'Go to Dashboard' : 'Get Started Now'} 
              <span className="cta-arrow" style={{ display: 'inline-flex', alignItems: 'center' }}>
                <ArrowRight style={{ width: '18px', height: '18px', strokeWidth: 2.5 }} />
              </span>
            </Link>
          </div>
        </div>

        {/* Hero Clock (Increased size, styled in premium Brand Navy color scheme) */}
        <div className="hero-clock-wrapper">
          {/* Subtle clean shadows underneath */}
          <div className="hero-clock-shadow" style={{
            position: 'absolute',
            width: '240px',
            height: '240px',
            borderRadius: '50%',
            backgroundColor: 'rgba(17, 51, 85, 0.05)',
            filter: 'blur(40px)',
            zIndex: 0
          }} />

          {/* Large custom clock rendering wrapped in a Next.js Link */}
          <Link 
            href={session ? "/dashboard" : "/login"}
            className="hero-clock-container"
            style={{
              position: 'relative',
              zIndex: 1,
              cursor: 'pointer',
              display: 'block',
              textDecoration: 'none'
            }}
          >
            <Logo 
              showClock={true} 
              showText={false} 
              width={280} 
              height={280} 
              dialColor="var(--brand-navy)" 
              brandColor="#e0f8f5" // Soft contrast dial hands matching original layout
            />
          </Link>
        </div>
      </main>
    </div>
  );
}
