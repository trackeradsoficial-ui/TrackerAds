'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Plus, AlertCircle } from 'lucide-react'

export default function NewClientPage() {
  const router = useRouter()

  const [form, setForm] = useState({
    company_name:    '',
    email:           '',
    whatsapp_number: '',
    pixel_id:        '',
    capi_token:      '',
    password:        '',
  })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res  = await fetch('/api/admin/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()

      if (!res.ok) {
        setError(json.error ?? 'Erro ao criar cliente.')
        setLoading(false)
        return
      }

      router.push(`/admin/clients/${json.client.id}`)
      router.refresh()
    } catch {
      setError('Erro de conexão. Tente novamente.')
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Breadcrumb */}
      <div>
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] mb-3 transition-colors"
        >
          <ChevronLeft size={14} /> Clientes
        </Link>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Novo Cliente</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">Preencha os dados da empresa e da integração</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Company data */}
        <Section title="Dados da Empresa">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Nome da Empresa" name="company_name" value={form.company_name} onChange={handleChange} required placeholder="Ex: Loja do João" />
            <Field label="Email de Login" name="email" type="email" value={form.email} onChange={handleChange} required placeholder="joao@empresa.com" />
            <Field label="Número do WhatsApp" name="whatsapp_number" value={form.whatsapp_number} onChange={handleChange} placeholder="5511999999999" required hint="Com código do país: 55 (Brasil)" />
            <Field label="Senha de Acesso" name="password" type="password" value={form.password} onChange={handleChange} placeholder="Mínimo 8 caracteres" required />
          </div>
        </Section>

        {/* Facebook integration */}
        <Section title="Integração Facebook CAPI">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Pixel ID" name="pixel_id" value={form.pixel_id} onChange={handleChange} required placeholder="123456789012345" />
            <Field label="CAPI Access Token" name="capi_token" type="password" value={form.capi_token} onChange={handleChange} required placeholder="EAABcD..." />
          </div>
        </Section>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3">
            <AlertCircle size={15} className="shrink-0" />
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 bg-[var(--brand)] hover:bg-[var(--brand-dark)] disabled:opacity-60 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors shadow-sm"
          >
            <Plus size={15} />
            {loading ? 'Criando...' : 'Criar Cliente'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-4 py-2.5 rounded-xl border border-[var(--border)] hover:bg-[var(--bg-base)] transition-colors"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] shadow-[var(--shadow-sm)] overflow-hidden">
      <div className="px-5 py-3.5 border-b border-[var(--border)] bg-[var(--bg-base)]">
        <h2 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function Field({
  label, name, value, onChange, type = 'text', placeholder, required, hint,
}: {
  label: string
  name: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  type?: string
  placeholder?: string
  required?: boolean
  hint?: string
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide">
        {label}
      </label>
      <input
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className="w-full px-3 py-2.5 border border-[var(--border)] rounded-xl text-sm bg-[var(--bg-base)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)] focus:border-transparent placeholder:text-[var(--text-muted)] transition-colors"
      />
      {hint && <p className="mt-1 text-xs text-[var(--text-muted)]">{hint}</p>}
    </div>
  )
}
