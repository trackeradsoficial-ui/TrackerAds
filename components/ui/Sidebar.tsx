'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard,
  Users,
  ArrowLeftRight,
  Contact,
  Settings,
  LogOut,
  Menu,
  X,
  Moon,
  Sun,
  Zap,
} from 'lucide-react'

interface SidebarProps {
  role: 'admin' | 'client'
  companyName?: string
  userEmail?: string
}

const adminLinks = [
  { href: '/admin/dashboard', label: 'Dashboard',    icon: LayoutDashboard },
  { href: '/admin',           label: 'Clientes',     icon: Users           },
  { href: '/admin/conversoes',label: 'Conversões',   icon: ArrowLeftRight  },
  { href: '/admin/contatos',  label: 'Contatos',     icon: Contact         },
  { href: '/admin/settings',  label: 'Configurações',icon: Settings        },
]

const clientLinks = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
]

export default function Sidebar({ role, companyName, userEmail }: SidebarProps) {
  const pathname  = usePathname()
  const router    = useRouter()
  const [open, setOpen]     = useState(false)
  const [dark, setDark]     = useState(false)

  // persist dark mode
  useEffect(() => {
    const saved = localStorage.getItem('theme')
    if (saved === 'dark') applyDark(true)
  }, [])

  function applyDark(value: boolean) {
    setDark(value)
    document.documentElement.classList.toggle('dark', value)
    localStorage.setItem('theme', value ? 'dark' : 'light')
  }

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const links = role === 'admin' ? adminLinks : clientLinks

  function isActive(href: string) {
    // exact for dashboard, startsWith for others
    if (href === '/admin/dashboard' || href === '/admin' || href === '/dashboard') {
      return pathname === href
    }
    return pathname.startsWith(href)
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-[var(--border)]">
        <div className="w-8 h-8 rounded-lg bg-[var(--brand)] flex items-center justify-center shrink-0">
          <Zap size={16} className="text-white" />
        </div>
        <div className="min-w-0">
          <p className="font-bold text-white text-sm leading-tight">Tracker Ads</p>
          {companyName && (
            <p className="text-[var(--text-muted)] text-xs truncate">{companyName}</p>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {links.map(({ href, label, icon: Icon }) => {
          const active = isActive(href)
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                active
                  ? 'bg-[var(--brand)] text-white shadow-sm'
                  : 'text-[var(--text-sidebar)] hover:bg-[var(--bg-sidebar-hover)] hover:text-white'
              }`}
            >
              <Icon size={17} className="shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Bottom */}
      <div className="px-3 pb-4 space-y-0.5 border-t border-[var(--border)] pt-3">
        {/* Dark mode toggle */}
        <button
          onClick={() => applyDark(!dark)}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-[var(--text-sidebar)] hover:bg-[var(--bg-sidebar-hover)] hover:text-white transition-colors"
        >
          {dark ? <Sun size={17} /> : <Moon size={17} />}
          {dark ? 'Modo Claro' : 'Modo Escuro'}
        </button>

        {/* User info */}
        {userEmail && (
          <div className="px-3 py-2 text-xs text-[var(--text-muted)] truncate">
            {userEmail}
          </div>
        )}

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-[var(--text-sidebar)] hover:bg-red-900/40 hover:text-red-400 transition-colors"
        >
          <LogOut size={17} />
          Sair
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-[var(--bg-sidebar)] border-b border-[var(--border)] flex items-center justify-between px-4 h-14">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-[var(--brand)] flex items-center justify-center">
            <Zap size={14} className="text-white" />
          </div>
          <span className="font-bold text-white text-sm">Tracker Ads</span>
        </div>
        <button
          onClick={() => setOpen(!open)}
          className="p-2 rounded-lg text-[var(--text-sidebar)] hover:bg-[var(--bg-sidebar-hover)]"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile overlay */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-30 bg-black/50 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside className={`lg:hidden fixed top-14 left-0 bottom-0 z-40 w-64 bg-[var(--bg-sidebar)] transform transition-transform duration-200 ${
        open ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <SidebarContent />
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-60 min-h-screen bg-[var(--bg-sidebar)] fixed top-0 left-0 bottom-0 z-30">
        <SidebarContent />
      </aside>
    </>
  )
}
