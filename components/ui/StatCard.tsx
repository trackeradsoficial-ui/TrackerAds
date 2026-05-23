interface StatCardProps {
  label: string
  value: string | number
  sub?: string
}

export default function StatCard({ label, value, sub }: StatCardProps) {
  return (
    <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] p-5 shadow-[var(--shadow-sm)]">
      <p className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">{label}</p>
      <p className="mt-2 text-3xl font-bold text-[var(--text-primary)]">{value}</p>
      {sub && <p className="mt-1 text-xs text-[var(--text-muted)]">{sub}</p>}
    </div>
  )
}
