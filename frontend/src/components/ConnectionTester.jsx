/**
 * ConnectionTester.jsx
 *
 * Step 1 of the deployment wizard.
 * Accepts instance IP + PEM file → tests SSH → reports result.
 * On success, calls `onSuccess({ ip, pemFile, sshUser, serverInfo })`.
 * The PEM File object is passed upward so the deployment form can reuse it
 * (the user only needs to select it once).
 */
import { useState, useRef } from 'react';

const API = import.meta.env.VITE_API_URL || '';

function isValidIPv4(ip) {
  if (!ip) return false;
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return false;
  return parts.every(p => /^\d{1,3}$/.test(p) && +p >= 0 && +p <= 255);
}

export default function ConnectionTester({ onSuccess, defaultIp = '', defaultSshUser = '' }) {
  const [ip,       setIp]       = useState(defaultIp);
  const [sshUser,  setSshUser]  = useState(defaultSshUser || 'ubuntu');
  const [pemFile,  setPemFile]  = useState(null);
  const [status,   setStatus]   = useState('idle'); // idle | testing | success | error
  const [result,   setResult]   = useState(null);
  const [ipError,  setIpError]  = useState('');
  const fileRef = useRef();

  const validate = () => {
    if (!isValidIPv4(ip)) { setIpError('Enter a valid IPv4 address (e.g. 54.12.34.56)'); return false; }
    if (!pemFile)          { setIpError(''); alert('Please select a PEM key file.'); return false; }
    setIpError('');
    return true;
  };

  const handleTest = async () => {
    if (!validate()) return;
    setStatus('testing');
    setResult(null);

    try {
      const fd = new FormData();
      fd.append('instanceIp', ip.trim());
      fd.append('sshUser',    sshUser.trim() || 'ubuntu');
      fd.append('pemFile',    pemFile);

      const res  = await fetch(`${API}/api/validate-connection`, { method: 'POST', body: fd });
      const data = await res.json();

      if (data.success) {
        setStatus('success');
        setResult(data);
        onSuccess?.({ ip: ip.trim(), sshUser: sshUser.trim() || 'ubuntu', pemFile, serverInfo: data.serverInfo });
      } else {
        setStatus('error');
        setResult(data);
      }
    } catch (err) {
      setStatus('error');
      setResult({ error: `Network error: ${err.message}` });
    }
  };

  const handleFileChange = e => {
    const f = e.target.files?.[0] || null;
    setPemFile(f);
    if (status !== 'idle') { setStatus('idle'); setResult(null); }
  };

  const testAgain = () => { setStatus('idle'); setResult(null); };

  return (
    <div className="card animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
          ${status === 'success' ? 'bg-green-500/20 text-green-400 ring-1 ring-green-500/40' :
            status === 'error'   ? 'bg-red-500/20   text-red-400   ring-1 ring-red-500/40'   :
            'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/40'}`}>
          {status === 'success' ? '✓' : status === 'error' ? '✗' : '1'}
        </div>
        <div>
          <h2 className="font-display font-semibold text-slate-100 text-sm">Connection Test</h2>
          <p className="text-xs text-slate-500 mt-0.5">Verify SSH access before deploying</p>
        </div>
        {status === 'success' && (
          <span className="ml-auto text-xs px-2 py-0.5 bg-green-500/10 text-green-400 border border-green-500/30 rounded-full font-medium">
            Connected
          </span>
        )}
      </div>

      {/* Form */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* IP Address */}
        <div className="sm:col-span-1">
          <label className="label">Instance IP</label>
          <input
            type="text"
            className={`input-field ${ipError ? 'border-red-500 focus:border-red-400 focus:ring-red-400/40' : ''}`}
            placeholder="54.123.45.67"
            value={ip}
            onChange={e => { setIp(e.target.value); setIpError(''); }}
            disabled={status === 'testing'}
          />
          {ipError && <p className="mt-1 text-xs text-red-400">{ipError}</p>}
        </div>

        {/* SSH User */}
        <div className="sm:col-span-1">
          <label className="label">SSH User</label>
          <input
            type="text"
            className="input-field"
            placeholder="ubuntu"
            value={sshUser}
            onChange={e => setSshUser(e.target.value)}
            disabled={status === 'testing'}
          />
        </div>

        {/* PEM File */}
        <div className="sm:col-span-1">
          <label className="label">PEM Key File</label>
          <div
            className={`relative flex items-center gap-2 px-3 py-2 bg-surface-700 border rounded-lg
              cursor-pointer hover:border-amber-500/60 transition-colors duration-150 text-sm
              ${pemFile ? 'border-amber-500/50' : 'border-surface-500'}
              ${status === 'testing' ? 'opacity-60 pointer-events-none' : ''}`}
            onClick={() => fileRef.current?.click()}
          >
            <svg className="w-4 h-4 text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
            <span className={`truncate font-mono text-xs ${pemFile ? 'text-amber-400' : 'text-slate-500'}`}>
              {pemFile ? pemFile.name : 'Click to select…'}
            </span>
            <input
              ref={fileRef}
              type="file"
              accept=".pem,.key"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        </div>
      </div>

      {/* Result banner */}
      {result && (
        <div className={`mt-4 rounded-lg p-3 font-mono text-xs border animate-slide-up
          ${status === 'success'
            ? 'bg-green-500/8 border-green-500/30 text-green-300'
            : 'bg-red-500/8 border-red-500/30 text-red-300'}`}>
          {status === 'success' ? (
            <>
              <p className="font-semibold text-green-400 mb-1">✓ Connection established</p>
              {result.serverInfo && <p className="text-green-300/70">{result.serverInfo}</p>}
            </>
          ) : (
            <>
              <p className="font-semibold text-red-400 mb-1">✗ Connection failed</p>
              <p className="text-red-300/70">{result.error}</p>
            </>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 flex items-center gap-3">
        <button
          className="btn-primary flex items-center gap-2"
          onClick={handleTest}
          disabled={status === 'testing'}
        >
          {status === 'testing' ? (
            <>
              <span className="w-3 h-3 border-2 border-surface-900/40 border-t-surface-900 rounded-full animate-spin" />
              Testing…
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Test Connection
            </>
          )}
        </button>

        {status === 'success' && (
          <button className="btn-secondary text-xs" onClick={testAgain}>
            Test Again
          </button>
        )}

        {status === 'success' && (
          <span className="ml-auto text-xs text-slate-500">
            Ready to deploy ↓
          </span>
        )}
      </div>
    </div>
  );
}
