interface BadgeProps {
  variant: 'success' | 'error' | 'warning' | 'gray'
  children: React.ReactNode
}

const styles = {
  success: 'bg-green-100 text-green-700',
  error: 'bg-red-100 text-red-700',
  warning: 'bg-yellow-100 text-yellow-700',
  gray: 'bg-gray-100 text-gray-600',
}

export default function Badge({ variant, children }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[variant]}`}>
      {children}
    </span>
  )
}
