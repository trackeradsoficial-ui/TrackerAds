'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  User,
  Lock,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Save,
} from 'lucide-react'

export default function SettingsClient({ email }: { email: string }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword,     setNewPassword]     = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent,     setShowCurrent]     = useState(false)
  const [showNew,         setShowNew]         = useState(false)
  const [loading,         setLoading]         = useState(false)
  const [message,         setMessage]         = useState('')
  const [messageOk,       setMessageOk]       = useState(true)

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setMessage('')

    if (newPassword !== confirmPassword) {
      setMessageOk(false)
      setMessage('As senhas não coincidem.')
      return
    }

    if (newPassword.length < 8) {
      setMessageOk(false)
      setMessage('A nova senha deve ter pelo menos 8 caracteres.')
      return
    }

    setLoading(true)

    try {
      const supabase = createClient()

      // Re-authenticate with current password first
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      })

      if (signInError) {
        setMessageOk(false)
        setMessage('Senha atual incorreta.')
        setLoading(false)
        return
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })

      if (updateError) {
        setMessageOk(false)
        setMessage(`Erro ao atualizar senha: ${updateError.message}`)
      } else {
        setMessageOk(true)
        setMessage('Senha alterada com sucesso!')
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      }
    } catch {
      setMessageOk(false)
      setMessage('Erro inesperado. Tente novamente.')
    }

    setLoading(false)
    setTimeout(() => setMessage(''), 5000)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Configurações</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">Gerencie sua conta de administrador</p>
      </div>

      {/* Account info */}
      <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] shadow-[var(--shadow-sm)] overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-[var(--border)]">
          <User size={16} className="text-[var(--text-muted)]" />
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Dados da Conta</h2>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide">
              Email
            </label>
            <div className="flex items-center gap-3 px-3 py-2.5 border border-[var(--border)] rounded-xl bg-[var(--bg-base)]">
              <span className="text-sm text-[var(--text-primary)]">{email}</span>
              <span className="ml-auto text-xs font-medium text-[var(--text-muted)] bg-[var(--bg-base)] border border-[var(--border)] px-2 py-0.5 rounded-full">
                Admin
              </span>
            </div>
            <p className="mt-1.5 text-xs text-[var(--text-muted)]">
              O email não pode ser alterado por aqui.
            </p>
          </div>
        </div>
      </div>

      {/* Change password */}
      <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] shadow-[var(--shadow-sm)] overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-[var(--border)]">
          <Lock size={16} className="text-[var(--text-muted)]" />
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Alterar Senha</h2>
        </div>

        <form onSubmit={handleChangePassword} className="p-5 space-y-4">
          <PasswordField
            label="Senha Atual"
            value={currentPassword}
            onChange={setCurrentPassword}
            show={showCurrent}
            onToggle={() => setShowCurrent(!showCurrent)}
            autoComplete="current-password"
          />
          <PasswordField
            label="Nova Senha"
            value={newPassword}
            onChange={setNewPassword}
            show={showNew}
            onToggle={() => setShowNew(!showNew)}
            autoComplete="new-password"
            hint="Mínimo 8 caracteres"
          />
          <PasswordField
            label="Confirmar Nova Senha"
            value={confirmPassword}
            onChange={setConfirmPassword}
            show={showNew}
            onToggle={() => setShowNew(!showNew)}
            autoComplete="new-password"
          />

          {/* Strength indicator */}
          {newPassword && (
            <PasswordStrength password={newPassword} />
          )}

          {message && (
            <div className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm border ${
              messageOk
                ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 border-emerald-200 dark:border-emerald-800'
                : 'bg-red-50 dark:bg-red-950 text-red-700 border-red-200 dark:border-red-800'
            }`}>
              {messageOk
                ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                : <AlertCircle size={16} className="shrink-0 mt-0.5" />
              }
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !currentPassword || !newPassword || !confirmPassword}
            className="inline-flex items-center gap-2 bg-[var(--brand)] hover:bg-[var(--brand-dark)] disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
          >
            <Save size={15} />
            {loading ? 'Salvando...' : 'Alterar Senha'}
          </button>
        </form>
      </div>

      {/* System info */}
      <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] shadow-[var(--shadow-sm)] p-5">
        <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Sistema</h2>
        <div className="space-y-2 text-sm">
          <InfoRow label="Versão" value="1.0.0" />
          <InfoRow label="Plataforma" value="Tracker Ads · WhatsApp + Facebook CAPI" />
        </div>
      </div>
    </div>
  )
}

function PasswordField({
  label,
  value,
  onChange,
  show,
  onToggle,
  autoComplete,
  hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  show: boolean
  onToggle: () => void
  autoComplete?: string
  hint?: string
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide">
        {label}
      </label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          className="w-full px-3 py-2.5 pr-10 border border-[var(--border)] rounded-xl text-sm bg-[var(--bg-base)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)] focus:border-transparent"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {hint && <p className="mt-1 text-xs text-[var(--text-muted)]">{hint}</p>}
    </div>
  )
}

function PasswordStrength({ password }: { password: string }) {
  const score = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length

  const levels = [
    { label: 'Fraca',   color: 'bg-red-500'    },
    { label: 'Razoável',color: 'bg-orange-500' },
    { label: 'Boa',     color: 'bg-yellow-500' },
    { label: 'Forte',   color: 'bg-[var(--brand)]' },
  ]
  const level = levels[score - 1] ?? levels[0]

  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        {[1,2,3,4].map((i) => (
          <div
            key={i}
            className={`flex-1 h-1.5 rounded-full transition-colors duration-200 ${
              i <= score ? level.color : 'bg-[var(--border)]'
            }`}
          />
        ))}
      </div>
      <p className="text-xs text-[var(--text-muted)]">Força: <span className="font-medium">{level.label}</span></p>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-[var(--border)] last:border-0">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="text-[var(--text-secondary)] font-medium">{value}</span>
    </div>
  )
}
