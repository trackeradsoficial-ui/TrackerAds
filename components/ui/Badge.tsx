interface BadgeProps {
  variant?: 'success' | 'error' | 'warning' | 'info' | 'gray'
  children: React.ReactNode
}

const styles: Record<string, string> = {
  success: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  error:   'bg-red-50 text-red-600 border border-red-200',
  warning: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
  info:    'bg-blue-50 text-blue-700 border border-blue-200',
  gray:    'bg-[var(--bg-base)] text-[var(--text-muted)] border border-[var(--border)]',
}

export default function Badge({ variant = 'gray', children }: BadgeProps) {
  return (
    <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-full ${styles[variant]}`}>
      {children}
    </span>
  )
}
