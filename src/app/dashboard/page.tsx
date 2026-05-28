'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { 
  User, 
  Lock, 
  Clock, 
  Calendar, 
  Power, 
  Save, 
  LogOut, 
  Terminal, 
  Play, 
  ShieldCheck, 
  Settings, 
  Check, 
  Loader2, 
  AlertCircle,
  Eye,
  EyeOff
} from 'lucide-react';
import Logo from '@/components/Logo';
import BatEffect from '@/components/effects/BatEffect';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export default function DashboardPage() {
  const [profile, setProfile] = useState({
    employee_id: '',
    company_password: '',
    wfh_days: [] as string[],
    login_time: '08:00',
    logout_time: '17:00',
    is_automation_enabled: true,
    wfh_reason: 'Work from home'
  });
  
  const [userEmail, setUserEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' as 'success' | 'error' | '' });
  const [testLogs, setTestLogs] = useState<string[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [hasPasswordStored, setHasPasswordStored] = useState(false);
  const [isLocked, setIsLocked] = useState(true);
  const [triggerBatEffect, setTriggerBatEffect] = useState(false);

  // Standly Integration State
  const [leaves, setLeaves] = useState<any[]>([]);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [loadingStandly, setLoadingStandly] = useState(true);

  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const initDashboard = async () => {
      // Check user session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }
      
      setUserEmail(session.user.email || '');

      // Fetch profile settings
      try {
        const response = await fetch('/api/profile');
        if (response.ok) {
          const data = await response.json();
          
          const cleanLoginTime = data.login_time ? data.login_time.substring(0, 5) : '08:00';
          const cleanLogoutTime = data.logout_time ? data.logout_time.substring(0, 5) : '17:00';

          const passwordPresent = !!data.company_password;
          setHasPasswordStored(passwordPresent);
          setIsLocked(passwordPresent);

          setProfile({
            employee_id: data.employee_id || '',
            company_password: passwordPresent ? '__PRESERVED_PASSWORD__' : '',
            wfh_days: data.wfh_days || [],
            login_time: cleanLoginTime,
            logout_time: cleanLogoutTime,
            is_automation_enabled: data.is_automation_enabled !== undefined ? data.is_automation_enabled : true,
            wfh_reason: data.wfh_reason || 'Work from home'
          });
        }
      } catch (error) {
        console.error('Failed to load profile settings:', error);
        setMessage({ text: 'Failed to load configuration.', type: 'error' });
      } finally {
        setLoading(false);
      }

      // Fetch leaves and holidays from Standly
      try {
        const response = await fetch('/api/standly-info');
        if (response.ok) {
          const data = await response.json();
          setLeaves(data.leaves || []);
          setHolidays(data.holidays || []);
        }
      } catch (error) {
        console.error('Failed to load Standly data:', error);
      } finally {
        setLoadingStandly(false);
      }
    };

    initDashboard();
  }, [supabase, router]);

  const handleWfhDayToggle = (day: string) => {
    const currentDays = [...profile.wfh_days];
    const index = currentDays.indexOf(day);
    
    if (index > -1) {
      currentDays.splice(index, 1);
    } else {
      currentDays.push(day);
    }
    
    setProfile({ ...profile, wfh_days: currentDays });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ text: '', type: '' });

    if (!profile.employee_id) {
      setMessage({ text: 'Employee ID is required.', type: 'error' });
      setSaving(false);
      return;
    }

    try {
      const response = await fetch('/api/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employee_id: profile.employee_id,
          company_password: profile.company_password,
          wfh_days: profile.wfh_days,
          login_time: `${profile.login_time}:00`,
          logout_time: `${profile.logout_time}:00`,
          is_automation_enabled: profile.is_automation_enabled,
          wfh_reason: profile.wfh_reason
        }),
      });

      if (response.ok) {
        setMessage({ text: 'Configuration saved successfully!', type: 'success' });
        setIsLocked(true);
        if (profile.company_password && profile.company_password !== '__PRESERVED_PASSWORD__') {
          setHasPasswordStored(true);
          setProfile(prev => ({ ...prev, company_password: '__PRESERVED_PASSWORD__' }));
        }
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save profile settings.');
      }
    } catch (error: any) {
      setMessage({ text: error.message || 'Error occurred while saving.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const runTestTrigger = async (testMode: 'login' | 'logout') => {
    setTesting(true);
    setTestLogs([`[System] Starting local test run in ${testMode.toUpperCase()} mode...`]);
    
    try {
      const currentDay = new Date().toLocaleDateString('en-US', { weekday: 'long' });
      const currentFormattedDate = new Date().toISOString().split('T')[0];

      setTestLogs(prev => [...prev, `[System] Current day is evaluated as: ${currentDay}`]);
      setTestLogs(prev => [...prev, `[System] Current date is evaluated as: ${currentFormattedDate}`]);
      
      const isWfh = profile.wfh_days.some(d => d.toLowerCase() === currentDay.toLowerCase());
      if (!isWfh) {
        setTestLogs(prev => [
          ...prev, 
          `[Warning] Today (${currentDay}) is not set as a WFH day in your schedule list!`,
          `[System] Overriding day condition for this custom manual test run...`
        ]);
      }

      setTestLogs(prev => [...prev, `[System] Querying local Playwright route at: /api/cron/run-timelog`]);

      const response = await fetch(`/api/cron/run-timelog?mode=${testMode}&day=${currentDay}&date=${currentFormattedDate}&test=true`);
      
      let data: any = {};
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        throw new Error(`Server returned HTML error (Status ${response.status}). This means Vercel's serverless function crashed or timed out before it could respond. 

This happens because PLAYWRIGHT_SERVICE_URL is not configured in your Vercel Environment Variables. 

Since Vercel Serverless is size-restricted, running browser automation locally (chromium.launch()) crashes. You must add the free PLAYWRIGHT_SERVICE_URL env to your Vercel project settings to delegate the headless browser run!`);
      }

      if (response.ok) {
        setTestLogs(prev => [
          ...prev,
          `[API Response Status] 200 OK`,
          `[API Message] ${data.message}`,
          `[Evaluated Mode] ${data.mode}`,
          `[Evaluated Day] ${data.dayEvaluated}`,
          `[Evaluated Date] ${data.dateEvaluated}`,
          `------------------------------`,
          ...data.results.map((res: any) => 
            `[User Result] Employee ID: ${res.employeeId} | Status: ${res.status.toUpperCase()} | Info: ${res.message}`
          ),
          `------------------------------`,
          `[Execution Summary] Success: ${data.summary.success} | Failed: ${data.summary.failed} | Skipped: ${data.summary.skipped}`
        ]);
      } else {
        throw new Error((data.error || 'Server cron failed.') + (data.details ? ' | Details: ' + data.details : ''));
      }
    } catch (err: any) {
      setTestLogs(prev => [
        ...prev,
        `[Error] Execution aborted: ${err.message}`,
        `[Advice] Ensure your database tables are migrated and your Supabase credentials in .env.local are correct!`
      ]);
    } finally {
      setTesting(false);
    }
  };

  const triggerBats = (e: React.MouseEvent) => {
    e.preventDefault();
    setTriggerBatEffect(true);
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        height: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-canvas)'
      }}>
        <div className="ui-card" style={{
          padding: '2rem 3rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          maxWidth: '320px'
        }}>
          <Loader2 style={{ animation: 'spin 1.5s linear infinite', width: '24px', height: '24px', color: 'var(--brand-navy)' }} />
          <span style={{ fontFamily: 'var(--font-title)', fontWeight: 600, color: 'var(--brand-navy)' }}>Loading...</span>
        </div>
        <style jsx global>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <BatEffect trigger={triggerBatEffect} setTrigger={setTriggerBatEffect} />
      
      {/* Main Grid Content */}
      <main style={{
        flex: 1,
        padding: '2.5rem 2rem',
        maxWidth: '1280px',
        width: '100%',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '2.25rem'
      }}>
        
        {/* Seamless Header Row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: '0.5rem',
          borderBottom: '1px solid rgba(226, 232, 240, 0.5)'
        }}>
          <div>
            <h2 style={{ fontSize: '1.85rem', fontWeight: 800, fontFamily: 'var(--font-title)', color: 'var(--brand-navy)', letterSpacing: '-0.02em', margin: 0 }}>Tap</h2>
            <p
              onClick={triggerBats}
              className="bruce-wayne-easter"
              style={{ fontSize: '10px', color: 'var(--accent-blue)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.12em', cursor: 'pointer', userSelect: 'none', margin: '2px 0 0 0', transition: 'all 0.2s', display: 'inline-block' }}
            >
              by Bruce Wayne
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div className="header-email-desktop" style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500, margin: 0 }}>{userEmail}</p>
            </div>
            <button 
              id="sign-out-btn" 
              onClick={handleSignOut} 
              className="btn-ui-secondary btn-signout" 
              style={{
                padding: '0.45rem 1rem',
                fontSize: '0.8rem',
                borderRadius: '999px',
                width: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              <LogOut style={{ width: '14px', height: '14px' }} />
              Sign Out
            </button>
          </div>
        </div>
        
        {/* Main Controls Form */}
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '2.25rem' }}>
          
          {/* 1. Header Control Panel Card */}
          <div className="ui-card" style={{
            maxWidth: '100%',
            padding: '1.25rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
          }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-title)', color: 'var(--brand-navy)' }}>
                Automation Control
              </h3>
            </div>

            {/* Toggle Switch */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ 
                fontSize: '0.85rem', 
                fontWeight: 600, 
                color: profile.is_automation_enabled ? 'var(--accent-blue)' : 'var(--text-muted)' 
              }}>
                {profile.is_automation_enabled ? 'Active' : 'Paused'}
              </span>
              <label className="switch-container">
                <input
                  id="automation-toggle-input"
                  type="checkbox"
                  checked={profile.is_automation_enabled}
                  onChange={(e) => setProfile({ ...profile, is_automation_enabled: e.target.checked })}
                  className="switch-input"
                />
                {/* Standard styled switch using CSS slider */}
                <span className="switch-slider" style={{
                  position: 'relative',
                  display: 'block',
                  width: '46px',
                  height: '24px',
                  background: '#cbd5e1',
                  borderRadius: '999px',
                  cursor: 'pointer'
                }}></span>
              </label>
            </div>
          </div>

          {/* Leaves & Holidays Panel (Standly Integration) */}
          <div className="ui-card" style={{
            maxWidth: '100%',
            padding: '2.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
              <ShieldCheck style={{ width: '20px', height: '20px', color: 'var(--brand-navy)' }} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-title)', color: 'var(--brand-navy)', margin: 0 }}>
                Leaves and Holidays
              </h3>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', backgroundColor: '#f1f5f9', padding: '2px 8px', borderRadius: '12px', marginLeft: 'auto' }}>
                Synced with Standly
              </span>
            </div>

            {loadingStandly ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', gap: '8px' }}>
                <Loader2 className="animate-spin" style={{ width: '16px', height: '16px', color: 'var(--accent-blue)', animation: 'spin 1.5s linear infinite' }} />
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>Syncing...</span>
              </div>
            ) : (() => {
              const today = new Date();
              today.setHours(0,0,0,0);

              const currentYear = today.getFullYear();
              const currentMonth = today.getMonth();

              const activeLeaves = leaves.filter((leave: any) => {
                const endDate = new Date(leave.end_date);
                endDate.setHours(23, 59, 59, 999);
                return endDate >= today;
              });

              const upcomingHolidays = holidays.filter((holiday: any) => {
                const holidayDate = new Date(holiday.date);
                holidayDate.setHours(0, 0, 0, 0);
                return holidayDate >= today && 
                       holidayDate.getFullYear() === currentYear && 
                       holidayDate.getMonth() === currentMonth;
              });

              const totalCount = activeLeaves.length + upcomingHolidays.length;

              if (totalCount === 0) {
                return (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0.75rem 1rem',
                    backgroundColor: 'rgba(41, 116, 166, 0.04)',
                    borderRadius: '16px',
                    border: '1px dashed rgba(41, 116, 166, 0.15)',
                    gap: '8px'
                  }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 550 }}>
                      🏖️ No active leaves or holidays this month.
                    </span>
                  </div>
                );
              }

              return (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: '1.25rem'
                }}>
                  {/* My Leaves Column */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <h4 style={{ fontSize: '0.85rem', fontWeight: 700, fontFamily: 'var(--font-title)', color: 'var(--brand-navy)', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                      <span style={{ display: 'inline-block', width: '5px', height: '5px', borderRadius: '50%', backgroundColor: 'var(--accent-orange)' }}></span>
                      Active Leaves
                    </h4>
                    {activeLeaves.length === 0 ? (
                      <div style={{ padding: '0.75rem', border: '1px dashed #e2e8f0', borderRadius: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        No active leaves.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {activeLeaves.map((leave, idx) => {
                          let badgeBg = '#f1f5f9';
                          let badgeColor = '#475569';
                          let typeLabel = leave.type;
                          
                          switch (leave.type?.toLowerCase()) {
                            case 'vacation':
                              badgeBg = '#ecfdf5';
                              badgeColor = '#059669';
                              typeLabel = '🏖️ Vacation';
                              break;
                            case 'sick':
                              badgeBg = '#fef2f2';
                              badgeColor = '#dc2626';
                              typeLabel = '🤒 Sick';
                              break;
                            case 'personal':
                              badgeBg = '#fef3c7';
                              badgeColor = '#d97706';
                              typeLabel = '🏠 Personal';
                              break;
                            case 'wellness':
                              badgeBg = '#f0fdf4';
                              badgeColor = '#16a34a';
                              typeLabel = '🧘 Wellness';
                              break;
                            case 'birthday':
                              badgeBg = '#fdf2f8';
                              badgeColor = '#db2777';
                              typeLabel = '🎂 Birthday';
                              break;
                          }

                          const start = new Date(leave.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                          const end = new Date(leave.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                          const dateText = start === end ? start : `${start} - ${end}`;

                          return (
                            <div key={leave.id || idx} style={{
                              padding: '0.65rem 0.85rem',
                              borderRadius: '14px',
                              background: '#ffffff',
                              border: '1px solid #f1f5f9',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.01)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '4px',
                              cursor: 'default'
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                                <span style={{
                                  fontSize: '0.7rem',
                                  fontWeight: 700,
                                  padding: '2px 8px',
                                  borderRadius: '999px',
                                  backgroundColor: badgeBg,
                                  color: badgeColor
                                }}>
                                  {typeLabel}
                                </span>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 550 }}>
                                  {dateText}
                                </span>
                              </div>
                              {leave.reason && (
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-primary)', margin: 0, fontStyle: 'italic', lineHeight: '1.3' }}>
                                  "{leave.reason}"
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Company Holidays Column */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <h4 style={{ fontSize: '0.85rem', fontWeight: 700, fontFamily: 'var(--font-title)', color: 'var(--brand-navy)', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                      <span style={{ display: 'inline-block', width: '5px', height: '5px', borderRadius: '50%', backgroundColor: 'var(--accent-blue)' }}></span>
                      Holidays this Month
                    </h4>
                    {upcomingHolidays.length === 0 ? (
                      <div style={{ padding: '0.75rem', border: '1px dashed #e2e8f0', borderRadius: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        No holidays this month.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {upcomingHolidays.map((holiday, idx) => {
                          const hDate = new Date(holiday.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' });

                          return (
                            <div key={holiday.id || idx} style={{
                              padding: '0.65rem 0.85rem',
                              borderRadius: '14px',
                              background: 'rgba(41, 116, 166, 0.03)',
                              border: '1px solid rgba(41, 116, 166, 0.1)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '0.5rem'
                            }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-navy)' }}>
                                  {holiday.name}
                                </span>
                                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                                  {hDate}
                                </span>
                              </div>
                              <span style={{
                                fontSize: '0.6rem',
                                fontWeight: 750,
                                color: 'var(--accent-blue)',
                                backgroundColor: 'rgba(41, 116, 166, 0.08)',
                                padding: '1px 6px',
                                borderRadius: '6px',
                                textTransform: 'uppercase',
                                letterSpacing: '0.02em'
                              }}>
                                Active
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Two Column Layout Split */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '2.25rem'
          }}>
            
            {/* 2. Portal Credentials Card */}
            <div className="ui-card" style={{ maxWidth: '100%', padding: '2.25rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div 
                onClick={() => hasPasswordStored && setIsLocked(!isLocked)}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between', 
                  borderBottom: '1px solid #e2e8f0', 
                  paddingBottom: '0.75rem',
                  cursor: hasPasswordStored ? 'pointer' : 'default',
                  userSelect: 'none'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Settings style={{ width: '20px', height: '20px', color: 'var(--brand-navy)' }} />
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-title)', color: 'var(--brand-navy)' }}>
                    Portal Credentials
                  </h3>
                </div>
                {hasPasswordStored && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsLocked(!isLocked);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent-blue)',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      textDecoration: 'underline'
                    }}
                  >
                    {isLocked ? 'Edit' : 'Lock'}
                  </button>
                )}
              </div>

              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                Credentials entered here are encrypted and safe.
              </p>

              {/* Employee ID */}
              <div>
                <label className="glass-label" htmlFor="employee-id-input">Employee ID</label>
                <div className="ui-input-wrapper" style={{ 
                  marginBottom: 0,
                  marginTop: '0.5rem',
                  opacity: isLocked ? 0.75 : 1,
                  backgroundColor: isLocked ? '#f8fafc' : 'transparent'
                }}>
                  <User className="ui-input-icon" />
                  <input
                    id="employee-id-input"
                    type="text"
                    autoComplete="off"
                    placeholder="200002000"
                    value={profile.employee_id}
                    onChange={(e) => setProfile({ ...profile, employee_id: e.target.value })}
                    className="ui-input"
                    readOnly={isLocked}
                    required
                    style={{
                      cursor: isLocked ? 'not-allowed' : 'text'
                    }}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="glass-label" htmlFor="company-password-input">Password</label>
                <div className="ui-input-wrapper" style={{ 
                  marginBottom: 0,
                  marginTop: '0.5rem',
                  opacity: isLocked ? 0.75 : 1,
                  backgroundColor: isLocked ? '#f8fafc' : 'transparent'
                }}>
                  <Lock className="ui-input-icon" />
                  <input
                    id="company-password-input"
                    type={showPassword && !isLocked ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder={hasPasswordStored ? '••••••••' : 'Enter your password'}
                    value={profile.company_password === '__PRESERVED_PASSWORD__' ? '' : profile.company_password}
                    onChange={(e) => setProfile({ ...profile, company_password: e.target.value || '__PRESERVED_PASSWORD__' })}
                    className="ui-input"
                    readOnly={isLocked}
                    style={{ 
                      paddingRight: '2.5rem',
                      cursor: isLocked ? 'not-allowed' : 'text'
                    }}
                  />
                  {!isLocked && (
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        position: 'absolute',
                        right: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer'
                      }}
                    >
                      {showPassword ? <EyeOff style={{ width: '16px', height: '16px' }} /> : <Eye style={{ width: '16px', height: '16px' }} />}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* 3. Schedule Settings Card */}
            <div className="ui-card" style={{ maxWidth: '100%', padding: '2.25rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
                <Calendar style={{ width: '20px', height: '20px', color: 'var(--brand-navy)' }} />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-title)', color: 'var(--brand-navy)' }}>
                  Work From Home Schedule
                </h3>
              </div>

              {/* Day selection pill badges */}
              <div>
                <label className="glass-label">WFH Active Weekdays</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                  {WEEKDAYS.map((day) => {
                    const isSelected = profile.wfh_days.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => handleWfhDayToggle(day)}
                        className={`custom-checkbox ${isSelected ? 'selected' : ''}`}
                        style={{
                          padding: '0.55rem 0.95rem',
                          fontSize: '0.8rem',
                          borderRadius: '999px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          border: isSelected ? '1px solid var(--accent-blue)' : '1px solid var(--input-border)',
                          backgroundColor: isSelected ? 'rgba(41, 116, 166, 0.08)' : 'transparent',
                          color: isSelected ? 'var(--accent-blue)' : 'var(--text-muted)',
                          fontWeight: isSelected ? 600 : 500,
                          cursor: 'pointer'
                        }}
                      >
                        {isSelected && <Check style={{ width: '12px', height: '12px', strokeWidth: 3 }} />}
                        {day.substring(0, 3)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Reason input rounded */}
              <div>
                <label className="glass-label" htmlFor="wfh-reason-input">Reason</label>
                <div className="ui-input-wrapper" style={{ marginBottom: 0, marginTop: '0.5rem' }}>
                  <input
                    id="wfh-reason-input"
                    type="text"
                    autoComplete="off"
                    placeholder="Work from home"
                    value={profile.wfh_reason}
                    onChange={(e) => setProfile({ ...profile, wfh_reason: e.target.value })}
                    className="ui-input"
                    style={{ paddingLeft: '1.25rem' }}
                    required
                  />
                </div>
              </div>

              {/* Time inputs rounded */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label className="glass-label" htmlFor="login-time-input">Log In Time</label>
                  <div className="ui-input-wrapper" style={{ marginBottom: 0, marginTop: '0.5rem' }}>
                    <Clock className="ui-input-icon" />
                    <input
                      id="login-time-input"
                      type="time"
                      value={profile.login_time}
                      onChange={(e) => setProfile({ ...profile, login_time: e.target.value })}
                      className="ui-input"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="glass-label" htmlFor="logout-time-input">Log Out Time</label>
                  <div className="ui-input-wrapper" style={{ marginBottom: 0, marginTop: '0.5rem' }}>
                    <Clock className="ui-input-icon" />
                    <input
                      id="logout-time-input"
                      type="time"
                      value={profile.logout_time}
                      onChange={(e) => setProfile({ ...profile, logout_time: e.target.value })}
                      className="ui-input"
                      required
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Feedback messages */}
          {message.text && (
            <div style={{
              background: message.type === 'success' ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${message.type === 'success' ? '#dcfce7' : '#fee2e2'}`,
              color: message.type === 'success' ? '#166534' : '#991b1b',
              padding: '0.85rem 1.25rem',
              borderRadius: '20px',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}>
              <AlertCircle style={{ width: '18px', height: '18px' }} />
              {message.text}
            </div>
          )}

          {/* Save Button Centered */}
          <div style={{ display: 'flex', justifyContent: 'center', width: '100%', marginTop: '1rem' }}>
            <button 
              id="save-settings-btn" 
              type="submit" 
              className="btn-ui-primary" 
              disabled={saving}
              style={{ width: '100%', maxWidth: '320px' }}
            >
              {saving ? (
                <>
                  <Loader2 className="animate-spin" style={{ width: '18px', height: '18px', animation: 'spin 1.5s linear infinite' }} />
                  Saving...
                </>
              ) : (
                <>
                  <Save style={{ width: '18px', height: '18px' }} />
                  Save
                </>
              )}
            </button>
          </div>
        </form>

        {/* 4. Automated Testing Sandbox */}
        <div className="ui-card" style={{
          maxWidth: '100%',
          padding: '2.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
          border: '1px dashed var(--accent-blue)',
          backgroundColor: 'rgba(255, 255, 255, 0.7)',
          backdropFilter: 'blur(10px)'
        }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Terminal style={{ width: '20px', height: '20px', color: 'var(--brand-navy)' }} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-title)', color: 'var(--brand-navy)' }}>
                Playwright Live Sandbox
              </h3>
            </div>
            
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => runTestTrigger('login')}
                disabled={testing || saving || !profile.employee_id}
                className="btn-ui-secondary"
                style={{
                  padding: '0.45rem 1rem',
                  fontSize: '0.8rem',
                  borderRadius: '999px',
                  width: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  borderColor: 'var(--accent-blue)',
                  color: 'var(--accent-blue)'
                }}
              >
                <Play style={{ width: '12px', height: '12px', fill: 'var(--accent-blue)', stroke: 'none' }} />
                Test LOG IN
              </button>

              <button
                type="button"
                onClick={() => runTestTrigger('logout')}
                disabled={testing || saving || !profile.employee_id}
                className="btn-ui-secondary"
                style={{
                  padding: '0.45rem 1rem',
                  fontSize: '0.8rem',
                  borderRadius: '999px',
                  width: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  borderColor: 'var(--brand-navy)',
                  color: 'var(--brand-navy)'
                }}
              >
                <Play style={{ width: '12px', height: '12px', fill: 'var(--brand-navy)', stroke: 'none' }} />
                Test LOG OUT
              </button>
            </div>
          </div>

          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
            Verify your login credentials and attendance variables immediately. Trigger a secure dry-run and inspect the live Playwright automation steps and response logs below in real-time.
          </p>

          {/* Virtual Terminal Console */}
          <div style={{
            background: '#091524',
            border: '1px solid #1e293b',
            borderRadius: '16px',
            fontFamily: 'monospace',
            fontSize: '0.8rem',
            color: '#34d399',
            padding: '1.25rem',
            minHeight: '160px',
            maxHeight: '300px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            boxShadow: 'inset 0 4px 12px rgba(0,0,0,0.5)'
          }}>
            {testLogs.length === 0 ? (
              <span style={{ color: 'rgba(255,255,255,0.2)', fontStyle: 'italic' }}>
                Console idle. Click "Test LOG IN" or "Test LOG OUT" to initiate an automated browser execution.
              </span>
            ) : (
              testLogs.map((log, index) => {
                let styleColor = '#34d399'; // Default terminal green
                if (log.includes('[Error]')) styleColor = '#f87171'; // Red
                if (log.includes('[Warning]')) styleColor = '#fbbf24'; // Orange
                if (log.includes('[System]')) styleColor = '#60a5fa'; // Blue
                if (log.includes('---')) styleColor = 'rgba(255,255,255,0.1)';
                
                return (
                  <div key={index} style={{ color: styleColor, whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
                    {log}
                  </div>
                );
              })
            )}
            {testing && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#60a5fa', marginTop: '4px' }}>
                <Loader2 className="animate-spin" style={{ width: '12px', height: '12px', animation: 'spin 1.5s linear infinite' }} />
                <span>Playwright headless worker active. Launching portal sandbox...</span>
              </div>
            )}
          </div>
        </div>

      </main>

      <footer style={{
        padding: '2rem',
        textAlign: 'center',
        borderTop: '1px solid #e2e8f0',
        fontSize: '0.8rem',
        color: 'var(--text-muted)',
        marginTop: 'auto',
        backgroundColor: '#ffffff'
      }}>
        © 2026 Tap. by <span onClick={triggerBats} className="bruce-wayne-easter" style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--brand-navy)', textDecoration: 'none', transition: 'color 0.2s ease-in-out' }}>Bruce Wayne</span>.
      </footer>
      
      {/* Dynamic inline styles for switch component toggles and custom animations */}
      <style jsx global>{`
        .bruce-wayne-easter:hover {
          color: var(--accent-blue) !important;
          text-shadow: 0 0 8px rgba(41, 116, 166, 0.25);
        }
        .switch-container {
          display: inline-flex;
          align-items: center;
          position: relative;
        }
        .switch-input {
          display: none;
        }
        .switch-slider::before {
          content: "";
          position: absolute;
          left: 2px;
          top: 2px;
          width: 20px;
          height: 20px;
          background: #ffffff;
          border-radius: 50%;
          transition: transform 0.2s ease-in-out;
          box-shadow: 0 2px 5px rgba(17, 51, 85, 0.15);
        }
        .switch-input:checked + .switch-slider {
          background: var(--brand-navy) !important;
          box-shadow: 0 4px 12px rgba(17, 51, 85, 0.2);
        }
        .switch-input:checked + .switch-slider::before {
          transform: translateX(22px);
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </div>
  );
}
