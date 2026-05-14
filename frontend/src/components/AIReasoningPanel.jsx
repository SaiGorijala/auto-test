/**
 * AIReasoningPanel.jsx
 *
 * Displays AI reasoning logs and generated artifacts:
 * - AI decision-making process
 * - Deployed artifacts (Dockerfile, docker-compose, Jenkinsfile, etc.)
 * - Repository analysis results
 * - Deployment planning steps
 */

import { useState, useEffect } from 'react';

const API = import.meta.env.VITE_API_URL || '';

function formatTimestamp(iso) {
  try {
    const date = new Date(iso);
    return date.toLocaleTimeString('en-US', { hour12: false });
  } catch {
    return '—';
  }
}

function ArtifactViewer({ type, content }) {
  const [isOpen, setIsOpen] = useState(false);
  
  const lineCount = content.split('\n').length;
  const preview = content.split('\n').slice(0, 5).join('\n');

  return (
    <div className="border border-slate-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 bg-slate-800 hover:bg-slate-700 transition-colors flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <svg className={`w-4 h-4 text-slate-500 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
          <span className="font-mono text-sm text-slate-300">{type}</span>
          <span className="text-xs text-slate-500 ml-auto">{lineCount} lines</span>
        </div>
      </button>
      {isOpen && (
        <div className="bg-slate-950 p-4 border-t border-slate-700">
          <pre className="text-xs font-mono text-slate-400 overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap break-words">
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}

function ReasoningEntry({ entry }) {
  const colors = {
    analysis: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
    planning: 'bg-purple-500/10 border-purple-500/30 text-purple-400',
    validation: 'bg-green-500/10 border-green-500/30 text-green-400',
    execution: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
  };

  const color = colors[entry.reasoning_type] || colors.analysis;

  return (
    <div className={`border ${color} rounded-lg p-3 space-y-2`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="font-semibold text-sm">{entry.title}</h4>
          <p className="text-xs text-slate-400 mt-1">{entry.content}</p>
        </div>
        <span className="text-xs text-slate-500 shrink-0 font-mono">
          {formatTimestamp(entry.timestamp)}
        </span>
      </div>
    </div>
  );
}

export default function AIReasoningPanel({ deploymentId }) {
  const [reasoning, setReasoning] = useState([]);
  const [artifacts, setArtifacts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('reasoning');

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError('');

      try {
        // Load AI reasoning
        const reasoningRes = await fetch(`${API}/api/deployments/${deploymentId}/ai-reasoning`);
        if (reasoningRes.ok) {
          const reasoningData = await reasoningRes.json();
          setReasoning(reasoningData.reasoning || []);
        }

        // Load artifacts
        const artifactsRes = await fetch(`${API}/api/deployments/${deploymentId}/artifacts`);
        if (artifactsRes.ok) {
          const artifactsData = await artifactsRes.json();
          setArtifacts(artifactsData.artifacts || {});
        }
      } catch (err) {
        setError(`Failed to load AI data: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    if (deploymentId) {
      loadData();
    }
  }, [deploymentId]);

  if (loading) {
    return (
      <div className="card">
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 border-2 border-slate-600 border-t-slate-300 rounded-full animate-spin" />
          <span className="ml-3 text-sm text-slate-500">Loading AI reasoning...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card bg-red-500/10 border border-red-500/30">
        <div className="flex items-center gap-2 text-red-400 text-sm">
          <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      </div>
    );
  }

  const hasReasoning = reasoning.length > 0;
  const hasArtifacts = Object.keys(artifacts).length > 0;

  if (!hasReasoning && !hasArtifacts) {
    return (
      <div className="card bg-slate-800 border border-slate-700 text-center py-8">
        <p className="text-sm text-slate-500">
          No AI reasoning or artifacts available yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tab navigation */}
      <div className="flex gap-2 border-b border-slate-700">
        {hasReasoning && (
          <button
            onClick={() => setActiveTab('reasoning')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'reasoning'
                ? 'text-blue-400 border-b-blue-400'
                : 'text-slate-500 border-b-transparent hover:text-slate-400'
            }`}
          >
            🤖 AI Reasoning ({reasoning.length})
          </button>
        )}
        {hasArtifacts && (
          <button
            onClick={() => setActiveTab('artifacts')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'artifacts'
                ? 'text-green-400 border-b-green-400'
                : 'text-slate-500 border-b-transparent hover:text-slate-400'
            }`}
          >
            📦 Artifacts ({Object.keys(artifacts).length})
          </button>
        )}
      </div>

      {/* Reasoning tab */}
      {activeTab === 'reasoning' && hasReasoning && (
        <div className="space-y-3 animate-fade-in">
          {reasoning.map((entry, idx) => (
            <ReasoningEntry key={idx} entry={entry} />
          ))}
        </div>
      )}

      {/* Artifacts tab */}
      {activeTab === 'artifacts' && hasArtifacts && (
        <div className="space-y-3 animate-fade-in">
          {Object.entries(artifacts).map(([type, data]) => (
            <ArtifactViewer
              key={type}
              type={type}
              content={data.content}
            />
          ))}
        </div>
      )}
    </div>
  );
}
