/**
 * DeploymentForm.jsx
 *
 * Step 2: Collects repo URL, GitHub credentials, and submits the deployment.
 * - Uses FormData (multipart) so the PEM file is never in a JSON body.
 * - The PEM file comes from the ConnectionTester (stored in parent state).
 * - GitHub token is sent to the server but the server only stores a redacted hint.
 * - Inline field validation before submit.
 */
import { useState } from 'react';

const API = import.meta.env.VITE_API_URL || '';

function Field({ label, error, children }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}

export default function DeploymentForm({ connInfo, redeployConfig, onDeployStarted }) {
  const { ip, sshUser, pemFile } = connInfo || {};

  const [form, setForm] = useState({
    repoUrl:        redeployConfig?.repoUrl        || '',
    githubUsername: redeployConfig?.githubUsername || '',
    githubToken:    '', // Never pre-filled — must be re-entered
  });
  const [errors,    setErrors]    = useState({});
  const [loading,   setLoading]   = useState(false);
  const [submitErr, setSubmitErr] = useState('');
  const [showToken, setShowToken] = useState(false);

  const set = (key, val) => {
    setForm(f => ({ ...f, [key]: val }));
    setErrors(e => ({ ...e, [key]: '' }));
  };

  const validate = () => {
    const errs = {};
    if (!form.repoUrl.trim() || !/^https?:\/\/.+/.test(form.repoUrl.trim())) {
      errs.repoUrl = 'Enter a valid HTTPS repository URL.';
    }
    if (!form.githubUsername.trim()) {
      errs.githubUsername = 'GitHub username is required.';
    }
    if (!form.githubToken.trim()) {
      errs.githubToken = 'GitHub token is required.';
    } else if (!form.githubToken.trim().startsWith('ghp_') && !form.githubToken.trim().startsWith('github_pat_')) {
      errs.githubToken = 'Token should start with ghp_ or github_pat_';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    if (!pemFile) {
      setSubmitErr('PEM file missing — complete the connection test first.');
      return;
    }

    setLoading(true);
    setSubmitErr('');

    try {
      const fd = new FormData();
      fd.append('instanceIp',      ip);
      fd.append('sshUser',         sshUser || 'ubuntu');
      fd.append('repoUrl',         form.repoUrl.trim());
      fd.append('githubUsername',  form.githubUsername.trim());
      fd.append('githubToken',     form.githubToken.trim());
      fd.append('pemFile',         pemFile);

      const res  = await fetch(`${API}/api/deploy`, { method: 'POST', body: fd });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      onDeployStarted?.(data.deploymentId);
    } catch (err) {
      setSubmitErr(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
          bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/40">
          2
        </div>
        <div>
          <h2 className="font-display font-semibold text-slate-100 text-sm">Deployment Config</h2>
          <p className="text-xs text-slate-500 mt-0.5">Deploying to <span className="font-mono text-amber-400/80">{ip}</span></p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Repo URL */}
        <div className="sm:col-span-2">
          <Field label="Repository URL" error={errors.repoUrl}>
            <input
              type="url"
              className={`input-field ${errors.repoUrl ? 'border-red-500' : ''}`}
              placeholder="https://github.com/org/jenkins-pipeline"
              value={form.repoUrl}
              onChange={e => set('repoUrl', e.target.value)}
              disabled={loading}
            />
          </Field>
        </div>

        {/* GitHub Username */}
        <Field label="GitHub Username" error={errors.githubUsername}>
          <input
            type="text"
            className={`input-field ${errors.githubUsername ? 'border-red-500' : ''}`}
            placeholder="octocat"
            value={form.githubUsername}
            onChange={e => set('githubUsername', e.target.value)}
            disabled={loading}
          />
        </Field>

        {/* GitHub Token */}
        <Field label="GitHub Token (PAT)" error={errors.githubToken}>
          <div className="relative">
            <input
              type={showToken ? 'text' : 'password'}
              className={`input-field pr-10 ${errors.githubToken ? 'border-red-500' : ''}`}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              value={form.githubToken}
              onChange={e => set('githubToken', e.target.value)}
              disabled={loading}
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
              onClick={() => setShowToken(s => !s)}
              tabIndex={-1}
            >
              {showToken ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-600">
            Token is used once for deployment only — never stored in the database.
          </p>
        </Field>

        {/* PEM info */}
        <div className="sm:col-span-2">
          <div className="flex items-center gap-2 px-3 py-2 bg-surface-700 border border-surface-500 rounded-lg text-xs">
            <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            <span className="text-slate-400">PEM key:</span>
            <span className="font-mono text-amber-400/80">{pemFile?.name || '—'}</span>
            <span className="ml-auto text-green-400">Loaded from connection test</span>
          </div>
        </div>
      </div>

      {/* Submit error */}
      {submitErr && (
        <div className="mt-4 p-3 bg-red-500/8 border border-red-500/30 rounded-lg text-xs text-red-300 font-mono animate-slide-up">
          ✗ {submitErr}
        </div>
      )}

      {/* Redeploy notice */}
      {redeployConfig && (
        <div className="mt-4 flex items-center gap-2 px-3 py-2 bg-amber-500/8 border border-amber-500/20 rounded-lg text-xs text-amber-400">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Pre-filled from a previous deployment — GitHub token must be re-entered.
        </div>
      )}

      {/* Submit */}
      <div className="mt-5 flex items-center gap-3">
        <button className="btn-primary flex items-center gap-2" onClick={handleSubmit} disabled={loading}>
          {loading ? (
            <>
              <span className="w-3 h-3 border-2 border-surface-900/40 border-t-surface-900 rounded-full animate-spin" />
              Submitting…
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Start Deployment
            </>
          )}
        </button>

        <p className="text-xs text-slate-600">
          PEM is deleted from server immediately after SSH session ends.
        </p>
      </div>
    </div>
  );
}
