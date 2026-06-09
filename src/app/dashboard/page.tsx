'use client';

import React, { useState, useEffect, useRef } from 'react';
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
  EyeOff,
  Megaphone,
  Trash2,
  Plus,
  RefreshCw
} from 'lucide-react';
import Logo from '@/components/Logo';
import BatEffect from '@/components/effects/BatEffect';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

// Elegant retro-futuristic dark terminal console to show live automation updates
const TerminalConsole = ({ logs, onClose }: { logs: Array<{ status: string; message: string }>; onClose: () => void }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [isHovered, setIsHovered] = useState<boolean>(false);

  useEffect(() => {
    if (containerRef.current && autoScroll && !isHovered) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoScroll, isHovered]);

  return (
    <div 
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onTouchStart={() => setIsHovered(true)}
      onTouchEnd={() => setIsHovered(false)}
      style={{
        background: '#040b14',
        border: '1px solid #1e293b',
        borderRadius: '16px',
        fontFamily: 'Consolas, Monaco, monospace',
        fontSize: '0.8rem',
        color: '#34d399',
        padding: '1.25rem',
        marginTop: '1.25rem',
        position: 'relative',
        boxShadow: 'inset 0 4px 12px rgba(0,0,0,0.6)',
        width: '100%',
        animation: 'fadeIn 0.3s ease-out'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.6rem', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444' }}></div>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f59e0b' }}></div>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }}></div>
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', marginLeft: '6px', letterSpacing: '0.05em' }}>playwright-agent@tap: ~</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            onClick={() => setAutoScroll(prev => !prev)}
            style={{
              background: autoScroll ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
              border: `1px solid ${autoScroll ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              borderRadius: '6px',
              color: autoScroll ? '#34d399' : '#ef4444',
              fontFamily: 'sans-serif',
              fontSize: '0.65rem',
              fontWeight: 700,
              padding: '2px 8px',
              cursor: 'pointer',
              letterSpacing: '0.03em',
              transition: 'all 0.2s ease-in-out'
            }}
          >
            {autoScroll ? '● AUTO-SCROLL' : '🔒 FREEZE'}
          </button>
          <button 
            type="button"
            onClick={onClose} 
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: '0.85rem', padding: '0 4px', transition: 'color 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.color = '#ffffff'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.3)'}
          >
            ✕
          </button>
        </div>
      </div>

      <div 
        ref={containerRef}
        style={{ maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', scrollbarWidth: 'thin' }}
      >
        {logs.map((log, index) => {
          let styleColor = '#34d399'; // Default green
          if (log.status === 'error') styleColor = '#f87171'; // Red
          if (log.status === 'warn') styleColor = '#fbbf24'; // Orange
          if (log.status === 'success') styleColor = '#10b981'; // Vivid Green
          if (log.status === 'info') styleColor = '#60a5fa'; // Blue
          
          return (
            <div key={index} style={{ color: styleColor, whiteSpace: 'pre-wrap', lineHeight: '1.5', display: 'flex', gap: '6px' }}>
              <span style={{ color: 'rgba(255,255,255,0.15)', userSelect: 'none' }}>$</span>
              <span>{log.message}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default function DashboardPage() {
  const [profile, setProfile] = useState({
    id: '',
    employee_id: '',
    company_password: '',
    wfh_days: [] as string[],
    login_time: '08:00',
    logout_time: '17:00',
    is_automation_enabled: true,
    wfh_reason: 'Work from home',
    role: 'user',
    wfh_offsets: {} as Record<string, any>
  });

  // Company Events State
  const [companyEvents, setCompanyEvents] = useState<any[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [newEvent, setNewEvent] = useState({
    title: '',
    date: '',
    login_time: '08:00',
    logout_time: '12:00'
  });
  const [isSubmittingEvent, setIsSubmittingEvent] = useState(false);
  const [eventMessage, setEventMessage] = useState({ text: '', type: '' as 'success' | 'error' | '' });
  
  // Exclusions State
  const [allEmployees, setAllEmployees] = useState<any[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [excludedUsers, setExcludedUsers] = useState<string[]>([]);
  
  const [userEmail, setUserEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' as 'success' | 'error' | '' });
  const [showPassword, setShowPassword] = useState(false);
  const [hasPasswordStored, setHasPasswordStored] = useState(false);
  const [isLocked, setIsLocked] = useState(true);
  const [triggerBatEffect, setTriggerBatEffect] = useState(false);
  const [triggeringManualLog, setTriggeringManualLog] = useState<'login' | 'logout' | null>(null);
  const [manualDate, setManualDate] = useState('');
  const [adminStats, setAdminStats] = useState({ todayLogins: 0, todayLogouts: 0, activeAutomatedUsers: 0 });
  
  // Date-Specific Schedule Offsets / Day Swaps
  const [offsetSourceDate, setOffsetSourceDate] = useState('');
  const [offsetTargetDate, setOffsetTargetDate] = useState('');

  const handleAddOffsetSwap = async () => {
    if (!offsetSourceDate || !offsetTargetDate) {
      addToast('Error', 'Please select both swap dates.', 'sync', 'failed');
      return;
    }
    if (offsetSourceDate === offsetTargetDate) {
      addToast('Error', 'Swap dates must be different.', 'sync', 'failed');
      return;
    }

    const newOffsets = {
      ...(profile.wfh_offsets || {}),
      [offsetSourceDate]: { status: 'wfh', pairedWith: offsetTargetDate },
      [offsetTargetDate]: { status: 'office', pairedWith: offsetSourceDate }
    };

    setProfile(prev => ({
      ...prev,
      wfh_offsets: newOffsets
    }));
    setOffsetSourceDate('');
    setOffsetTargetDate('');
    await saveWfhOffsets(newOffsets);
  };

  const handleDeleteOffsetSwap = async (dateKey: string) => {
    const newOffsets = { ...(profile.wfh_offsets || {}) };
    const entry = newOffsets[dateKey];
    
    if (entry && typeof entry === 'object' && 'pairedWith' in entry) {
      const counterpart = entry.pairedWith;
      delete newOffsets[counterpart];
    }
    delete newOffsets[dateKey];

    setProfile(prev => ({
      ...prev,
      wfh_offsets: newOffsets
    }));
    await saveWfhOffsets(newOffsets);
  };

  const saveWfhOffsets = async (newOffsets: Record<string, any>) => {
    try {
      const response = await fetch('/api/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employee_id: profile.employee_id,
          company_password: '__PRESERVED_PASSWORD__',
          wfh_days: profile.wfh_days,
          login_time: `${profile.login_time}:00`,
          logout_time: `${profile.logout_time}:00`,
          is_automation_enabled: profile.is_automation_enabled,
          wfh_reason: profile.wfh_reason,
          wfh_offsets: newOffsets
        }),
      });
      if (response.ok) {
        addToast('Success', 'Schedule offsets updated successfully!', 'sync', 'success');
      } else {
        const errorData = await response.json();
        addToast('Error', errorData.error || 'Failed to update offsets.', 'sync', 'failed');
      }
    } catch (error: any) {
      addToast('Error', error.message || 'Error occurred while saving.', 'sync', 'failed');
    }
  };
  
  // Real-time Virtual Terminal Logging
  const [activeConsoleLogs, setActiveConsoleLogs] = useState<Array<{ status: string; message: string }>>([]);
  const [showConsole, setShowConsole] = useState(false);
  const [consoleTriggerSource, setConsoleTriggerSource] = useState<'user' | null>(null);

  // Standly Integration State
  const [leaves, setLeaves] = useState<any[]>([]);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [loadingStandly, setLoadingStandly] = useState(true);

  // Portal Log History Integration State
  const [portalLogs, setPortalLogs] = useState<any[]>([]);
  const [loadingPortalLogs, setLoadingPortalLogs] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [portalLogsViewMode, setPortalLogsViewMode] = useState<'calendar' | 'list'>('calendar');
  const [calendarMonthOffset, setCalendarMonthOffset] = useState<number>(0);
  const [recoveryStatus, setRecoveryStatus] = useState<{ date: string; modeLabel: string; state: 'running' | 'success' | 'failed' } | null>(null);
  const [deletingDocNo, setDeletingDocNo] = useState<string | null>(null);
  const attemptedRecoveriesRef = useRef<Set<string>>(new Set());
  const [toasts, setToasts] = useState<Array<{ id: string; title: string; message: string; date: string; type: 'info' | 'success' | 'failed' }>>([]);
  const [isAdminWorkspaceExpanded, setIsAdminWorkspaceExpanded] = useState<boolean>(false);

  const addToast = (title: string, message: string, date: string, type: 'info' | 'success' | 'failed') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, title, message, date, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 6000);
  };

  const router = useRouter();
  const supabase = createClient();

  const checkAndRecoverMissedTimeouts = async (logs: any[], activeWfhDays?: string[], isAutomationEnabled?: boolean) => {
    const automationEnabled = isAutomationEnabled !== undefined ? isAutomationEnabled : profile.is_automation_enabled;
    if (!automationEnabled) {
      console.log('[Auto-Recovery] Automation is disabled. Skipping self-healing checks.');
      return;
    }

    // 1. Group logs by date using robust ISO formatting
    const getLogDateKeyLocal = (logDateStr: string) => {
      try {
        const cleaned = logDateStr.trim();
        const datePart = cleaned.includes(' ') ? cleaned.split(/\s+/)[0] : cleaned;
        const [m, d, y] = datePart.split('/');
        const cleanY = y.trim();
        const cleanM = m.trim();
        const cleanD = d.trim();
        const yearStr = cleanY.length === 2 ? `20${cleanY}` : cleanY;
        const monthStr = cleanM.padStart(2, '0');
        const dayStr = cleanD.padStart(2, '0');
        return `${yearStr}-${monthStr}-${dayStr}`;
      } catch {
        return '';
      }
    };

    const logsMap: Record<string, any[]> = {};
    logs.forEach(log => {
      const key = getLogDateKeyLocal(log.date);
      if (key) {
        if (!logsMap[key]) logsMap[key] = [];
        logsMap[key].push(log);
      }
    });

    // Get current PHT time components for checking "today" limits
    const nowPht = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false
    });
    const parts = formatter.formatToParts(nowPht);
    const phtHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
    const phtMinute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
    const currentPhtTimeStr = `${phtHour.toString().padStart(2, '0')}:${phtMinute.toString().padStart(2, '0')}`;

    const addMinutesToTimeStr = (timeStr: string, mins: number) => {
      try {
        const [h, m] = timeStr.split(':').map(Number);
        const totalMins = h * 60 + m + mins;
        const newH = Math.floor(totalMins / 60) % 24;
        const newM = totalMins % 60;
        return `${newH.toString().padStart(2, '0')}:${newM.toString().padStart(2, '0')}`;
      } catch {
        return timeStr;
      }
    };

    // 2. Loop through the last 7 calendar days (including today)
    const today = new Date();
    const missedDatesToRecover: Array<{ date: string; mode: 'login' | 'logout' }> = [];

    for (let i = 0; i <= 7; i++) {
      const pastDate = new Date();
      pastDate.setDate(today.getDate() - i);
      
      // Get PHT date and day components to be timezone robust
      const phtDateParts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).formatToParts(pastDate);
      const yearStr = phtDateParts.find(p => p.type === 'year')?.value || '';
      const monthStr = phtDateParts.find(p => p.type === 'month')?.value || '';
      const dayStr = phtDateParts.find(p => p.type === 'day')?.value || '';
      const dateKey = `${yearStr}-${monthStr}-${dayStr}`;

      const weekdayStr = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Manila',
        weekday: 'long'
      }).format(pastDate);

      // Enforce Cut-off Boundary (1st Cut-off: 1-15, 2nd Cut-off: 16-31 of the current month)
      const todayDay = today.getDate();
      const pastDay = parseInt(dayStr, 10);
      const isTodayInFirstCutoff = todayDay <= 15;
      
      // Verify same month/year in PHT
      const todayPhtParts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit'
      }).formatToParts(today);
      const todayYear = todayPhtParts.find(p => p.type === 'year')?.value || '';
      const todayMonth = todayPhtParts.find(p => p.type === 'month')?.value || '';
      
      const isSameMonth = yearStr === todayYear && monthStr === todayMonth;
      
      if (!isSameMonth) {
        continue; // Skip dates in a different month (belongs to a closed past cut-off)
      }
      
      if (isTodayInFirstCutoff) {
        if (pastDay < 1 || pastDay > 15) {
          continue; // Skip if pastDate belongs to the 2nd cut-off
        }
      } else {
        if (pastDay < 16) {
          continue; // Skip if pastDate belongs to the 1st cut-off
        }
      }
      
      if (weekdayStr === 'Saturday' || weekdayStr === 'Sunday') continue; // Skip weekends

      // Check if there is a company event on this past date and if the user is excluded from it
      const matchedEvent = companyEvents.find(e => e.date === dateKey);
      const isCurrentUserExcluded = matchedEvent && matchedEvent.excluded_users && matchedEvent.excluded_users.includes(profile.id);
      if (matchedEvent && isCurrentUserExcluded) {
        console.log(`[Auto-Recovery] Skipping missed date recovery for ${dateKey} because user is excluded from company event: ${matchedEvent.title}`);
        continue;
      }

      const dayEntries = logsMap[dateKey] || [];
      const hasTimeIn = dayEntries.some(log => log.mode.toLowerCase().includes('in'));
      const hasTimeOut = dayEntries.some(log => log.mode.toLowerCase().includes('out'));

      // Check for WFH schedule offset / override for this specific date
      const offsets = profile.wfh_offsets || {};
      const offsetOverride = offsets[dateKey];
      
      let isWfhDayForPastDate = false;
      const resolvedStatus = offsetOverride 
        ? (typeof offsetOverride === 'object' ? offsetOverride.status : offsetOverride)
        : null;

      if (resolvedStatus === 'wfh') {
        isWfhDayForPastDate = true;
      } else if (resolvedStatus === 'office') {
        isWfhDayForPastDate = false;
      } else {
        const wfhDaysList = activeWfhDays || profile.wfh_days;
        isWfhDayForPastDate = wfhDaysList && wfhDaysList.includes(weekdayStr);
      }

      let shouldRecoverLogin = false;
      if (!hasTimeIn && isWfhDayForPastDate && !attemptedRecoveriesRef.current.has(`${dateKey}-login`)) {
        if (i === 0) {
          // Today: check if current time is past configured login time + 15 mins
          const configLoginTime = profile.login_time || '08:00';
          const triggerTimeLimit = addMinutesToTimeStr(configLoginTime, 15);
          if (currentPhtTimeStr > triggerTimeLimit) {
            shouldRecoverLogin = true;
          }
        } else {
          shouldRecoverLogin = true;
        }
      }

      let shouldRecoverLogout = false;
      if (hasTimeIn && !hasTimeOut && !attemptedRecoveriesRef.current.has(`${dateKey}-logout`)) {
        if (i === 0) {
          // Today: check if current time is past configured logout time + 15 mins
          const configLogoutTime = profile.logout_time || '17:00';
          const triggerTimeLimit = addMinutesToTimeStr(configLogoutTime, 15);
          if (currentPhtTimeStr > triggerTimeLimit) {
            shouldRecoverLogout = true;
          }
        } else {
          shouldRecoverLogout = true;
        }
      }

      if (shouldRecoverLogout) {
        // Found a missed timeout! Add to queue and mark as attempted to prevent recursion loops
        attemptedRecoveriesRef.current.add(`${dateKey}-logout`);
        missedDatesToRecover.push({ date: dateKey, mode: 'logout' });
      } else if (shouldRecoverLogin) {
        // Found a missed workday completely (both in and out are missing), and WFH was scheduled!
        // Start by recovering the login first!
        attemptedRecoveriesRef.current.add(`${dateKey}-login`);
        missedDatesToRecover.push({ date: dateKey, mode: 'login' });
      }
    }

    if (missedDatesToRecover.length > 0) {
      const target = missedDatesToRecover[0]; // Recover the most recent one first
      const targetDate = target.date;
      const targetMode = target.mode;
      const modeLabel = targetMode === 'login' ? 'Time In' : 'Time Out';
      const apiMode = targetMode === 'login' ? 'login' : 'logout';
      
      console.log(`[Auto-Recovery] Triggering ${modeLabel} auto-recovery for missed workday: ${targetDate}`);
      setRecoveryStatus({ date: targetDate, modeLabel, state: 'running' });
      addToast(`${modeLabel} Recovery Active`, `Detected missing ${modeLabel} for workday ${targetDate}. Running self-healing auto-recovery...`, targetDate, 'info');
      
      try {
        const res = await fetch(`/api/cron/run-timelog?mode=${apiMode}&date=${targetDate}`);
        if (res.ok) {
          const data = await res.json();
          setRecoveryStatus({ date: targetDate, modeLabel, state: 'success' });
          addToast(`${modeLabel} Recovered`, `Successfully recovered missed ${modeLabel} for workday ${targetDate}!`, targetDate, 'success');
          console.log(`[Auto-Recovery] ${modeLabel} recovered successfully:`, data);
          // Re-sync logs from portal to instantly reflect the new entry on dashboard
          handleSyncPortalLogs();
        } else {
          setRecoveryStatus({ date: targetDate, modeLabel, state: 'failed' });
          addToast(`${modeLabel} Recovery Failed`, `Failed to auto-recover missed ${modeLabel} for workday ${targetDate}.`, targetDate, 'failed');
          console.error(`[Auto-Recovery] Failed to recover missed ${modeLabel}.`);
        }
      } catch (err) {
        setRecoveryStatus({ date: targetDate, modeLabel, state: 'failed' });
        addToast(`${modeLabel} Recovery Failed`, `Failed to auto-recover missed ${modeLabel} for workday ${targetDate}.`, targetDate, 'failed');
        console.error(`[Auto-Recovery] Error during auto-recovery execution:`, err);
      } finally {
        setTimeout(() => setRecoveryStatus(null), 5000);
      }
    }
  };

  const handleSyncPortalLogs = async (currentWfhDays?: string[], isAutomationEnabled?: boolean, attempt = 1) => {
    setLoadingPortalLogs(true);
    setSyncError(attempt > 1 ? `Retrying portal sync (Attempt ${attempt}/3)...` : '');
    
    try {
      const response = await fetch('/api/portal-logs');
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.logs) {
          setPortalLogs(data.logs);
          setSyncError('');
          
          if (attempt > 1) {
            addToast('Sync Succeeded', `Successfully connected and synced logs after ${attempt} attempts!`, 'sync', 'success');
          }
          
          // Fetch timelog history to check for background automation successes!
          let activeUserId = profile.id;
          if (!activeUserId) {
            const { data: { session } } = await supabase.auth.getSession();
            activeUserId = session?.user?.id || '';
          }
          
          if (activeUserId) {
            try {
              const { data: dbHistory } = await supabase
                .from('timelog_history')
                .select('*')
                .eq('user_id', activeUserId);
                
              if (dbHistory && dbHistory.length > 0) {
                const storageKey = `notified-automations-${activeUserId}`;
                const notifiedStr = localStorage.getItem(storageKey);
                let notifiedList: string[] = [];
                let isFirstTime = false;
                
                if (notifiedStr === null) {
                  isFirstTime = true;
                } else {
                  try {
                    notifiedList = JSON.parse(notifiedStr);
                  } catch (e) {
                    notifiedList = [];
                  }
                }
                
                let updated = false;
                
                dbHistory.forEach((hist: any) => {
                  const histKey = `${hist.date}-${hist.mode}`; // e.g. "2026-06-01-login"
                  if (isFirstTime) {
                    notifiedList.push(histKey);
                    updated = true;
                  } else if (!notifiedList.includes(histKey)) {
                    // This was successfully automated and we haven't notified the user yet!
                    const modeLabel = hist.mode === 'login' ? 'Time In' : 'Time Out';
                    addToast(`${modeLabel} Automated`, `Successfully automated missed ${modeLabel} for workday ${hist.date}!`, hist.date, 'success');
                    notifiedList.push(histKey);
                    updated = true;
                  }
                });
                
                if (updated) {
                  localStorage.setItem(storageKey, JSON.stringify(notifiedList));
                }
              }
            } catch (histErr) {
              console.error('Failed to check background automation history:', histErr);
            }
          }
          
          // Auto-focus calendar on the most recent log's month!
          if (data.logs.length > 0) {
            try {
              const mostRecentLog = data.logs[0];
              const cleanedDate = mostRecentLog.date.trim();
              const [m, d, y] = cleanedDate.split('/');
              const logYear = parseInt(y.trim().length === 2 ? `20${y.trim()}` : y.trim(), 10);
              const logMonth = parseInt(m.trim(), 10) - 1;
              
              const currentDateObj = new Date();
              const currentYear = currentDateObj.getFullYear();
              const currentMonth = currentDateObj.getMonth();
              
              const monthDiff = (logYear - currentYear) * 12 + (logMonth - currentMonth);
              setCalendarMonthOffset(monthDiff);
              console.log(`Auto-focused calendar to month offset: ${monthDiff} (for log date: ${cleanedDate})`);
            } catch (focusErr) {
              console.error('Failed to auto-focus calendar month:', focusErr);
            }
          }

          // Trigger missed log auto-recovery!
          const activeWfhDays = currentWfhDays || profile.wfh_days;
          const automationEnabled = isAutomationEnabled !== undefined ? isAutomationEnabled : profile.is_automation_enabled;
          checkAndRecoverMissedTimeouts(data.logs, activeWfhDays, automationEnabled);
          setLoadingPortalLogs(false);
          return;
        } else {
          throw new Error(data.error || 'Failed to sync portal logs.');
        }
      } else {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to sync portal logs.');
      }
    } catch (err: any) {
      console.error(`Sync attempt ${attempt} failed:`, err.message);
      
      if (attempt < 3) {
        setSyncError(`Sync attempt ${attempt} failed. Retrying (Attempt ${attempt + 1}/3)...`);
        addToast('Sync Retry Active', `Connection failed. Retrying portal sync (Attempt ${attempt + 1}/3)...`, 'sync', 'info');
        
        // Wait 4 seconds before next attempt
        await new Promise(resolve => setTimeout(resolve, 4000));
        await handleSyncPortalLogs(currentWfhDays, isAutomationEnabled, attempt + 1);
      } else {
        setSyncError(err.message || 'Failed to sync portal logs after 3 attempts.');
        addToast('Sync Failed', `Connection failed after 3 attempts: ${err.message || 'Portal unreachable'}`, 'sync', 'failed');
        setLoadingPortalLogs(false);
      }
    }
  };

  const handleDeletePortalLog = async (docNo: string) => {
    if (!confirm('Are you sure you want to delete this timelog record from the portal?')) {
      return;
    }
    setDeletingDocNo(docNo);
    addToast('Deletion Initiated', `Manual deletion sequence started for Log #${docNo}...`, 'delete', 'info');
    try {
      const res = await fetch(`/api/portal-logs?docNo=${docNo}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        addToast('Deletion Successful', `Timelog record #${docNo} has been deleted successfully!`, 'delete', 'success');
        // Refresh portal logs
        handleSyncPortalLogs();
      } else {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to delete record.');
      }
    } catch (err: any) {
      addToast('Deletion Failed', `Failed to delete record: ${err.message}`, 'delete', 'failed');
    } finally {
      setDeletingDocNo(null);
    }
  };

  useEffect(() => {
    const initDashboard = async () => {
      // Check user session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }
      
      setUserEmail(session.user.email || '');

      let isAdminUser = false;
      // Fetch profile settings
      try {
        const response = await fetch('/api/profile');
        if (response.ok) {
          const data = await response.json();
          isAdminUser = data.role === 'admin';
          
          const cleanLoginTime = data.login_time ? data.login_time.substring(0, 5) : '08:00';
          const cleanLogoutTime = data.logout_time ? data.logout_time.substring(0, 5) : '17:00';

          const passwordPresent = !!data.company_password;
          setHasPasswordStored(passwordPresent);
          setIsLocked(passwordPresent);

          setProfile({
            id: data.id || '',
            employee_id: data.employee_id || '',
            company_password: passwordPresent ? '__PRESERVED_PASSWORD__' : '',
            wfh_days: data.wfh_days || [],
            login_time: cleanLoginTime,
            logout_time: cleanLogoutTime,
            is_automation_enabled: data.is_automation_enabled !== undefined ? data.is_automation_enabled : true,
            wfh_reason: data.wfh_reason || 'Work from home',
            role: data.role || 'user',
            wfh_offsets: data.wfh_offsets || {}
          });

          if (passwordPresent) {
            handleSyncPortalLogs(data.wfh_days || [], data.is_automation_enabled !== undefined ? data.is_automation_enabled : true);
          }
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

      // Fetch company events
      try {
        const response = await fetch('/api/company-events');
        if (response.ok) {
          const data = await response.json();
          setCompanyEvents(data || []);
        }
      } catch (error) {
        console.error('Failed to load company events:', error);
      } finally {
        setLoadingEvents(false);
      }

      // Fetch registered employee list if the logged in user is an admin
      if (isAdminUser) {
        setLoadingEmployees(true);
        try {
          const empRes = await fetch('/api/profiles');
          if (empRes.ok) {
            const empData = await empRes.json();
            setAllEmployees(empData || []);
          }
        } catch (error) {
          console.error('Failed to load registered profiles:', error);
        } finally {
          setLoadingEmployees(false);
        }
        
        // Fetch Admin Statistics
        try {
          const statsRes = await fetch('/api/admin/stats');
          if (statsRes.ok) {
            const statsData = await statsRes.json();
            setAdminStats(statsData);
          }
        } catch (statsErr) {
          console.error('Failed to load admin stats:', statsErr);
        }
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



  const handleToggleExcludeUser = (userId: string) => {
    setExcludedUsers(prev => 
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingEvent(true);
    setEventMessage({ text: '', type: '' });

    if (!newEvent.title || !newEvent.date) {
      setEventMessage({ text: 'Title and Date are required.', type: 'error' });
      setIsSubmittingEvent(false);
      return;
    }

    try {
      const response = await fetch('/api/company-events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...newEvent,
          excluded_users: excludedUsers
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setEventMessage({ text: 'Company event scheduled successfully!', type: 'success' });
        setNewEvent({
          title: '',
          date: '',
          login_time: '08:00',
          logout_time: '12:00'
        });
        
        // Refresh events list
        const getRes = await fetch('/api/company-events');
        if (getRes.ok) {
          const freshEvents = await getRes.json();
          setCompanyEvents(freshEvents || []);
        }
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create event.');
      }
    } catch (err: any) {
      setEventMessage({ text: err.message || 'Failed to save event.', type: 'error' });
    } finally {
      setIsSubmittingEvent(false);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!confirm('Are you sure you want to delete this company event?')) return;
    
    try {
      const response = await fetch(`/api/company-events?id=${eventId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setCompanyEvents(prev => prev.filter(ev => ev.id !== eventId));
      } else {
        const errorData = await response.json();
        alert(errorData.error || 'Failed to delete event.');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete event.');
    }
  };

  const handleManualTrigger = async (mode: 'login' | 'logout') => {
    const modeText = mode === 'login' ? 'Log In' : 'Log Out';
    setTriggeringManualLog(mode);
    setMessage({ text: '', type: '' });
    
    // Set triggering source and start terminal
    setConsoleTriggerSource('user');
    
    let customDateQuery = '';
    let displayDate = new Date().toLocaleDateString();
    
    if (manualDate) {
      const parsedDate = new Date(manualDate);
      const dayOfWeek = parsedDate.toLocaleDateString('en-US', { weekday: 'long' });
      customDateQuery = `&date=${manualDate}&day=${dayOfWeek}`;
      displayDate = parsedDate.toLocaleDateString();
    }
    
    addToast(`Manual ${modeText} Triggered`, `Manually triggering time ${mode === 'login' ? 'In' : 'Out'} for ${displayDate}...`, displayDate, 'info');
    
    setActiveConsoleLogs([{ 
      status: 'info', 
      message: `Initializing manual ${mode} override sequence on date: ${displayDate}...` 
    }]);
    setShowConsole(true);
    
    try {
      let url = `/api/cron/run-timelog?mode=${mode}&test=true&stream=true${customDateQuery}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP network error! Status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response stream reader is not supported by your browser.');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        // Parse event stream packets separated by double-newlines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Hold partial line in buffer

        for (const line of lines) {
          const cleanLine = line.trim();
          if (cleanLine.startsWith('data: ')) {
            try {
              const rawData = cleanLine.substring(6);
              const logData = JSON.parse(rawData);
              
              if (logData.status === 'final') {
                const finalData = logData.data;
                const myResult = finalData.results && finalData.results.length > 0 ? finalData.results[0] : null;
                
                if (myResult && myResult.status === 'success') {
                  setMessage({ text: `Successfully triggered ${mode === 'login' ? 'Log In' : 'Log Out'}!`, type: 'success' });
                  addToast(`Manual ${modeText} Succeeded`, `Successfully manually timed ${mode === 'login' ? 'In' : 'Out'} for ${displayDate}!`, displayDate, 'success');
                  setActiveConsoleLogs(prev => [...prev, { status: 'success', message: `Manual trigger finished successfully. Mode: ${modeText}` }]);
                  handleSyncPortalLogs();
                } else if (myResult && myResult.status === 'skipped') {
                  setMessage({ text: myResult.message || `Skipped manual ${mode}.`, type: 'success' });
                  addToast(`Manual ${modeText} Skipped`, myResult.message || `Skipped manual time ${mode === 'login' ? 'In' : 'Out'}.`, displayDate, 'info');
                  setActiveConsoleLogs(prev => [...prev, { status: 'warn', message: myResult.message || `Manual run skipped.` }]);
                  handleSyncPortalLogs();
                } else {
                  const errorMsg = myResult?.message || finalData.error || 'Unknown error';
                  setMessage({ text: `Failed to trigger ${mode}: ${errorMsg}`, type: 'error' });
                  addToast(`Manual ${modeText} Failed`, `Failed manual time ${mode === 'login' ? 'In' : 'Out'}: ${errorMsg}`, displayDate, 'failed');
                  setActiveConsoleLogs(prev => [...prev, { status: 'error', message: `Execution failed: ${errorMsg}` }]);
                }
              } else {
                setActiveConsoleLogs(prev => [...prev, { status: logData.status, message: logData.message }]);
              }
            } catch (jsonErr) {
              console.error('Failed to parse SSE line:', cleanLine, jsonErr);
            }
          }
        }
      }
    } catch (err: any) {
      setMessage({ text: `Execution error: ${err.message}`, type: 'error' });
      addToast(`Execution Error`, `Execution error: ${err.message}`, displayDate, 'failed');
      setActiveConsoleLogs(prev => [...prev, { status: 'error', message: `Fatal execution error: ${err.message}` }]);
    } finally {
      setTriggeringManualLog(null);
      setTimeout(() => { setMessage({ text: '', type: '' }); }, 12000);
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
      
      {/* Premium Toast Notification Center */}
      <div style={{
        position: 'fixed',
        top: '24px',
        right: '24px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        maxWidth: '380px',
        width: '100%',
        pointerEvents: 'none'
      }}>
        {toasts.map((toast) => {
          let bg = 'rgba(255, 255, 255, 0.9)';
          let border = 'rgba(226, 232, 240, 0.8)';
          let color = 'var(--brand-navy)';
          let progressColor = 'var(--accent-blue)';
          
          if (toast.type === 'success') {
            bg = 'rgba(240, 253, 244, 0.95)';
            border = 'rgba(187, 247, 208, 0.8)';
            color = '#15803d';
            progressColor = '#22c55e';
          } else if (toast.type === 'failed') {
            bg = 'rgba(254, 242, 242, 0.95)';
            border = 'rgba(252, 165, 165, 0.8)';
            color = '#b91c1c';
            progressColor = '#ef4444';
          } else if (toast.type === 'info') {
            bg = 'rgba(239, 246, 255, 0.95)';
            border = 'rgba(191, 219, 254, 0.8)';
            color = '#1d4ed8';
            progressColor = '#3b82f6';
          }

          return (
            <div
              key={toast.id}
              style={{
                pointerEvents: 'auto',
                padding: '1rem 1.25rem',
                borderRadius: '16px',
                backgroundColor: bg,
                border: '1px solid',
                borderColor: border,
                color: color,
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.08)',
                backdropFilter: 'blur(12px)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                animation: 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                position: 'relative',
                overflow: 'hidden'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.5)', flexShrink: 0, marginTop: '2px' }}>
                {toast.type === 'success' ? (
                  <Check style={{ width: '12px', height: '12px', strokeWidth: 3 }} />
                ) : toast.type === 'failed' ? (
                  <AlertCircle style={{ width: '12px', height: '12px', strokeWidth: 3 }} />
                ) : (
                  <Clock style={{ width: '12px', height: '12px', strokeWidth: 3 }} />
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 750 }}>
                  {toast.title}
                </span>
                <span style={{ fontSize: '0.75rem', lineHeight: '1.4', opacity: 0.9, fontWeight: 500 }}>
                  {toast.message}
                </span>
              </div>
              
              <button
                onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'currentColor',
                  opacity: 0.6,
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  padding: 0,
                  marginLeft: 'auto',
                  flexShrink: 0,
                  fontWeight: 800,
                  lineHeight: 1
                }}
              >
                ×
              </button>

              <div style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                height: '3px',
                width: '100%',
                backgroundColor: progressColor,
                animation: 'shrinkProgress 6s linear forwards'
              }} />
            </div>
          );
        })}
      </div>
      
      {/* Main Grid Content */}
      <main style={{
        flex: 1,
        padding: '0.5rem 2rem 2.5rem 2rem',
        maxWidth: '1280px',
        width: '100%',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '2.25rem'
      }}>
        
        {/* Company Events Notifications Banners */}
        {(() => {
          // Format date as local date string in YYYY-MM-DD format
          const now = new Date();
          const offset = now.getTimezoneOffset();
          const localToday = new Date(now.getTime() - (offset * 60 * 1000));
          const todayStr = localToday.toISOString().split('T')[0];

          const tomorrowObj = new Date(now.getTime() + (24 * 60 * 60 * 1000) - (offset * 60 * 1000));
          const tomorrowStr = tomorrowObj.toISOString().split('T')[0];

          const todayEvent = companyEvents.find(e => e.date === todayStr);
          const tomorrowEvent = companyEvents.find(e => e.date === tomorrowStr);

          const isCurrentUserExcluded = todayEvent && todayEvent.excluded_users && todayEvent.excluded_users.includes(profile.id);
          const isCurrentUserExcludedTomorrow = tomorrowEvent && tomorrowEvent.excluded_users && tomorrowEvent.excluded_users.includes(profile.id);

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {todayEvent && (
                <div style={{
                  padding: '1.25rem 1.5rem',
                  borderRadius: '20px',
                  background: isCurrentUserExcluded 
                    ? 'linear-gradient(135deg, rgba(71, 85, 105, 0.08) 0%, rgba(71, 85, 105, 0.04) 100%)' 
                    : 'linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(220, 38, 38, 0.04) 100%)',
                  border: isCurrentUserExcluded 
                    ? '1px solid rgba(71, 85, 105, 0.25)' 
                    : '1px solid rgba(239, 68, 68, 0.25)',
                  boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.02)',
                  backdropFilter: 'blur(10px)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem'
                }}>
                  <div style={{
                    backgroundColor: isCurrentUserExcluded ? 'rgba(71, 85, 105, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    borderRadius: '12px',
                    padding: '0.6rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: isCurrentUserExcluded ? '#475569' : '#dc2626'
                  }}>
                    <Megaphone style={{ width: '20px', height: '20px' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <h4 style={{ fontSize: '0.9rem', fontWeight: 750, color: isCurrentUserExcluded ? '#334155' : '#b91c1c', margin: '0 0 2px 0', fontFamily: 'var(--font-title)' }}>
                      Global Company Event Today!
                    </h4>
                    {isCurrentUserExcluded ? (
                      <p style={{ fontSize: '0.8rem', color: '#475569', margin: 0, fontWeight: 550, lineHeight: '1.4' }}>
                        Today is <strong>{todayEvent.title}</strong>. Note: You are <strong>excluded</strong> from this event hours override, so your automated timelog will run using your standard schedule: <strong>{profile.login_time}</strong> to <strong>{profile.logout_time}</strong>.
                      </p>
                    ) : (
                      <p style={{ fontSize: '0.8rem', color: '#7f1d1d', margin: 0, fontWeight: 550, lineHeight: '1.4' }}>
                        Today is <strong>{todayEvent.title}</strong>. Your automated timelog has been adjusted globally to log in at <strong>{todayEvent.login_time.substring(0, 5)}</strong> and log out at <strong>{todayEvent.logout_time.substring(0, 5)}</strong>.
                      </p>
                    )}
                  </div>
                </div>
              )}
              {tomorrowEvent && !todayEvent && (
                <div style={{
                  padding: '1.25rem 1.5rem',
                  borderRadius: '20px',
                  background: isCurrentUserExcludedTomorrow
                    ? 'linear-gradient(135deg, rgba(71, 85, 105, 0.08) 0%, rgba(71, 85, 105, 0.04) 100%)'
                    : 'linear-gradient(135deg, rgba(41, 116, 166, 0.08) 0%, rgba(30, 80, 115, 0.04) 100%)',
                  border: isCurrentUserExcludedTomorrow
                    ? '1px solid rgba(71, 85, 105, 0.25)'
                    : '1px solid rgba(41, 116, 166, 0.25)',
                  boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.02)',
                  backdropFilter: 'blur(10px)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem'
                }}>
                  <div style={{
                    backgroundColor: isCurrentUserExcludedTomorrow ? 'rgba(71, 85, 105, 0.1)' : 'rgba(41, 116, 166, 0.1)',
                    borderRadius: '12px',
                    padding: '0.6rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: isCurrentUserExcludedTomorrow ? '#475569' : 'var(--accent-blue)'
                  }}>
                    <Calendar style={{ width: '20px', height: '20px' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <h4 style={{ fontSize: '0.9rem', fontWeight: 750, color: isCurrentUserExcludedTomorrow ? '#334155' : 'var(--brand-navy)', margin: '0 0 2px 0', fontFamily: 'var(--font-title)' }}>
                      Upcoming Company Event Tomorrow
                    </h4>
                    {isCurrentUserExcludedTomorrow ? (
                      <p style={{ fontSize: '0.8rem', color: '#475569', margin: 0, fontWeight: 550, lineHeight: '1.4' }}>
                        Tomorrow is <strong>{tomorrowEvent.title}</strong>. Note: You are <strong>excluded</strong> from this event hours override. Your automated timelog will run using your standard configured hours: <strong>{profile.login_time}</strong> to <strong>{profile.logout_time}</strong>.
                      </p>
                    ) : (
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-primary)', margin: 0, fontWeight: 550, lineHeight: '1.4' }}>
                        Tomorrow is <strong>{tomorrowEvent.title}</strong>. Automated timelog schedules will automatically run using overridden hours: log in at <strong>{tomorrowEvent.login_time.substring(0, 5)}</strong> and log out at <strong>{tomorrowEvent.logout_time.substring(0, 5)}</strong>.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
        
        {/* Seamless Header Row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: '0.5rem',
          borderBottom: '1px solid rgba(226, 232, 240, 0.5)'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <Logo showClock={false} showText={true} textColor="var(--brand-navy)" />
            <span 
              onClick={triggerBats}
              style={{
                fontSize: '9px',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.15em',
                color: 'var(--accent-blue)',
                marginTop: '-0.1rem',
                cursor: 'pointer',
                userSelect: 'none',
                transition: 'color 0.2s ease-in-out'
              }}
              className="bruce-wayne-easter"
            >
              by Bruce Wayne
            </span>
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
        
        {/* Main Controls Container */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2.25rem' }}>

          {/* Admin Area Container */}
          {profile.role === 'admin' && (
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '1.5rem', 
              background: 'linear-gradient(to bottom, rgba(17, 51, 85, 0.03), rgba(17, 51, 85, 0.01))', 
              padding: '2rem', 
              borderRadius: '32px', 
              border: '1px solid rgba(17, 51, 85, 0.08)' 
            }}>
              
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '0.25rem', paddingLeft: '0.5rem', paddingRight: '0.5rem', width: '100%', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <ShieldCheck style={{ width: '22px', height: '22px', color: 'var(--brand-navy)' }} />
                  <h2 style={{ fontSize: '1.3rem', fontWeight: 800, fontFamily: 'var(--font-title)', color: 'var(--brand-navy)', margin: 0 }}>
                    Admin Workspace
                  </h2>
                  <button
                    type="button"
                    onClick={() => setIsAdminWorkspaceExpanded(!isAdminWorkspaceExpanded)}
                    className="btn-ui-secondary"
                    style={{
                      padding: '0.45rem 1rem',
                      fontSize: '0.75rem',
                      borderRadius: '999px',
                      width: 'auto',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: 'rgba(17, 51, 85, 0.05)',
                      border: 'none',
                      color: 'var(--brand-navy)',
                      cursor: 'pointer'
                    }}
                  >
                    {isAdminWorkspaceExpanded ? 'Collapse' : 'Expand'} Workspace
                  </button>
                </div>
                
                {/* Dashboard Statistics */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                    <span style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Logins Today</span>
                    <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#16a34a' }}>{adminStats.todayLogins}</span>
                  </div>
                  <div style={{ width: '1px', height: '24px', background: '#cbd5e1' }}></div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                    <span style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Automated Users</span>
                    <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--brand-navy)' }}>{adminStats.activeAutomatedUsers}</span>
                  </div>
                </div>
              </div>

              {isAdminWorkspaceExpanded && (
                <>

              <div className="ui-card" style={{
                maxWidth: '100%',
                padding: '1.25rem 1.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{
                    backgroundColor: 'rgba(30, 80, 115, 0.1)',
                    borderRadius: '12px',
                    padding: '0.6rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--brand-navy)'
                  }}>
                    <Terminal style={{ width: '20px', height: '20px' }} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-title)', color: 'var(--brand-navy)', margin: '0 0 0.15rem 0' }}>
                      System Logs
                    </h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>View all automated timelog execution history and user activities.</p>
                  </div>
                </div>
                <button 
                  onClick={(e) => { e.preventDefault(); router.push('/admin/logs'); }} 
                  className="btn-ui-primary" 
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1.25rem', fontSize: '0.85rem', borderRadius: '999px', fontWeight: 600, border: 'none', cursor: 'pointer' }}
                >
                  View Logs
                </button>
              </div>



              {/* Company Events panel inside Admin Workspace */}
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
                  Company Events
                </h3>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '2.25rem',
                marginTop: '0.5rem'
              }}>
                {/* Left Column: Form to create event */}
                <form onSubmit={handleCreateEvent} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--brand-navy)', margin: 0 }}>
                    Schedule New Event
                  </h4>
                  
                  {/* Event Title */}
                  <div>
                    <label className="glass-label" htmlFor="event-title-input">Event Name</label>
                    <div className="ui-input-wrapper" style={{ marginBottom: 0, marginTop: '0.4rem' }}>
                      <input
                        id="event-title-input"
                        type="text"
                        placeholder="e.g. Half-day Company Event"
                        value={newEvent.title}
                        onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                        className="ui-input"
                        style={{ paddingLeft: '1rem' }}
                        required
                      />
                    </div>
                  </div>

                  {/* Event Date */}
                  <div>
                    <label className="glass-label" htmlFor="event-date-input">Event Date</label>
                    <div className="ui-input-wrapper" style={{ marginBottom: 0, marginTop: '0.4rem' }}>
                      <input
                        id="event-date-input"
                        type="date"
                        value={newEvent.date}
                        onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })}
                        className="ui-input"
                        style={{ paddingLeft: '1rem' }}
                        required
                      />
                    </div>
                  </div>

                  {/* Adjusted hours */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label className="glass-label" htmlFor="event-login-input">Event Log In</label>
                      <div className="ui-input-wrapper" style={{ marginBottom: 0, marginTop: '0.4rem' }}>
                        <input
                          id="event-login-input"
                          type="time"
                          value={newEvent.login_time}
                          onChange={(e) => setNewEvent({ ...newEvent, login_time: e.target.value })}
                          className="ui-input"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="glass-label" htmlFor="event-logout-input">Event Log Out</label>
                      <div className="ui-input-wrapper" style={{ marginBottom: 0, marginTop: '0.4rem' }}>
                        <input
                          id="event-logout-input"
                          type="time"
                          value={newEvent.logout_time}
                          onChange={(e) => setNewEvent({ ...newEvent, logout_time: e.target.value })}
                          className="ui-input"
                          required
                        />
                      </div>
                    </div>
                  </div>

                  {/* Excluded Employees Checkbox Selection */}
                  <div>
                    <label className="glass-label">Excluded Employees (Attending normal hours)</label>
                    {loadingEmployees ? (
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>Loading employees...</p>
                    ) : allEmployees.length === 0 ? (
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>No other employees found.</p>
                    ) : (
                      <div style={{
                        marginTop: '0.5rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem',
                        maxHeight: '120px',
                        overflowY: 'auto',
                        border: '1px solid var(--input-border)',
                        borderRadius: '12px',
                        padding: '0.6rem 0.8rem',
                        background: '#ffffff'
                      }}>
                        {allEmployees.map((emp) => {
                          const isExcluded = excludedUsers.includes(emp.id);
                          return (
                            <label
                              key={emp.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                fontSize: '0.75rem',
                                color: 'var(--text-primary)',
                                cursor: 'pointer',
                                userSelect: 'none',
                                marginBottom: 0
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isExcluded}
                                onChange={() => handleToggleExcludeUser(emp.id)}
                                style={{
                                  cursor: 'pointer',
                                  accentColor: 'var(--brand-navy)'
                                }}
                              />
                              <span style={{ textDecoration: isExcluded ? 'line-through' : 'none', color: isExcluded ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                                {emp.email}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {eventMessage.text && (
                    <div style={{
                      background: eventMessage.type === 'success' ? '#f0fdf4' : '#fef2f2',
                      border: `1px solid ${eventMessage.type === 'success' ? '#dcfce7' : '#fee2e2'}`,
                      color: eventMessage.type === 'success' ? '#166534' : '#991b1b',
                      padding: '0.65rem 1rem',
                      borderRadius: '12px',
                      fontSize: '0.8rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem'
                    }}>
                      <span>{eventMessage.type === 'success' ? '✓' : '⚠'}</span>
                      {eventMessage.text}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmittingEvent}
                    className="btn-ui-primary"
                    style={{
                      padding: '0.65rem 1.25rem',
                      fontSize: '0.85rem',
                      borderRadius: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      marginTop: '0.5rem',
                      width: '100%',
                      fontWeight: 600
                    }}
                  >
                    {isSubmittingEvent ? (
                      <>
                        <Loader2 className="animate-spin" style={{ width: '16px', height: '16px', animation: 'spin 1.5s linear infinite' }} />
                        Scheduling...
                      </>
                    ) : (
                      <>
                        <Plus style={{ width: '16px', height: '16px' }} />
                        Schedule Event
                      </>
                    )}
                  </button>
                </form>

                {/* Right Column: List of configured events */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--brand-navy)', margin: 0 }}>
                    Configured Company Events
                  </h4>

                  {loadingEvents ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      Loading events...
                    </div>
                  ) : companyEvents.length === 0 ? (
                    <div style={{
                      padding: '2rem 1.5rem',
                      border: '1px dashed #e2e8f0',
                      borderRadius: '16px',
                      textAlign: 'center',
                      color: 'var(--text-muted)',
                      fontSize: '0.8rem',
                      background: '#fafafa',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}>
                      <Calendar style={{ width: '24px', height: '24px', color: 'var(--text-muted)' }} />
                      <span>No company events are scheduled.</span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '320px', overflowY: 'auto', paddingRight: '4px' }}>
                      {companyEvents.map((event) => {
                        const evDate = new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', weekday: 'short' });
                        return (
                          <div key={event.id} style={{
                            padding: '0.8rem 1rem',
                            borderRadius: '16px',
                            background: '#ffffff',
                            border: '1px solid #f1f5f9',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '1rem'
                          }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              <span style={{ fontSize: '0.8rem', fontWeight: 750, color: 'var(--brand-navy)' }}>
                                {event.title}
                              </span>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                                {evDate}
                              </span>
                              <span style={{ fontSize: '0.7rem', color: 'var(--accent-blue)', fontWeight: 600 }}>
                                Hours: {event.login_time.substring(0, 5)} - {event.logout_time.substring(0, 5)}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteEvent(event.id)}
                              className="btn-ui-secondary"
                              style={{
                                padding: '0.4rem 0.8rem',
                                fontSize: '0.7rem',
                                borderRadius: '999px',
                                width: 'auto',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                borderColor: '#fca5a5',
                                color: '#dc2626'
                              }}
                            >
                              <Trash2 style={{ width: '12px', height: '12px' }} />
                              Delete
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
                </>
              )}
          </div>
          )}

          {/* Leaves, Holidays & Events Panel (Standly & Tap Integration) */}
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
                Leaves, Holidays and Events
              </h3>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', backgroundColor: '#f1f5f9', padding: '2px 8px', borderRadius: '12px', marginLeft: 'auto' }}>
                Synced
              </span>
            </div>

            {loadingStandly || loadingEvents ? (
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

              const activeCompanyEvents = companyEvents.filter((event: any) => {
                const eventDate = new Date(event.date);
                eventDate.setHours(0, 0, 0, 0);
                return eventDate >= today;
              });

              const totalCount = activeLeaves.length + upcomingHolidays.length + activeCompanyEvents.length;

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
                      🏖️ No active leaves, holidays, or company events this month.
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

                  {/* Company Events Column */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <h4 style={{ fontSize: '0.85rem', fontWeight: 700, fontFamily: 'var(--font-title)', color: 'var(--brand-navy)', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                      <span style={{ display: 'inline-block', width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#e11d48' }}></span>
                      Company Events
                    </h4>
                    {activeCompanyEvents.length === 0 ? (
                      <div style={{ padding: '0.75rem', border: '1px dashed #e2e8f0', borderRadius: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        No scheduled events.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {activeCompanyEvents.map((event, idx) => {
                          const evDate = new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' });
                          const isCurrentUserExcluded = event.excluded_users && event.excluded_users.includes(profile.id);

                          return (
                            <div key={event.id || idx} style={{
                              padding: '0.65rem 0.85rem',
                              borderRadius: '14px',
                              background: isCurrentUserExcluded ? 'rgba(71, 85, 105, 0.03)' : 'rgba(225, 29, 72, 0.03)',
                              border: isCurrentUserExcluded ? '1px solid rgba(71, 85, 105, 0.1)' : '1px solid rgba(225, 29, 72, 0.1)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '4px'
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                                <span style={{ fontSize: '0.8rem', fontWeight: 750, color: 'var(--brand-navy)' }}>
                                  {event.title}
                                </span>
                                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                                  {evDate}
                                </span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginTop: '2px' }}>
                                <span style={{ fontSize: '0.65rem', color: isCurrentUserExcluded ? '#64748b' : '#be123c', fontWeight: 600 }}>
                                  Hours: {event.login_time.substring(0, 5)} - {event.logout_time.substring(0, 5)}
                                </span>
                                <span style={{
                                  fontSize: '0.55rem',
                                  fontWeight: 750,
                                  color: isCurrentUserExcluded ? '#475569' : '#e11d48',
                                  backgroundColor: isCurrentUserExcluded ? 'rgba(71, 85, 105, 0.08)' : 'rgba(225, 29, 72, 0.08)',
                                  padding: '1px 5px',
                                  borderRadius: '5px',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.02em'
                                }}>
                                  {isCurrentUserExcluded ? 'Excluded' : 'Attending'}
                                </span>
                              </div>
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

          {/* 1. Header Control Panel Card */}
          <div className="ui-card" style={{
            maxWidth: '100%',
            padding: '1.25rem 1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-title)', color: 'var(--brand-navy)' }}>
                  Automation Control
                </h3>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
                {/* Custom Date Picker for Manual Trigger */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date:</span>
                  <input
                    type="date"
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    style={{
                      padding: '0.4rem 0.75rem',
                      fontSize: '0.75rem',
                      borderRadius: '999px',
                      border: '1px solid #cbd5e1',
                      color: 'var(--brand-navy)',
                      outline: 'none',
                      background: '#ffffff',
                      fontFamily: 'inherit',
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  />
                  {manualDate && (
                    <button
                      type="button"
                      onClick={() => setManualDate('')}
                      style={{
                        background: 'rgba(239, 68, 68, 0.08)',
                        border: 'none',
                        color: '#ef4444',
                        cursor: 'pointer',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        borderRadius: '999px',
                        padding: '0.2rem 0.5rem'
                      }}
                      title="Clear custom date"
                    >
                      Reset
                    </button>
                  )}
                </div>

                {/* Manual Trigger Buttons */}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => handleManualTrigger('login')}
                    disabled={triggeringManualLog !== null}
                    className="btn-ui-secondary"
                    style={{ padding: '0.45rem 1rem', fontSize: '0.8rem', borderRadius: '999px', width: 'auto', display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#f8fafc', borderColor: '#e2e8f0', color: 'var(--brand-navy)' }}
                  >
                    {triggeringManualLog === 'login' ? <Loader2 style={{ width: '14px', height: '14px', animation: 'spin 1.5s linear infinite' }} /> : <Play style={{ width: '14px', height: '14px' }} />}
                    Log In Now
                  </button>
                  <button
                    onClick={() => handleManualTrigger('logout')}
                    disabled={triggeringManualLog !== null}
                    className="btn-ui-secondary"
                    style={{ padding: '0.45rem 1rem', fontSize: '0.8rem', borderRadius: '999px', width: 'auto', display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#f8fafc', borderColor: '#e2e8f0', color: 'var(--brand-navy)' }}
                  >
                    {triggeringManualLog === 'logout' ? <Loader2 style={{ width: '14px', height: '14px', animation: 'spin 1.5s linear infinite' }} /> : <Power style={{ width: '14px', height: '14px' }} />}
                    Log Out Now
                  </button>
                </div>

                {/* Separator */}
                <div style={{ height: '24px', width: '1px', background: '#e2e8f0' }}></div>

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
            </div>
            
            {showConsole && consoleTriggerSource === 'user' && (
              <TerminalConsole logs={activeConsoleLogs} onClose={() => { setShowConsole(false); setConsoleTriggerSource(null); }} />
            )}
          </div>



          {/* Cocogen Portal Log History Panel */}
          <div className="ui-card" style={{
            maxWidth: '100%',
            padding: '2.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Calendar style={{ width: '20px', height: '20px', color: 'var(--brand-navy)' }} />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-title)', color: 'var(--brand-navy)', margin: 0 }}>
                  Cocogen Portal Log History
                </h3>
              </div>
              <button 
                type="button"
                onClick={() => handleSyncPortalLogs()}
                disabled={loadingPortalLogs || !hasPasswordStored}
                className="btn-ui-secondary"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.45rem 1rem',
                  fontSize: '0.8rem',
                  borderRadius: '999px',
                  cursor: !hasPasswordStored ? 'not-allowed' : 'pointer',
                  opacity: !hasPasswordStored ? 0.5 : 1
                }}
              >
                {loadingPortalLogs ? (
                  <Loader2 style={{ width: '14px', height: '14px', animation: 'spin 1.5s linear infinite' }} />
                ) : (
                  <RefreshCw style={{ width: '14px', height: '14px' }} />
                )}
                {loadingPortalLogs ? 'Syncing...' : 'Sync Portal'}
              </button>
            </div>

            {!hasPasswordStored ? (
              <div style={{ padding: '1rem', border: '1px dashed #e2e8f0', borderRadius: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                🔑 Please enter and save your corporate portal credentials in the settings below to synchronize your account logs.
              </div>
            ) : loadingPortalLogs ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', gap: '10px' }}>
                <Loader2 className="animate-spin" style={{ width: '24px', height: '24px', color: 'var(--accent-blue)', animation: 'spin 1.5s linear infinite' }} />
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 550, textAlign: 'center' }}>
                  Logging into timelog.cocogen.com.ph & extracting recent history...<br />
                  <span style={{ fontSize: '0.7rem', fontWeight: 400 }}>(This process takes about 10-15 seconds)</span>
                </span>
              </div>
            ) : syncError ? (
              <div style={{ padding: '0.75rem 1rem', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '12px', color: '#b91c1c', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle style={{ width: '16px', height: '16px', flexShrink: 0 }} />
                <span>{syncError}</span>
              </div>
            ) : (
              <>
                {recoveryStatus && (
                  <div style={{
                    margin: '0 0 1rem 0',
                    padding: '0.75rem 1rem',
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    backgroundColor: recoveryStatus.state === 'running' 
                      ? '#eff6ff' 
                      : recoveryStatus.state === 'success' 
                        ? '#f0fdf4' 
                        : '#fef2f2',
                    border: '1px solid',
                    borderColor: recoveryStatus.state === 'running' 
                      ? '#bfdbfe' 
                      : recoveryStatus.state === 'success' 
                        ? '#bbf7d0' 
                        : '#fca5a5',
                    color: recoveryStatus.state === 'running' 
                      ? '#1d4ed8' 
                      : recoveryStatus.state === 'success' 
                        ? '#166534' 
                        : '#991b1b',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {recoveryStatus.state === 'running' ? (
                        <Loader2 className="animate-spin" style={{ width: '14px', height: '14px', animation: 'spin 1.5s linear infinite' }} />
                      ) : recoveryStatus.state === 'success' ? (
                        <span style={{ fontSize: '1rem', fontWeight: 'bold' }}>✓</span>
                      ) : (
                        <span style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>⚠</span>
                      )}
                      <span>
                        {recoveryStatus.state === 'running' && `Auto-running missed ${recoveryStatus.modeLabel} recovery for workday ${recoveryStatus.date}...`}
                        {recoveryStatus.state === 'success' && `Successfully recovered missed ${recoveryStatus.modeLabel} for workday ${recoveryStatus.date}!`}
                        {recoveryStatus.state === 'failed' && `Failed to auto-recover missed ${recoveryStatus.modeLabel} for workday ${recoveryStatus.date}.`}
                      </span>
                    </div>
                  </div>
                )}
                {(() => {
              // Group logs by date with robust whitespace trimming and time isolation
              const getLogDateKey = (logDateStr: string) => {
                try {
                  const cleaned = logDateStr.trim();
                  // Isolate date part if there is an appended time portion
                  const datePart = cleaned.includes(' ') ? cleaned.split(/\s+/)[0] : cleaned;
                  
                  const [m, d, y] = datePart.split('/');
                  const cleanY = y.trim();
                  const cleanM = m.trim();
                  const cleanD = d.trim();
                  
                  const yearStr = cleanY.length === 2 ? `20${cleanY}` : cleanY;
                  const monthStr = cleanM.padStart(2, '0');
                  const dayStr = cleanD.padStart(2, '0');
                  return `${yearStr}-${monthStr}-${dayStr}`;
                } catch {
                  return '';
                }
              };

              const formatCleanTime = (timeStr: string) => {
                try {
                  const trimmed = timeStr.trim();
                  // If date is prepended, isolate time part
                  const timeOnly = trimmed.includes('/') 
                    ? trimmed.split(/\s+/).slice(1).join(' ') 
                    : trimmed;
                  
                  // Convert "8 AM" or "5 PM" to "8:00 AM" or "5:00 PM"
                  const noMinutesRegex = /^(\d{1,2})\s*([AP]M)$/i;
                  const noMinMatch = timeOnly.match(noMinutesRegex);
                  if (noMinMatch) {
                    const [_, h, ampm] = noMinMatch;
                    return `${h}:00 ${ampm.toUpperCase()}`;
                  }

                  // If the time has two colons (HH:MM:SS), drop the seconds part
                  const parts = timeOnly.split(':');
                  if (parts.length === 3) {
                    const hh = parts[0];
                    const mm = parts[1];
                    const ssWithAmpm = parts[2];
                    
                    const ampmMatch = ssWithAmpm.match(/\s*([AP]M)/i);
                    const ampm = ampmMatch ? ' ' + ampmMatch[1].toUpperCase() : '';
                    return `${parseInt(hh, 10)}:${mm}${ampm}`;
                  }
                  
                  // If it has only one colon (HH:MM), keep it exactly as is
                  return timeOnly;
                } catch {
                  return timeStr;
                }
              };

              const logsByDate = portalLogs.reduce((acc: Record<string, any[]>, log) => {
                const key = getLogDateKey(log.date);
                if (key) {
                  if (!acc[key]) acc[key] = [];
                  acc[key].push(log);
                }
                return acc;
              }, {});

              // Resolve Calendar offsets
              const baseDate = new Date();
              baseDate.setMonth(baseDate.getMonth() + calendarMonthOffset);
              const calendarYear = baseDate.getFullYear();
              const calendarMonth = baseDate.getMonth();

              const firstDayIndex = new Date(calendarYear, calendarMonth, 1).getDay(); // 0-6
              const totalDays = new Date(calendarYear, calendarMonth + 1, 0).getDate();
              const prevMonthTotalDays = new Date(calendarYear, calendarMonth, 0).getDate();
              const monthName = baseDate.toLocaleString('default', { month: 'long' });

              const cells = [];
              // Prev month padding
              for (let i = firstDayIndex - 1; i >= 0; i--) {
                cells.push({
                  day: prevMonthTotalDays - i,
                  isCurrentMonth: false,
                  dateStr: ''
                });
              }
              // Current month days
              for (let i = 1; i <= totalDays; i++) {
                const dayStr = i.toString().padStart(2, '0');
                const monthStr = (calendarMonth + 1).toString().padStart(2, '0');
                cells.push({
                  day: i,
                  isCurrentMonth: true,
                  dateStr: `${calendarYear}-${monthStr}-${dayStr}`
                });
              }
              // Next month padding to complete 42 cells grid
              const remaining = 42 - cells.length;
              for (let i = 1; i <= remaining; i++) {
                cells.push({
                  day: i,
                  isCurrentMonth: false,
                  dateStr: ''
                });
              }

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {/* Calendar controls bar */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', backgroundColor: '#f8fafc', padding: '0.6rem 1.25rem', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <button
                        type="button"
                        onClick={() => setCalendarMonthOffset(prev => prev - 1)}
                        style={{ background: 'none', border: 'none', color: 'var(--brand-navy)', fontWeight: 800, fontSize: '1.1rem', cursor: 'pointer', padding: '4px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        &larr;
                      </button>
                      <span style={{ fontSize: '0.85rem', fontWeight: 750, fontFamily: 'var(--font-title)', color: 'var(--brand-navy)', minWidth: '130px', textAlign: 'center' }}>
                        {monthName} {calendarYear}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCalendarMonthOffset(prev => prev + 1)}
                        style={{ background: 'none', border: 'none', color: 'var(--brand-navy)', fontWeight: 800, fontSize: '1.1rem', cursor: 'pointer', padding: '4px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        &rarr;
                      </button>
                      {calendarMonthOffset !== 0 && (
                        <button
                          type="button"
                          onClick={() => setCalendarMonthOffset(0)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--accent-blue)',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            marginLeft: '0.5rem',
                            textDecoration: 'underline'
                          }}
                        >
                          Today
                        </button>
                      )}
                    </div>
                    
                    <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', background: '#ffffff' }}>
                      <button
                        type="button"
                        onClick={() => setPortalLogsViewMode('calendar')}
                        style={{
                          border: 'none',
                          padding: '0.4rem 0.9rem',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          backgroundColor: portalLogsViewMode === 'calendar' ? 'var(--brand-navy)' : 'transparent',
                          color: portalLogsViewMode === 'calendar' ? '#ffffff' : 'var(--text-muted)',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        Calendar
                      </button>
                      <button
                        type="button"
                        onClick={() => setPortalLogsViewMode('list')}
                        style={{
                          border: 'none',
                          padding: '0.4rem 0.9rem',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          backgroundColor: portalLogsViewMode === 'list' ? 'var(--brand-navy)' : 'transparent',
                          color: portalLogsViewMode === 'list' ? '#ffffff' : 'var(--text-muted)',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        List Table
                      </button>
                    </div>
                  </div>

                  {portalLogsViewMode === 'calendar' ? (
                    /* Calendar View Grid */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {/* Week headers */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
                        {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(d => (
                          <div key={d} style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--brand-navy)', letterSpacing: '0.05em' }}>
                            {d}
                          </div>
                        ))}
                      </div>

                      {/* Day cells grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' }}>
                        {cells.map((cell, index) => {
                          const dayLogs = cell.dateStr ? logsByDate[cell.dateStr] || [] : [];
                          const todayStr = new Date().toLocaleDateString('en-CA'); // 'YYYY-MM-DD' format reliably
                          const isToday = cell.dateStr === todayStr;
                          const isWeekend = (index % 7 === 0 || index % 7 === 6);
                          
                          return (
                            <div key={index} style={{
                              minHeight: '75px',
                              padding: '6px',
                              borderRadius: '10px',
                              border: '1px solid',
                              borderColor: isToday ? 'var(--accent-blue)' : '#f1f5f9',
                              backgroundColor: !cell.isCurrentMonth 
                                ? 'rgba(241, 245, 249, 0.5)' 
                                : isToday 
                                  ? 'rgba(41, 116, 166, 0.05)' 
                                  : isWeekend 
                                    ? '#fafafa' 
                                    : '#ffffff',
                              opacity: !cell.isCurrentMonth ? 0.4 : 1,
                              boxShadow: isToday ? '0 0 0 1px var(--accent-blue)' : 'none',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '4px',
                              transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                            }}>
                              <span style={{
                                fontSize: '0.7rem',
                                fontWeight: cell.isCurrentMonth ? 800 : 400,
                                color: isToday ? 'var(--accent-blue)' : 'var(--brand-navy)',
                                alignSelf: 'flex-start'
                              }}>
                                {cell.day}
                              </span>
                              
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flexGrow: 1, justifyContent: 'flex-start' }}>
                                {(() => {
                                  const sortedDayLogs = [...dayLogs].sort((a, b) => {
                                    const aIsIn = a.mode.toLowerCase().includes('in');
                                    const bIsIn = b.mode.toLowerCase().includes('in');
                                    if (aIsIn && !bIsIn) return -1;
                                    if (!aIsIn && bIsIn) return 1;
                                    return 0;
                                  });

                                  return sortedDayLogs.map((log: any, idx: number) => {
                                    const isTimeIn = log.mode.toLowerCase().includes('in');
                                    
                                    return (
                                      <div key={idx} style={{
                                        fontSize: '0.55rem',
                                        fontWeight: 800,
                                        padding: '1.5px 5px',
                                        borderRadius: '999px',
                                        backgroundColor: isTimeIn ? '#e2fbe8' : '#fde2e2',
                                        color: isTimeIn ? '#15803d' : '#b91c1c',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '2px',
                                        border: '1px solid',
                                        borderColor: isTimeIn ? 'rgba(21, 128, 61, 0.2)' : 'rgba(185, 28, 28, 0.2)',
                                        whiteSpace: 'nowrap'
                                      }}>
                                        <span>{isTimeIn ? 'In' : 'Out'}:</span>
                                        <span>{formatCleanTime(log.time)}</span>
                                      </div>
                                    );
                                  });
                                })()}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    /* Traditional List Table View with equal spacing */
                    <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                      <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                            <th style={{ width: '20%', padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--brand-navy)', textAlign: 'left' }}>Date</th>
                            <th style={{ width: '20%', padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--brand-navy)', textAlign: 'left' }}>Time</th>
                            <th style={{ width: '15%', padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--brand-navy)', textAlign: 'left' }}>Mode</th>
                            <th style={{ width: '15%', padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--brand-navy)', textAlign: 'left' }}>Status</th>
                            <th style={{ width: '15%', padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--brand-navy)', textAlign: 'left' }}>DocNo</th>
                            <th style={{ width: '15%', padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--brand-navy)', textAlign: 'left' }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {portalLogs.map((log, index) => {
                            const isTimeIn = log.mode.toLowerCase().includes('in');
                            const isApproved = log.status.toLowerCase().includes('approved') || log.status.toLowerCase().includes('active');
                            
                            return (
                              <tr key={index} style={{ borderBottom: index === portalLogs.length - 1 ? 'none' : '1px solid #f1f5f9', backgroundColor: index % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                                <td style={{ width: '20%', padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                  {log.date.includes(' ') ? log.date.split(/\s+/)[0] : log.date}
                                </td>
                                <td style={{ width: '20%', padding: '0.75rem 1rem', color: '#475569', fontWeight: 500 }}>
                                  {formatCleanTime(log.time)}
                                </td>
                                <td style={{ width: '15%', padding: '0.75rem 1rem' }}>
                                  <span style={{
                                    fontSize: '0.7rem',
                                    fontWeight: 700,
                                    padding: '2px 8px',
                                    borderRadius: '999px',
                                    backgroundColor: isTimeIn ? '#f0fdf4' : '#fef2f2',
                                    color: isTimeIn ? '#16a34a' : '#dc2626',
                                    textTransform: 'uppercase'
                                  }}>
                                    {log.mode}
                                  </span>
                                </td>
                                <td style={{ width: '15%', padding: '0.75rem 1rem' }}>
                                  <span style={{
                                    fontSize: '0.7rem',
                                    fontWeight: 700,
                                    padding: '2px 8px',
                                    borderRadius: '999px',
                                    backgroundColor: isApproved ? '#e0f2fe' : '#fef3c7',
                                    color: isApproved ? '#0369a1' : '#d97706'
                                  }}>
                                    {log.status}
                                  </span>
                                </td>
                                <td style={{ width: '15%', padding: '0.75rem 1rem', fontFamily: 'monospace', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                  {log.docNo || '—'}
                                </td>
                                <td style={{ width: '15%', padding: '0.75rem 1rem' }}>
                                  {log.docNo ? (
                                    <button
                                      type="button"
                                      onClick={() => handleDeletePortalLog(log.docNo)}
                                      disabled={deletingDocNo !== null}
                                      style={{
                                        background: deletingDocNo === log.docNo ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.05)',
                                        border: '1px solid rgba(239, 68, 68, 0.2)',
                                        color: '#ef4444',
                                        borderRadius: '6px',
                                        fontSize: '0.7rem',
                                        fontWeight: 700,
                                        padding: '4px 8px',
                                        cursor: deletingDocNo !== null ? 'not-allowed' : 'pointer',
                                        transition: 'all 0.2s',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                      }}
                                    >
                                      {deletingDocNo === log.docNo ? (
                                        <>
                                          <Loader2 size={10} className="animate-spin" />
                                          Deleting
                                        </>
                                      ) : (
                                        'Delete'
                                      )}
                                    </button>
                                  ) : (
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })()}
          </>
        )}
          </div>



          {/* WFH and Credentials Settings Form */}
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '2.25rem' }}>
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
                      borderRadius: '14px',
                      paddingLeft: '2.75rem',
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
                      borderRadius: '14px',
                      paddingLeft: '2.75rem',
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
                          padding: '0.6rem 1.1rem',
                          fontSize: '0.8rem',
                          borderRadius: '12px',
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
                    style={{
                      borderRadius: '14px',
                      paddingLeft: '1.25rem'
                    }}
                    required
                  />
                </div>
              </div>

              {/* Time inputs rounded */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label className="glass-label" htmlFor="login-time-input">Log In Time</label>
                  <div className="ui-input-wrapper" style={{ marginBottom: 0, marginTop: '0.5rem' }}>
                    <input
                      id="login-time-input"
                      type="time"
                      value={profile.login_time}
                      onChange={(e) => setProfile({ ...profile, login_time: e.target.value })}
                      className="ui-input"
                      style={{
                        borderRadius: '14px',
                        paddingLeft: '1.25rem',
                        paddingRight: '0.5rem'
                      }}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="glass-label" htmlFor="logout-time-input">Log Out Time</label>
                  <div className="ui-input-wrapper" style={{ marginBottom: 0, marginTop: '0.5rem' }}>
                    <input
                      id="logout-time-input"
                      type="time"
                      value={profile.logout_time}
                      onChange={(e) => setProfile({ ...profile, logout_time: e.target.value })}
                      className="ui-input"
                      style={{
                        borderRadius: '14px',
                        paddingLeft: '1.25rem',
                        paddingRight: '0.5rem'
                      }}
                      required
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 4. Schedule Offsets Card */}
            <div className="ui-card" style={{ maxWidth: '100%', padding: '2.25rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
                <Calendar style={{ width: '20px', height: '20px', color: 'var(--brand-navy)' }} />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-title)', color: 'var(--brand-navy)', margin: 0 }}>
                  Schedule Offsets
                </h3>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label className="glass-label">Office Date (Offset to WFH)</label>
                  <div className="ui-input-wrapper" style={{ marginBottom: 0, marginTop: '0.4rem' }}>
                    <Calendar className="ui-input-icon" />
                    <input
                      type="date"
                      value={offsetSourceDate}
                      onChange={(e) => setOffsetSourceDate(e.target.value)}
                      className="ui-input"
                      style={{ paddingLeft: '2.75rem' }}
                    />
                  </div>
                </div>

                <div>
                  <label className="glass-label">WFH Date (Offset to Office)</label>
                  <div className="ui-input-wrapper" style={{ marginBottom: 0, marginTop: '0.4rem' }}>
                    <Calendar className="ui-input-icon" />
                    <input
                      type="date"
                      value={offsetTargetDate}
                      onChange={(e) => setOffsetTargetDate(e.target.value)}
                      className="ui-input"
                      style={{ paddingLeft: '2.75rem' }}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAddOffsetSwap}
                  className="btn-ui-primary"
                  style={{
                    padding: '0.75rem 1.25rem',
                    fontSize: '0.85rem',
                    borderRadius: '12px',
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    marginTop: '0.25rem',
                    fontWeight: 600
                  }}
                >
                  <Plus style={{ width: '16px', height: '16px' }} />
                  Add Offset
                </button>
              </div>

              {/* List of active offsets */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1 }}>
                <label className="glass-label">Active Offsets</label>
                {(() => {
                  const offsetsMap = profile.wfh_offsets || {};
                  const renderedKeys = new Set<string>();
                  const pairedSwaps: Array<{ officeDate: string; wfhDate: string }> = [];
                  const singleOverrides: Array<{ date: string; status: 'wfh' | 'office' }> = [];

                  Object.entries(offsetsMap).forEach(([dateStr, val]) => {
                    if (renderedKeys.has(dateStr)) return;

                    if (val && typeof val === 'object' && 'pairedWith' in val) {
                      const counterpart = val.pairedWith;
                      renderedKeys.add(dateStr);
                      renderedKeys.add(counterpart);

                      if (val.status === 'wfh') {
                        pairedSwaps.push({ officeDate: dateStr, wfhDate: counterpart });
                      } else {
                        pairedSwaps.push({ officeDate: counterpart, wfhDate: dateStr });
                      }
                    } else {
                      renderedKeys.add(dateStr);
                      singleOverrides.push({ date: dateStr, status: val as 'wfh' | 'office' });
                    }
                  });

                  const hasItems = pairedSwaps.length > 0 || singleOverrides.length > 0;

                  if (!hasItems) {
                    return (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '1.5rem',
                        border: '1px dashed rgba(17, 51, 85, 0.1)',
                        borderRadius: '16px',
                        color: 'var(--text-muted)',
                        fontSize: '0.8rem',
                        textAlign: 'center'
                      }}>
                        No active schedule offsets.
                      </div>
                    );
                  }

                  return (
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.65rem',
                      maxHeight: '220px',
                      overflowY: 'auto',
                      paddingRight: '4px'
                    }}>
                      {/* Paired Swaps */}
                      {pairedSwaps.map((swap) => {
                        let formattedOffice = swap.officeDate;
                        let formattedWfh = swap.wfhDate;
                        try {
                          formattedOffice = new Date(swap.officeDate).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          });
                          formattedWfh = new Date(swap.wfhDate).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          });
                        } catch (e) {}

                        return (
                          <div
                            key={swap.officeDate}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '0.65rem 0.95rem',
                              background: 'rgba(41, 116, 166, 0.04)',
                              border: '1px solid rgba(41, 116, 166, 0.12)',
                              borderRadius: '14px',
                              gap: '0.5rem'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#16a34a', textTransform: 'uppercase' }}>🏡 WFH Day</span>
                                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--brand-navy)' }}>{formattedOffice}</span>
                              </div>
                              <span style={{ color: 'var(--accent-blue)', fontWeight: 700, fontSize: '0.9rem' }}>⇄</span>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--accent-blue)', textTransform: 'uppercase' }}>🏢 Office Day</span>
                                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--brand-navy)' }}>{formattedWfh}</span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteOffsetSwap(swap.officeDate)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#ef4444',
                                cursor: 'pointer',
                                padding: '0.25rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'opacity 0.2s',
                                opacity: 0.85
                              }}
                              title="Remove offset"
                            >
                              <Trash2 style={{ width: '14px', height: '14px' }} />
                            </button>
                          </div>
                        );
                      })}

                      {/* Legacy / Single Overrides */}
                      {singleOverrides.map((ov) => {
                        let formattedDate = ov.date;
                        try {
                          formattedDate = new Date(ov.date).toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          });
                        } catch (e) {}

                        return (
                          <div
                            key={ov.date}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '0.5rem 0.75rem',
                              background: 'rgba(17, 51, 85, 0.02)',
                              border: '1px solid rgba(17, 51, 85, 0.06)',
                              borderRadius: '12px',
                              gap: '0.5rem'
                            }}
                          >
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--brand-navy)' }}>
                                {formattedDate}
                              </span>
                              <span style={{
                                fontSize: '0.65rem',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                color: ov.status === 'wfh' ? '#16a34a' : 'var(--accent-blue)',
                                marginTop: '2px'
                              }}>
                                {ov.status === 'wfh' ? '🏡 WFH Override' : '🏢 Office Override'}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteOffsetSwap(ov.date)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#ef4444',
                                cursor: 'pointer',
                                padding: '0.25rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                opacity: 0.8
                              }}
                              title="Remove override"
                            >
                              <Trash2 style={{ width: '14px', height: '14px' }} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
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
        @keyframes slideIn {
          from {
            transform: translateX(120%) scale(0.9);
            opacity: 0;
          }
          to {
            transform: translateX(0) scale(1);
            opacity: 1;
          }
        }
        @keyframes shrinkProgress {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
}
