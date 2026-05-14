/**
 * DashboardPage.jsx
 *
 * Orchestrates the three-step deployment wizard:
 *   Step 1 — ConnectionTester  (always visible at top)
 *   Step 2 — DeploymentForm    (shown after connection is verified)
 *   Step 3 — DeploymentConsole (shown after deploy is enqueued)
 *
 * Also handles "re-deploy with same config" data passed via React Router state
 * from the History page.
 */
import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import ConnectionTester  from '../components/ConnectionTester';
import DeploymentForm    from '../components/DeploymentForm';
import DeploymentConsole from '../components/DeploymentConsole';
import AIReasoningPanel from '../components/AIReasoningPanel';

export default function DashboardPage() {
  const location = useLocation();

  // Connection info set by ConnectionTester on success
  const [connInfo, setConnInfo] = useState(null);
  // { ip, sshUser, pemFile, serverInfo }

  // Active deployment ID returned by POST /api/deploy
  const [deploymentId, setDeploymentId] = useState(null);

  // Pre-fill data from the History "Re-deploy" button
  const [redeployConfig, setRedeployConfig] = useState(null);

  // Pull re-deploy config from router state (navigated from HistoryPage)
  useEffect(() => {
    if (location.state?.redeployConfig) {
      setRedeployConfig(location.state.redeployConfig);
      // Clear router state so a refresh doesn't re-apply it
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const handleConnectionSuccess = info => {
    setConnInfo(info);
    setDeploymentId(null); // reset any prior deploy view
  };

  const handleDeployStarted = id => {
    setDeploymentId(id);
  };

  const handleReset = () => {
    setDeploymentId(null);
    setConnInfo(null);
    setRedeployConfig(null);
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      {/* Page title */}
      <div className="mb-2">
        <h1 className="font-display font-bold text-2xl text-slate-100 tracking-tight">
          Deploy Pipeline
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Provision Jenkins + SonarQube on an EC2 instance via SSH.
        </p>
      </div>

      {/* ── Step 1: SSH Connection Tester ────────────────────────────── */}
      {!deploymentId && (
        <ConnectionTester
          onSuccess={handleConnectionSuccess}
          defaultIp={redeployConfig?.instanceIp || ''}
          defaultSshUser={redeployConfig?.sshUser || ''}
        />
      )}

      {/* ── Step 2: Deployment Form ──────────────────────────────────── */}
      {!deploymentId && connInfo && (
        <DeploymentForm
          connInfo={connInfo}
          redeployConfig={redeployConfig}
          onDeployStarted={handleDeployStarted}
        />
      )}

      {/* ── Connector arrow between steps ───────────────────────────── */}
      {!deploymentId && !connInfo && (
        <div className="flex items-center justify-center py-2">
          <div className="flex flex-col items-center gap-1 text-slate-700">
            <div className="w-px h-6 bg-surface-600" />
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
            </svg>
            <span className="text-xs font-mono">Step 2 unlocks after successful connection test</span>
          </div>
        </div>
      )}

      {/* ── Step 3: Deployment Console ───────────────────────────────── */}
      {deploymentId && (
        <>
          <DeploymentConsole
            deploymentId={deploymentId}
            onReset={handleReset}
          />

          {/* ── AI Reasoning Panel ────────────────────────────────────── */}
          <div>
            <h2 className="text-lg font-semibold text-slate-200 mb-3 flex items-center gap-2">
              <span>🤖 AI Orchestration</span>
              <span className="text-xs font-normal text-slate-500">Reasoning & Artifacts</span>
            </h2>
            <AIReasoningPanel deploymentId={deploymentId} />
          </div>
        </>
      )}
    </div>
  );
}
