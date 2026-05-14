export default function ProgressBar({ phase = 'Initializing', percent = 0, status }) {
  const clampedPct = Math.min(100, Math.max(0, percent));

  const barColor =
    status === 'success'   ? 'bg-green-500' :
    status === 'failed'    ? 'bg-red-500'   :
    status === 'cancelled' ? 'bg-yellow-500' :
    'bg-amber-500';

  const shimmer = status === 'in-progress' || status === 'pending';

  return (
    <div className="space-y-2">
      {/* Labels */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400 font-mono truncate max-w-[70%]">{phase}</span>
        <span className="text-slate-300 font-mono font-semibold tabular-nums">{clampedPct}%</span>
      </div>

      {/* Track */}
      <div className="relative h-2 bg-surface-600 rounded-full overflow-hidden">
        {/* Fill */}
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${barColor}`}
          style={{ width: `${clampedPct}%` }}
        />
        {/* Shimmer overlay while running */}
        {shimmer && (
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)',
              animation: 'shimmer 1.8s linear infinite',
            }}
          />
        )}
      </div>

      <style>{`
        @keyframes shimmer {
          from { transform: translateX(-100%); }
          to   { transform: translateX(200%); }
        }
      `}</style>
    </div>
  );
}
