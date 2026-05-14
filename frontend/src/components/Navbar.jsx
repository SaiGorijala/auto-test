import { NavLink } from 'react-router-dom';

export default function Navbar() {
  const linkClass = ({ isActive }) =>
    `px-4 py-1.5 rounded-md text-sm font-medium transition-colors duration-150 ${
      isActive
        ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
        : 'text-slate-400 hover:text-slate-200 hover:bg-surface-700'
    }`;

  return (
    <header className="sticky top-0 z-50 border-b border-surface-600 bg-surface-800/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-amber-500 flex items-center justify-center">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-surface-900">
              <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
            </svg>
          </div>
          <span className="font-display font-semibold text-slate-100 tracking-tight">
            Pipeline<span className="text-amber-400">Deploy</span>
          </span>
        </div>

        {/* Nav links */}
        <nav className="flex items-center gap-1">
          <NavLink to="/"        end className={linkClass}>Deploy</NavLink>
          <NavLink to="/history"     className={linkClass}>History</NavLink>
        </nav>

        {/* Status dot */}
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse-slow" />
          v1.0.0
        </div>
      </div>
    </header>
  );
}
