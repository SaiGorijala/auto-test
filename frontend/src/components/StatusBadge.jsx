const CONFIG = {
  pending:     { label: 'Pending',      dot: 'bg-slate-400',  text: 'text-slate-400',  ring: 'border-slate-500/40',  bg: 'bg-slate-500/10'  },
  'in-progress':{ label: 'In Progress', dot: 'bg-blue-400 animate-pulse', text: 'text-blue-400', ring: 'border-blue-500/40', bg: 'bg-blue-500/10' },
  success:     { label: 'Success',      dot: 'bg-green-400',  text: 'text-green-400',  ring: 'border-green-500/40',  bg: 'bg-green-500/10'  },
  failed:      { label: 'Failed',       dot: 'bg-red-400',    text: 'text-red-400',    ring: 'border-red-500/40',    bg: 'bg-red-500/10'    },
  cancelled:   { label: 'Cancelled',    dot: 'bg-yellow-400', text: 'text-yellow-400', ring: 'border-yellow-500/40', bg: 'bg-yellow-500/10' },
};

export default function StatusBadge({ status }) {
  const c = CONFIG[status] || CONFIG.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${c.text} ${c.ring} ${c.bg}`}>
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}
