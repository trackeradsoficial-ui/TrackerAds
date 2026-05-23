'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Zap, Eye, EyeOff, AlertCircle } from 'lucide-react'

export default function LoginPage() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [show,     setShow]     = useState(false)
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError('Email ou senha inválidos.')
      setLoading(false)
      return
    }

    window.location.href = '/admin'
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-base)] px-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-[var(--brand)] opacity-5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full bg-[var(--brand)] opacity-5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo area */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--brand)] shadow-lg mb-4">
            <Zap size={28} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">Tracker Ads</h1>
          <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
            Plataforma de conversões WhatsApp + Facebook CAPI
          </p>
        </div>

        {/* Card */}
        <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] shadow-[var(--shadow-md)] p-8">
          <h2 className="text-base font-semibold text-[var(--text-primary)] mb-6">
            Entre na sua conta
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 border border-[var(--border)] rounded-xl text-sm bg-[var(--bg-base)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)] focus:border-transparent placeholder:text-[var(--text-muted)] transition-colors"
                placeholder="seu@email.com"
                autoComplete="email"
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide">
                Senha
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={show ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2.5 pr-10 border border-[var(--border)] rounded-xl text-sm bg-[var(--bg-base)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)] focus:border-transparent placeholder:text-[var(--text-muted)] transition-colors"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2.5">
                <AlertCircle size={15} className="shrink-0" />
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[var(--brand)] hover:bg-[var(--brand-dark)] disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors shadow-sm mt-2"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Entrando...
                </span>
              ) : 'Entrar'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
          Tracker Ads © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
