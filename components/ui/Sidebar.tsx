'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface SidebarProps {
  role: 'admin' | 'client'
  companyName?: string
}

export default function Sidebar({ role, companyName }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const adminLinks = [
    { href: '/admin', label: 'Clientes' },
    { href: '/admin/clients/new', label: 'Novo Cliente' },
  ]

  const clientLinks = [
    { href: '/dashboard', label: 'Dashboard' },
  ]

  const links = role === 'admin' ? adminLinks : clientLinks

  return (
    <aside className="w-56 min-h-screen bg-gray-900 flex flex-col">
      <div className="px-5 py-6 border-b border-gray-700">
        <p className="text-white font-bold text-lg">Tracker Ads</p>
        {companyName && (
          <p className="text-gray-400 text-xs mt-1 truncate">{companyName}</p>
        )}
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {links.map((link) => {
          const active = pathname === link.href
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              {link.label}
            </Link>
          )
        })}
      </nav>

      <div className="px-3 pb-5">
        <button
          onClick={handleLogout}
          className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
        >
          Sair
        </button>
      </div>
    </aside>
  )
}
