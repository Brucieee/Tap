'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Clock, Calendar, CheckCircle, Trash2 } from 'lucide-react';
import Logo from '@/components/Logo';
import BatEffect from '@/components/effects/BatEffect';

export default function LogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [triggerBatEffect, setTriggerBatEffect] = useState(false);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDeleteLog = async (id: string) => {
    if (!confirm('Are you sure you want to delete this log entry?')) {
      return;
    }
    setDeletingId(id);
    try {
      const response = await fetch(`/api/logs?id=${id}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        setLogs(prev => prev.filter(log => log.id !== id));
      } else {
        const err = await response.json();
        alert(err.error || 'Failed to delete log.');
      }
    } catch (err) {
      alert('An error occurred while deleting.');
    } finally {
      setDeletingId(null);
    }
  };

  const sortedLogs = [...logs].sort((a, b) => {
    const timeA = new Date(a.created_at).getTime();
    const timeB = new Date(b.created_at).getTime();
    return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
  });

  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const fetchLogs = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      try {
        const response = await fetch('/api/logs');
        if (response.ok) {
          const data = await response.json();
          setLogs(data);
        } else {
          const err = await response.json();
          setError(err.error || 'Failed to fetch logs.');
        }
      } catch (err) {
        setError('An unexpected error occurred.');
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, [router, supabase]);

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-canvas)' }}>
        <Loader2 style={{ animation: 'spin 1.5s linear infinite', width: '24px', height: '24px', color: 'var(--brand-navy)' }} />
        <style jsx global>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'red' }}>
        <h2>Error loading logs</h2>
        <p>{error}</p>
        <button onClick={() => router.push('/dashboard')} className="btn-ui-secondary">Back to Dashboard</button>
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <BatEffect trigger={triggerBatEffect} setTrigger={setTriggerBatEffect} />
      
      <main style={{ flex: 1, padding: '0.5rem 2rem 2.5rem 2rem', width: '100%', display: 'flex', flexDirection: 'column', gap: '2.25rem' }}>
        
        {/* Header row (constrained to match dashboard) */}
        <div style={{ maxWidth: '1280px', width: '100%', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(226, 232, 240, 0.5)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <Logo showClock={false} showText={true} textColor="var(--brand-navy)" />
              <span 
                onClick={(e) => { e.preventDefault(); setTriggerBatEffect(true); }}
                style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--accent-blue)', marginTop: '-0.1rem', cursor: 'pointer', userSelect: 'none', transition: 'color 0.2s ease-in-out' }}
              >
                by Bruce Wayne
              </span>
            </div>

            <div>
              <button onClick={() => router.push('/dashboard')} className="btn-ui-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '999px', padding: '0.5rem 1.25rem', fontWeight: 600 }}>
                <ArrowLeft style={{ width: '16px', height: '16px' }} />
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>

        <div className="ui-card" style={{ maxWidth: '100%', padding: '2.25rem', display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Clock style={{ width: '20px', height: '20px', color: 'var(--brand-navy)' }} />
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'var(--font-title)', color: 'var(--brand-navy)', margin: 0 }}>
                System Logs
              </h2>
            </div>
            
            {/* Premium Sorting Control */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>Sort by Date:</span>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
                style={{
                  padding: '0.35rem 1.5rem 0.35rem 0.75rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#ffffff',
                  color: 'var(--brand-navy)',
                  cursor: 'pointer',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                }}
              >
                <option value="desc">Newest First (Desc)</option>
                <option value="asc">Oldest First (Asc)</option>
              </select>
            </div>
          </div>

          {sortedLogs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', flex: 1 }}>
              No logs available at the moment.
            </div>
          ) : (
            <div style={{ overflow: 'auto', flex: 1, borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left', minWidth: '800px' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#f8fafc', boxShadow: '0 1px 0 #e2e8f0' }}>
                  <tr>
                    <th style={{ padding: '1.25rem 1rem', color: '#475569', fontWeight: 600 }}>Date</th>
                    <th style={{ padding: '1.25rem 1rem', color: '#475569', fontWeight: 600 }}>Time</th>
                    <th style={{ padding: '1.25rem 1rem', color: '#475569', fontWeight: 600 }}>User Email</th>
                    <th style={{ padding: '1.25rem 1rem', color: '#475569', fontWeight: 600 }}>Employee ID</th>
                    <th style={{ padding: '1.25rem 1rem', color: '#475569', fontWeight: 600 }}>Mode</th>
                    <th style={{ padding: '1.25rem 1rem', color: '#475569', fontWeight: 600 }}>Status</th>
                    <th style={{ padding: '1.25rem 1rem', color: '#475569', fontWeight: 600, textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedLogs.map((log) => (
                    <tr key={log.id} style={{ transition: 'background 0.2s', cursor: 'default' }} onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f1f5f9')} onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                      <td style={{ padding: '1rem', color: 'var(--brand-navy)', borderBottom: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Calendar style={{ width: '16px', height: '16px', color: '#94a3b8' }} />
                          {log.date}
                        </div>
                      </td>
                      <td style={{ padding: '1rem', color: 'var(--text-primary)', borderBottom: '1px solid #e2e8f0' }}>{new Date(log.created_at).toLocaleTimeString()}</td>
                      <td style={{ padding: '1rem', color: 'var(--text-primary)', fontWeight: 500, borderBottom: '1px solid #e2e8f0' }}>{log.email}</td>
                      <td style={{ padding: '1rem', color: 'var(--text-muted)', borderBottom: '1px solid #e2e8f0' }}>{log.employee_id}</td>
                      <td style={{ padding: '1rem', borderBottom: '1px solid #e2e8f0' }}>
                        <span style={{ 
                          padding: '0.25rem 0.75rem', 
                          borderRadius: '999px', 
                          fontSize: '0.75rem', 
                          fontWeight: 600,
                          backgroundColor: log.mode === 'login' ? '#dcfce7' : '#fee2e2',
                          color: log.mode === 'login' ? '#166534' : '#991b1b',
                          textTransform: 'capitalize'
                        }}>
                          {log.mode}
                        </span>
                      </td>
                      <td style={{ padding: '1rem', borderBottom: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#16a34a', fontSize: '0.85rem', fontWeight: 500 }}>
                          <CheckCircle style={{ width: '16px', height: '16px' }} /> Success
                        </div>
                      </td>
                      <td style={{ padding: '1rem', borderBottom: '1px solid #e2e8f0', textAlign: 'center' }}>
                        <button
                          onClick={() => handleDeleteLog(log.id)}
                          disabled={deletingId === log.id}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#ef4444',
                            cursor: 'pointer',
                            padding: '4px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: deletingId === log.id ? 0.5 : 0.8,
                            transition: 'opacity 0.2s',
                          }}
                          onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                          onMouseLeave={e => e.currentTarget.style.opacity = deletingId === log.id ? '0.5' : '0.8'}
                          title="Delete Log Entry"
                        >
                          {deletingId === log.id ? (
                            <Loader2 style={{ animation: 'spin 1.5s linear infinite', width: '16px', height: '16px' }} />
                          ) : (
                            <Trash2 style={{ width: '16px', height: '16px' }} />
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
