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

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export default function DashboardPage() {
  const [profile, setProfile] = useState({
    employee_id: '',
    company_password: '',
    wfh_days: [] as string[],
    login_time: '08:00',
    logout_time: '17:00',
    is_automation_enabled: true
  });
  
  const [userEmail, setUserEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' as 'success' | 'error' | '' });
  const [testLogs, setTestLogs] = useState<string[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [hasPasswordStored, setHasPasswordStored] = useState(false);

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

          setProfile({
            employee_id: data.employee_id || '',
            company_password: passwordPresent ? '__PRESERVED_PASSWORD__' : '',
            wfh_days: data.wfh_days || [],
            login_time: cleanLoginTime,
            logout_time: cleanLogoutTime,
            is_automation_enabled: data.is_automation_enabled !== undefined ? data.is_automation_enabled : true
          });
        }
      } catch (error) {
        console.error('Failed to load profile settings:', error);
        setMessage({ text: 'Failed to load configuration.', type: 'error' });
      } finally {
        setLoading(false);
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
          is_automation_enabled: profile.is_automation_enabled
        }),
      });

      if (response.ok) {
        setMessage({ text: 'Configuration saved and encrypted successfully!', type: 'success' });
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

      const response = await fetch(`/api/cron/run-timelog?mode=${testMode}&day=${currentDay}&date=${currentFormattedDate}`);
      const data = await response.json();

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
        throw new Error(data.error || 'Server cron failed.');
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
      {/* Top Header Navigation */}
      <header className="header-ui" style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        padding: '0.85rem 2rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-title)', color: 'var(--brand-navy)' }}>Tap</h2>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Automated WFH Timelogs</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500 }}>{userEmail}</p>
          </div>
          <button 
            id="sign-out-btn" 
            onClick={handleSignOut} 
            className="btn-ui-secondary" 
            style={{
              padding: '0.45rem 1rem',
              fontSize: '0.8rem',
              borderRadius: '999px',
              width: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: '#ef4444',
              borderColor: 'rgba(239, 68, 68, 0.4)'
            }}
          >
            <LogOut style={{ width: '14px', height: '14px' }} />
            Sign Out
          </button>
        </div>
      </header>

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
        
        {/* Main Controls Form */}
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '2.25rem' }}>
          
          {/* 1. Header Control Panel Card */}
          <div className="ui-card" style={{
            maxWidth: '100%',
            padding: '2rem',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1.5rem',
          }}>
            <div>
              <h3 style={{ fontSize: '1.3rem', fontWeight: 700, fontFamily: 'var(--font-title)', color: 'var(--brand-navy)' }}>
                Automation Control Center
              </h3>
            </div>

            {/* Toggle Switch */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ 
                fontSize: '0.9rem', 
                fontWeight: 600, 
                color: profile.is_automation_enabled ? 'var(--accent-blue)' : 'var(--text-muted)' 
              }}>
                {profile.is_automation_enabled ? 'Automation ACTIVE' : 'Automation PAUSED'}
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
                  width: '50px',
                  height: '26px',
                  background: '#cbd5e1',
                  borderRadius: '999px',
                  cursor: 'pointer'
                }}></span>
              </label>
            </div>
          </div>

          {/* Two Column Layout Split */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '2.25rem'
          }}>
            
            {/* 2. Corporate Credentials Card */}
            <div className="ui-card" style={{ maxWidth: '100%', padding: '2.25rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
                <Settings style={{ width: '20px', height: '20px', color: 'var(--brand-navy)' }} />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-title)', color: 'var(--brand-navy)' }}>
                  Corporate Credentials
                </h3>
              </div>

              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                Credentials entered here are encrypted and safe.
              </p>

              {/* Employee ID rounded */}
              <div>
                <label className="glass-label" htmlFor="employee-id-input">Employee ID</label>
                <div className="ui-input-wrapper" style={{ marginBottom: 0 }}>
                  <User className="ui-input-icon" />
                  <input
                    id="employee-id-input"
                    type="text"
                    placeholder="200002000"
                    value={profile.employee_id}
                    onChange={(e) => setProfile({ ...profile, employee_id: e.target.value })}
                    className="ui-input"
                    required
                  />
                </div>
              </div>

              {/* Password rounded */}
              <div>
                <label className="glass-label" htmlFor="company-password-input">Password</label>
                <div className="ui-input-wrapper" style={{ marginBottom: 0 }}>
                  <Lock className="ui-input-icon" />
                  <input
                    id="company-password-input"
                    type={showPassword ? 'text' : 'password'}
                    placeholder={hasPasswordStored ? '••••••••' : 'Enter your password'}
                    value={profile.company_password === '__PRESERVED_PASSWORD__' ? '' : profile.company_password}
                    onChange={(e) => setProfile({ ...profile, company_password: e.target.value || '__PRESERVED_PASSWORD__' })}
                    className="ui-input"
                    style={{ paddingRight: '2.5rem' }}
                  />
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
                </div>
                {hasPasswordStored && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--accent-blue)', marginTop: '0.5rem', display: 'block', fontWeight: 500 }}>
                    ✓ Encrypted password saved. Type to replace it.
                  </span>
                )}
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

              {/* Time inputs rounded */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label className="glass-label" htmlFor="login-time-input">Log In Time</label>
                  <div className="ui-input-wrapper" style={{ marginBottom: 0 }}>
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
                  <div className="ui-input-wrapper" style={{ marginBottom: 0 }}>
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

          {/* Save Button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button 
              id="save-settings-btn" 
              type="submit" 
              className="btn-ui-primary" 
              disabled={saving}
              style={{ width: 'auto', minWidth: '220px' }}
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
        © 2026 Tap. Created by Bruce Wayne.
      </footer>
      
      {/* Dynamic inline styles for switch component toggles */}
      <style jsx global>{`
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
          width: 22px;
          height: 22px;
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
          transform: translateX(24px);
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
