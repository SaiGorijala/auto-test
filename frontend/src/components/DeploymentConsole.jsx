/**
 * DeploymentConsole.jsx
 *
 * Real-time deployment log viewer:
 *  • Loads existing logs via REST on mount (survives page refresh / reconnect).
 *  • Subscribes to Socket.IO room for live updates while in-progress.
 *  • Auto-scroll with toggle; manual search/filter; download as .txt.
 *  • Color-coded log levels (error/warning/success/info).
 *  • Phase-driven progress bar.
 *  • Cancel button while in-progress.
 *  • Connection status indicator with reconnect feedback.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from '../hooks/useSocket';
import ProgressBar from './ProgressBar';
import StatusBadge from './StatusBadge';

const API = import.meta.env.VITE_API_URL || '';

const LEVEL_CLASSES = {
  error:   'text-red-400',
  warning: 'text-yellow-400',
  success: 'text-green-400',
  info:    'text-slate-400',
};
const LEVEL_PREFIX = {
  error:   'ERR ',
  warning: 'WRN ',
  success: 'SUC ',
  info:    '    ',
};

function formatElapsed(ms) {
  if (!ms) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function formatTs(iso) {
  try {
    return new Date(iso).toLocaleTimeString('en-US', { hour12: false });
  } catch { return '—'; }
}

export default function DeploymentConsole({ deploymentId, onReset }) {
  const [logs,     setLogs]     = useState([]);
  const [status,   setStatus]   = useState({ status: 'pending', phase: 'Initializing', phasePercent: 0, elapsedMs: 0 });
  const [filter,   setFilter]   = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [cancelErr,  setCancelErr]  = useState('');
  const [resuming, setResuming] = useState(false);
  const [resumeErr, setResumeErr] = useState('');

  const consoleRef  = useRef(null);
  const loadedRef   = useRef(false);
  const elapsedTimer = useRef(null);
  const startTimeRef = useRef(null);
  const [elapsedDisplay, setElapsedDisplay] = useState(0);

  // ── Load initial logs + status ─────────────────────────────────────────────
  const loadStatus = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/api/deploy/${deploymentId}/status`);
      const data = await res.json();
      setStatus(s => ({ ...s, ...data }));
      if (data.elapsedMs) setElapsedDisplay(data.elapsedMs);
    } catch (_) {}
  }, [deploymentId]);

  const loadAllLogs = useCallback(async () => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    let from = 0;
    const batch = [];
    let hasMore = true;
    while (hasMore) {
      try {
        const res  = await fetch(`${API}/api/deploy/${deploymentId}/logs?from=${from}&limit=500`);
        const data = await res.json();
        batch.push(...data.logs);
        from    = data.lastId;
        hasMore = data.hasMore;
      } catch { break; }
    }
    setLogs(batch);
  }, [deploymentId]);

  useEffect(() => {
    if (!deploymentId) return;
    loadStatus();
    loadAllLogs();
    startTimeRef.current = Date.now();
  }, [deploymentId, loadStatus, loadAllLogs]);

  // ── Elapsed timer (ticks while in-progress) ────────────────────────────────
  useEffect(() => {
    const running = ['pending', 'in-progress'].includes(status.status);
    if (running) {
      elapsedTimer.current = setInterval(() => {
        setElapsedDisplay(prev => prev + 1000);
      }, 1000);
    } else {
      clearInterval(elapsedTimer.current);
    }
    return () => clearInterval(elapsedTimer.current);
  }, [status.status]);

  // ── Socket callbacks ───────────────────────────────────────────────────────
  const onLog = useCallback(entry => {
    setLogs(prev => {
      // Deduplicate by id
      if (entry.id && prev.some(l => l.id === entry.id)) return prev;
      return [...prev, entry];
    });
  }, []);

  const onPhase = useCallback(({ phase, percent }) => {
    setStatus(s => ({ ...s, phase, phasePercent: percent }));
  }, []);

  const onStatus = useCallback(data => {
    setStatus(s => ({ ...s, ...data }));
    if (data.elapsedMs) setElapsedDisplay(data.elapsedMs);
  }, []);

  const isActive = ['pending', 'in-progress'].includes(status.status);
  const { connected } = useSocket({ deploymentId, onLog, onPhase, onStatus, enabled: isActive });

  // ── Auto-scroll ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (autoScroll && consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleScroll = () => {
    const el = consoleRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (!atBottom) setAutoScroll(false);
  };

  // ── Download logs ──────────────────────────────────────────────────────────
  const downloadLogs = () => {
    const text = logs
      .map(l => `[${formatTs(l.timestamp)}] ${LEVEL_PREFIX[l.level] || '    '}${l.message}`)
      .join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `deployment-${deploymentId.slice(0, 8)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Cancel ────────────────────────────────────────────────────────────────
  const handleCancel = async () => {
    if (!confirm('Cancel this deployment?')) return;
    setCancelling(true);
    setCancelErr('');
    try {
      const res  = await fetch(`${API}/api/deploy/${deploymentId}/cancel`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    } catch (err) {
      setCancelErr(err.message);
    } finally {
      setCancelling(false);
    }
  };

  // ── Resume ────────────────────────────────────────────────────────────────
  const handleResume = async () => {
    if (!confirm('Resume this failed deployment from where it stopped?')) return;
    setResuming(true);
    setResumeErr('');
    try {
      const res  = await fetch(`${API}/api/deploy/${deploymentId}/resume`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      // Reload status to reflect pending state
      await loadStatus();
      loadedRef.current = false;
      await loadAllLogs();
    } catch (err) {
      setResumeErr(err.message);
    } finally {
      setResuming(false);
    }
  };

  // ── Filtered logs ─────────────────────────────────────────────────────────
  const filteredLogs = filter
    ? logs.filter(l => l.message.toLowerCase().includes(filter.toLowerCase()))
    : logs;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Status bar */}
      <div className="card">
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <div className="flex items-center gap-2">
            <StatusBadge status={status.status} />
            {isActive && (
              <span className={`text-xs font-mono flex items-center gap-1 ${connected ? 'text-green-400' : 'text-yellow-400'}`}>
                <span className={`w-1.5 h-1.5 rounded-full inline-block ${connected ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'}`} />
                {connected ? 'Live' : 'Reconnecting…'}
              </span>
            )}
          </div>

          <div className="text-xs text-slate-500 font-mono">
            ID: <span className="text-slate-400">{deploymentId.slice(0, 8)}…</span>
          </div>

          <div className="text-xs text-slate-500 font-mono">
            Elapsed: <span className="text-slate-300 tabular-nums">{formatElapsed(elapsedDisplay)}</span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {isActive && (
              <button
                className="btn-danger text-xs flex items-center gap-1.5"
                onClick={handleCancel}
                disabled={cancelling}
              >
                {cancelling
                  ? <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                }
                {cancelling ? 'Cancelling…' : 'Cancel'}
              </button>
            )}
            {status.status === 'failed' && status.recovery && (
              <button
                className="btn-secondary text-xs flex items-center gap-1.5"
                onClick={handleResume}
                disabled={resuming}
              >
                {resuming
                  ? <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                }
                {resuming ? 'Resuming…' : 'Resume'}
              </button>
            )}
            <button className="btn-secondary text-xs" onClick={onReset}>
              ← New Deploy
            </button>
          </div>
        </div>

        {cancelErr && (
          <p className="mb-3 text-xs text-red-400 font-mono">Cancel error: {cancelErr}</p>
        )}

        {resumeErr && (
          <p className="mb-3 text-xs text-red-400 font-mono">Resume error: {resumeErr}</p>
        )}

        {status.recovery && (
          <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-yellow-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span className="font-semibold text-yellow-400">AI Recovery Info</span>
            </div>
            <div className="text-xs text-slate-300 space-y-1">
              <div><span className="text-slate-500">Failed phase:</span> {status.recovery.failedPhase}</div>
              <div><span className="text-slate-500">Error cause:</span> {status.recovery.errorCause}</div>
              <div><span className="text-slate-500">Suggested fix:</span> {status.recovery.suggestedFix}</div>
              <div><span className="text-slate-500">Next step:</span> {status.recovery.retryInstructions}</div>
              {status.recovery.attemptNumber > 1 && (
                <div><span className="text-slate-500">Retry attempt:</span> #{status.recovery.attemptNumber}</div>
              )}
            </div>
          </div>
        )}
        <ProgressBar phase={status.phase} percent={status.phasePercent} status={status.status} />

        {/* Service URLs on success */}
        {status.status === 'success' && (status.jenkinsUrl || status.sonarqubeUrl || status.appUrl) && (
          <div className="mt-4 flex flex-wrap gap-3">
            {status.jenkinsUrl && (
              <a href={status.jenkinsUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 border border-blue-500/30 rounded-lg text-xs text-blue-400 hover:bg-blue-500/20 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Jenkins Dashboard
              </a>
            )}
            {status.sonarqubeUrl && (
              <a href={status.sonarqubeUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/10 border border-purple-500/30 rounded-lg text-xs text-purple-400 hover:bg-purple-500/20 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                SonarQube
              </a>
            )}
            {status.appUrl && (
              <a href={status.appUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 border border-green-500/30 rounded-lg text-xs text-green-400 hover:bg-green-500/20 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h18M5 5v14h14V5M8 9h8M8 13h5" />
                </svg>
                Application
              </a>
            )}
          </div>
        )}
      </div>

      {/* Console */}
      <div className="bg-surface-900 border border-surface-600 rounded-xl overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-2.5 bg-surface-800 border-b border-surface-600">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/60" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
            <div className="w-3 h-3 rounded-full bg-green-500/60" />
          </div>
          <span className="text-xs text-slate-500 font-mono">deployment.log</span>

          {/* Search */}
          <div className="relative ml-auto">
            <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Filter logs…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="pl-7 pr-3 py-1 bg-surface-700 border border-surface-500 rounded text-xs font-mono text-slate-300 placeholder-slate-600 focus:outline-none focus:border-amber-500/60 w-44"
            />
            {filter && (
              <button className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300" onClick={() => setFilter('')}>×</button>
            )}
          </div>

          {/* Controls */}
          <button
            onClick={() => setAutoScroll(s => !s)}
            title="Toggle auto-scroll"
            className={`p-1 rounded text-xs transition-colors ${autoScroll ? 'text-amber-400 bg-amber-500/10' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <button onClick={downloadLogs} title="Download logs" className="p-1 rounded text-slate-500 hover:text-slate-300 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>

          <span className="text-xs text-slate-600 font-mono tabular-nums">
            {filter ? `${filteredLogs.length}/${logs.length}` : logs.length} lines
          </span>
        </div>

        {/* Log output */}
        <div
          ref={consoleRef}
          onScroll={handleScroll}
          className="h-96 overflow-y-auto font-mono text-xs leading-relaxed p-4 space-y-0.5"
          style={{ background: '#030507' }}
        >
          {filteredLogs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-700">
              {isActive ? (
                <span className="flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-slate-600 animate-blink inline-block rounded-sm" />
                  Waiting for output…
                </span>
              ) : (
                <span>No logs found{filter ? ` matching "${filter}"` : ''}.</span>
              )}
            </div>
          ) : (
            filteredLogs.map((entry, i) => (
              <div key={entry.id ?? i} className="flex gap-3 group hover:bg-white/[0.02] rounded px-1 -mx-1">
                <span className="text-slate-700 shrink-0 tabular-nums select-none w-16">
                  {formatTs(entry.timestamp)}
                </span>
                <span className={`shrink-0 select-none w-8 ${LEVEL_CLASSES[entry.level] || 'text-slate-500'} opacity-60`}>
                  {(LEVEL_PREFIX[entry.level] || '').trimEnd()}
                </span>
                <span className={`break-all ${LEVEL_CLASSES[entry.level] || 'text-slate-400'}`}>
                  {entry.message}
                </span>
              </div>
            ))
          )}

          {/* Blinking cursor while running */}
          {isActive && (
            <div className="flex gap-3 items-center px-1 mt-1">
              <span className="text-slate-700 w-16 select-none">&nbsp;</span>
              <span className="w-2 h-3.5 bg-amber-500 animate-blink rounded-sm" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
