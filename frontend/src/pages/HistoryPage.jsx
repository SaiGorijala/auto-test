/**
 * HistoryPage.jsx
 *
 * Lists all past deployments from GET /api/deployments.
 * Each row shows: IP, repo, status badge, duration, timestamp.
 * "Re-deploy" navigates to Dashboard with the stored config pre-filled
 * (excluding the GitHub token — user must re-enter it).
 * "View logs" expands an inline console for the selected deployment.
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import StatusBadge   from '../components/StatusBadge';
import DeploymentConsole from '../components/DeploymentConsole';

const API = import.meta.env.VITE_API_URL || '';

function formatDuration(ms) {
  if (!ms && ms !== 0) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  } catch { return iso; }
}

function truncateRepo(url) {
  try {
    const u = new URL(url);
    return u.pathname.replace(/^\//, '');
  } catch { return url; }
}

export default function HistoryPage() {
  const navigate = useNavigate();
  const [deployments, setDeployments] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [expanded,    setExpanded]    = useState(null); // deploymentId of the expanded log viewer

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res  = await fetch(`${API}/api/deployments`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setDeployments(data.deployments || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRedeploy = async (deployment) => {
    // Fetch full detail to get config snapshot (excludes raw token)
    try {
      const res  = await fetch(`${API}/api/deployments/${deployment.id}`);
      const data = await res.json();
      navigate('/', {
        state: {
          redeployConfig: {
            instanceIp:     data.config?.instanceIp     || deployment.instance_ip,
            repoUrl:        data.config?.repoUrl        || deployment.repo_url,
            githubUsername: data.config?.githubUsername || deployment.github_username,
            sshUser:        data.config?.sshUser        || 'ubuntu',
            // Token is intentionally omitted — user must enter fresh
          },
        },
      });
    } catch {
      // Fallback to minimal info from list
      navigate('/', {
        state: {
          redeployConfig: {
            instanceIp:     deployment.instance_ip,
            repoUrl:        deployment.repo_url,
            githubUsername: deployment.github_username,
            sshUser:        'ubuntu',
          },
        },
      });
    }
  };

  const toggleExpand = id => setExpanded(prev => (prev === id ? null : id));

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display font-bold text-2xl text-slate-100 tracking-tight">
            Deployment History
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {deployments.length} deployment{deployments.length !== 1 ? 's' : ''} recorded
          </p>
        </div>
        <button className="btn-secondary flex items-center gap-2" onClick={load} disabled={loading}>
          <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* States */}
      {loading && (
        <div className="flex items-center justify-center py-20 text-slate-500 text-sm gap-2">
          <span className="w-4 h-4 border-2 border-slate-600 border-t-slate-400 rounded-full animate-spin" />
          Loading deployments…
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-500/8 border border-red-500/30 rounded-xl text-red-300 text-sm font-mono">
          ✗ {error}
        </div>
      )}

      {!loading && !error && deployments.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-600 text-sm gap-3">
          <svg className="w-12 h-12 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p>No deployments yet. <a href="/" className="text-amber-500 hover:underline">Start your first deployment →</a></p>
        </div>
      )}

      {/* Table */}
      {!loading && deployments.length > 0 && (
        <div className="space-y-2">
          {/* Column headers */}
          <div className="hidden sm:grid grid-cols-[1fr_1.6fr_0.8fr_0.6fr_0.6fr_auto] gap-4 px-4 py-2 text-xs font-semibold text-slate-600 uppercase tracking-wider">
            <span>Instance</span>
            <span>Repository</span>
            <span>Status</span>
            <span>Duration</span>
            <span>Started</span>
            <span className="text-right">Actions</span>
          </div>

          {deployments.map(dep => (
            <div key={dep.id} className="rounded-xl border border-surface-600 bg-surface-800 overflow-hidden">
              {/* Row */}
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.6fr_0.8fr_0.6fr_0.6fr_auto] gap-4 items-center px-4 py-3">
                {/* IP */}
                <div>
                  <span className="font-mono text-sm text-amber-400/90">{dep.instance_ip}</span>
                  <p className="text-xs text-slate-600 mt-0.5 font-mono">{dep.github_username}</p>
                </div>

                {/* Repo */}
                <div className="min-w-0">
                  <span className="font-mono text-xs text-slate-300 break-all block"
                    title={dep.repo_url}>
                    {truncateRepo(dep.repo_url)}
                  </span>
                  <span className="text-xs text-slate-600 font-mono block mt-0.5 truncate">
                    {dep.id.slice(0, 8)}…
                  </span>
                </div>

                {/* Status */}
                <div>
                  <StatusBadge status={dep.status} />
                  {dep.phase && dep.status === 'in-progress' && (
                    <p className="text-xs text-slate-600 font-mono mt-1 truncate">{dep.phase}</p>
                  )}
                </div>

                {/* Duration */}
                <div className="font-mono text-sm text-slate-400 tabular-nums">
                  {formatDuration(dep.duration_ms)}
                </div>

                {/* Date */}
                <div className="text-xs text-slate-500 font-mono">
                  {formatDate(dep.created_at)}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 justify-end">
                  <button
                    className="text-xs px-2.5 py-1 bg-surface-700 hover:bg-surface-600 border border-surface-500
                      text-slate-300 rounded-lg font-medium transition-colors flex items-center gap-1.5"
                    onClick={() => toggleExpand(dep.id)}
                  >
                    <svg className={`w-3 h-3 transition-transform ${expanded === dep.id ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                    Logs
                  </button>

                  <button
                    className="text-xs px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30
                      text-amber-400 rounded-lg font-medium transition-colors flex items-center gap-1.5"
                    onClick={() => handleRedeploy(dep)}
                    title="Re-deploy with same config (token must be re-entered)"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Re-deploy
                  </button>

                  {dep.jenkins_url && (
                    <a href={dep.jenkins_url} target="_blank" rel="noopener noreferrer"
                      className="text-xs px-2.5 py-1 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30
                        text-blue-400 rounded-lg font-medium transition-colors">
                      Jenkins
                    </a>
                  )}

                  {dep.app_url && (
                    <a href={dep.app_url} target="_blank" rel="noopener noreferrer"
                      className="text-xs px-2.5 py-1 bg-green-500/10 hover:bg-green-500/20 border border-green-500/30
                        text-green-400 rounded-lg font-medium transition-colors">
                      App
                    </a>
                  )}
                </div>
              </div>

              {/* Expanded log console */}
              {expanded === dep.id && (
                <div className="border-t border-surface-600 p-4 bg-surface-900/50 animate-slide-up">
                  <DeploymentConsole
                    deploymentId={dep.id}
                    onReset={() => setExpanded(null)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
