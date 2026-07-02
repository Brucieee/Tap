'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Clock, Calendar, CheckCircle, Trash2 } from 'lucide-react';
import Logo from '@/components/Logo';
import BatEffect from '@/components/effects/BatEffect';

export default function LogsPage() {
  const getLocalDateString = () => {
    const tzoffset = (new Date()).getTimezoneOffset() * 60000;
    return (new Date(Date.now() - tzoffset)).toISOString().slice(0, 10);
  };

  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [triggerBatEffect, setTriggerBatEffect] = useState(false);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  
  const [filterDate, setFilterDate] = useState<string>(getLocalDateString());
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  // Recovery modal state variables
  const [isRecoveryOpen, setIsRecoveryOpen] = useState(false);
  const [recoveryDate, setRecoveryDate] = useState(filterDate || getLocalDateString());
  const [recoveryLogs, setRecoveryLogs] = useState<string[]>([]);
  const [isRecovering, setIsRecovering] = useState(false);

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

  const filteredLogs = sortedLogs.filter(log => {
    if (!filterDate) return true;
    return log.date === filterDate;
  });

  const totalItems = filteredLogs.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const safeCurrentPage = Math.max(1, Math.min(currentPage, totalPages));
  
  const indexOfLastItem = safeCurrentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredLogs.slice(indexOfFirstItem, indexOfLastItem);

  const router = useRouter();
  const supabase = createClient();

  const fetchLogs = async (silent = false) => {
    if (!silent) setLoading(true);
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
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [router, supabase]);

  const startRecovery = () => {
    if (!recoveryDate) {
      alert('Please select a valid date for recovery.');
      return;
    }
    setIsRecovering(true);
    setRecoveryLogs(['[System] Initializing recovery scan...', `[System] Target Date: ${recoveryDate}`]);

    const eventSource = new EventSource(`/api/admin/recover?date=${recoveryDate}&stream=true`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.status === 'final') {
          setRecoveryLogs(prev => [
            ...prev,
            `[System] SCAN COMPLETED!`,
            `[Summary] Total: ${data.data.summary.total} | Success: ${data.data.summary.success} | Failed: ${data.data.summary.failed} | Skipped: ${data.data.summary.skipped}`
          ]);
          setIsRecovering(false);
          eventSource.close();
          fetchLogs(true); // Silent update of list logs
        } else if (data.status === 'error') {
          setRecoveryLogs(prev => [...prev, `[Error] ${data.message}`]);
          setIsRecovering(false);
          eventSource.close();
        } else {
          const prefix = data.status === 'info' ? '' : `[${data.status.toUpperCase()}] `;
          setRecoveryLogs(prev => [...prev, `${prefix}${data.message}`]);
        }
      } catch (err) {
        setRecoveryLogs(prev => [...prev, `[Parsing Error] Raw chunk: ${event.data}`]);
      }
    };

    eventSource.onerror = (err) => {
      setRecoveryLogs(prev => [...prev, `[Connection Error] SSE stream interrupted or disconnected.`]);
      setIsRecovering(false);
      eventSource.close();
    };
  };

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
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-canvas)', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <BatEffect trigger={triggerBatEffect} setTrigger={setTriggerBatEffect} />
      
      <main style={{ maxWidth: '1280px', width: '100%', margin: '0 auto', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2.25rem' }}>
        
        {/* Header row (constrained to match dashboard) */}
        <div style={{ width: '100%' }}>
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

        <div className="ui-card" style={{ maxWidth: '100%', padding: '2.25rem', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Clock style={{ width: '20px', height: '20px', color: 'var(--brand-navy)' }} />
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'var(--font-title)', color: 'var(--brand-navy)', margin: 0 }}>
                  System Logs
                </h2>
              </div>
              <button
                onClick={() => {
                  setRecoveryDate(filterDate || getLocalDateString());
                  setIsRecoveryOpen(true);
                }}
                className="btn-ui-primary"
                style={{
                  borderRadius: '999px',
                  padding: '0.35rem 1rem',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  background: 'linear-gradient(135deg, var(--brand-navy) 0%, var(--accent-blue) 100%)',
                  border: 'none',
                  color: 'white',
                  cursor: 'pointer',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                  transition: 'transform 0.2s, box-shadow 0.2s'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
                }}
              >
                Recover Logs
              </button>
            </div>
            
            {/* Filter and Sort Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
              {/* Date Filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>Filter Date:</span>
                <input
                  type="date"
                  value={filterDate}
                  onChange={(e) => {
                    setFilterDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  style={{
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                    color: 'var(--brand-navy)',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                />
                {filterDate ? (
                  <button
                    onClick={() => {
                      setFilterDate('');
                      setCurrentPage(1);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent-blue)',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: '2px 6px'
                    }}
                  >
                    Clear
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setFilterDate(getLocalDateString());
                      setCurrentPage(1);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent-blue)',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: '2px 6px'
                    }}
                  >
                    Today
                  </button>
                )}
              </div>

              {/* Sort Control */}
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
          </div>

          {filteredLogs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
              <Calendar style={{ width: '48px', height: '48px', color: '#94a3b8', strokeWidth: 1.5 }} />
              <div>
                <p style={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--brand-navy)', margin: 0 }}>
                  {filterDate ? `No logs found for ${filterDate}` : 'No logs available at the moment.'}
                </p>
                <p style={{ fontSize: '0.85rem', marginTop: '0.25rem', marginBottom: 0 }}>
                  {filterDate ? "There are no automated timelogs recorded for this date." : "No logs have been synchronized in the database history."}
                </p>
              </div>
              {filterDate && (
                <button
                  onClick={() => {
                    setFilterDate('');
                    setCurrentPage(1);
                  }}
                  className="btn-ui-primary"
                  style={{ width: 'auto', padding: '0.6rem 1.5rem', fontSize: '0.85rem', marginTop: '0.5rem' }}
                >
                  View All Historical Logs
                </button>
              )}
            </div>
          ) : (
            <>
              <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left', minWidth: '800px' }}>
                  <thead style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
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
                    {currentItems.map((log) => (
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

              {/* Premium Pagination Footer */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Showing <strong style={{ color: 'var(--brand-navy)' }}>{totalItems > 0 ? indexOfFirstItem + 1 : 0}</strong> to <strong style={{ color: 'var(--brand-navy)' }}>{Math.min(indexOfLastItem, totalItems)}</strong> of <strong style={{ color: 'var(--brand-navy)' }}>{totalItems}</strong> logs
                </div>
                
                {totalPages > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={safeCurrentPage === 1}
                      style={{
                        padding: '0.35rem 0.75rem',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        borderRadius: '6px',
                        cursor: safeCurrentPage === 1 ? 'not-allowed' : 'pointer',
                        opacity: safeCurrentPage === 1 ? 0.5 : 1,
                        display: 'inline-flex',
                        alignItems: 'center',
                        border: '1px solid #e2e8f0',
                        backgroundColor: '#ffffff',
                        color: 'var(--brand-navy)'
                      }}
                    >
                      Previous
                    </button>
                    
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => {
                      if (totalPages > 5 && pageNum !== 1 && pageNum !== totalPages && Math.abs(pageNum - safeCurrentPage) > 1) {
                        if (pageNum === 2 || pageNum === totalPages - 1) {
                          return <span key={pageNum} style={{ padding: '0 0.25rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>...</span>;
                        }
                        return null;
                      }
                      
                      const isActive = pageNum === safeCurrentPage;
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          style={{
                            padding: '0.35rem 0.75rem',
                            fontSize: '0.8rem',
                            fontWeight: isActive ? 700 : 500,
                            borderRadius: '6px',
                            border: isActive ? '1px solid var(--accent-blue)' : '1px solid #e2e8f0',
                            backgroundColor: isActive ? 'rgba(30, 80, 115, 0.08)' : '#ffffff',
                            color: isActive ? 'var(--brand-navy)' : 'var(--text-muted)',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                    
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={safeCurrentPage === totalPages}
                      style={{
                        padding: '0.35rem 0.75rem',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        borderRadius: '6px',
                        cursor: safeCurrentPage === totalPages ? 'not-allowed' : 'pointer',
                        opacity: safeCurrentPage === totalPages ? 0.5 : 1,
                        display: 'inline-flex',
                        alignItems: 'center',
                        border: '1px solid #e2e8f0',
                        backgroundColor: '#ffffff',
                        color: 'var(--brand-navy)'
                      }}
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>

      {isRecoveryOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1.5rem'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            maxWidth: '750px',
            width: '100%',
            borderRadius: '16px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: '85vh'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '1.5rem',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
              color: '#ffffff'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Clock style={{ width: '22px', height: '22px', color: '#38bdf8' }} />
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, fontFamily: 'var(--font-title)' }}>
                  Manual Logs Recovery
                </h3>
              </div>
              <button
                onClick={() => {
                  if (!isRecovering) setIsRecoveryOpen(false);
                }}
                disabled={isRecovering}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '1.5rem',
                  cursor: isRecovering ? 'not-allowed' : 'pointer',
                  opacity: isRecovering ? 0.4 : 1,
                  lineHeight: 1
                }}
                title="Close"
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', overflowY: 'auto' }}>
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#475569', lineHeight: 1.5 }}>
                Select a target date to scan all users. The recovery engine will check leaves, holiday definitions, and WFH schedules, then run automated Playwright tasks to fill in any missing login/logout entries on the company portal.
              </p>

              {/* Date Selector Row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b' }}>
                    Target Date
                  </label>
                  <input
                    type="date"
                    value={recoveryDate}
                    onChange={(e) => setRecoveryDate(e.target.value)}
                    disabled={isRecovering}
                    style={{
                      padding: '0.5rem 1rem',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.9rem',
                      fontWeight: 600,
                      color: 'var(--brand-navy)',
                      outline: 'none',
                      cursor: isRecovering ? 'not-allowed' : 'pointer',
                      opacity: isRecovering ? 0.7 : 1
                    }}
                  />
                </div>

                <button
                  onClick={startRecovery}
                  disabled={isRecovering}
                  className="btn-ui-primary"
                  style={{
                    alignSelf: 'flex-end',
                    padding: '0.55rem 1.5rem',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    cursor: isRecovering ? 'not-allowed' : 'pointer',
                    opacity: isRecovering ? 0.7 : 1
                  }}
                >
                  {isRecovering ? (
                    <>
                      <Loader2 style={{ animation: 'spin 1.5s linear infinite', width: '16px', height: '16px' }} />
                      Recovering...
                    </>
                  ) : (
                    'Start Recovery'
                  )}
                </button>
              </div>

              {/* Dark Console Logs Terminal */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b' }}>
                    Execution Console Output
                  </span>
                  {recoveryLogs.length > 0 && (
                    <button
                      onClick={() => setRecoveryLogs([])}
                      disabled={isRecovering}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--accent-blue)',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        opacity: isRecovering ? 0.5 : 1
                      }}
                    >
                      Clear Log
                    </button>
                  )}
                </div>
                
                <div style={{
                  backgroundColor: '#0f172a',
                  color: '#38bdf8',
                  fontFamily: 'Consolas, Monaco, monospace',
                  fontSize: '0.825rem',
                  padding: '1.25rem',
                  borderRadius: '12px',
                  height: '280px',
                  overflowY: 'auto',
                  border: '1px solid #1e293b',
                  boxShadow: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.6)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.35rem'
                }}>
                  {recoveryLogs.length === 0 ? (
                    <span style={{ color: '#64748b', fontStyle: 'italic' }}>Terminal idle. Select date and click Start Recovery.</span>
                  ) : (
                    recoveryLogs.map((log, idx) => {
                      let color = '#38bdf8'; // info
                      if (log.startsWith('[Error]') || log.startsWith('[FAILED]')) color = '#f87171'; // red
                      if (log.startsWith('[Success]') || log.startsWith('[SUCCESS]') || log.includes('SCAN COMPLETED')) color = '#4ade80'; // green
                      if (log.startsWith('[WARN]') || log.startsWith('[Warning]')) color = '#fbbf24'; // yellow
                      if (log.startsWith('[System]')) color = '#c084fc'; // purple
                      return (
                        <div key={idx} style={{ color, wordBreak: 'break-all', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                          {log}
                        </div>
                      );
                    })
                  )}
                  {/* Dummy div to scroll to bottom */}
                  <div ref={(el) => {
                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                  }} />
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '1rem 1.5rem',
              backgroundColor: '#f8fafc',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '0.75rem'
            }}>
              <button
                onClick={() => {
                  setIsRecoveryOpen(false);
                }}
                disabled={isRecovering}
                className="btn-ui-secondary"
                style={{
                  borderRadius: '8px',
                  padding: '0.5rem 1.25rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: isRecovering ? 'not-allowed' : 'pointer',
                  opacity: isRecovering ? 0.5 : 1
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
