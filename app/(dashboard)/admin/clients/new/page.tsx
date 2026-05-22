'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NewClientPage() {
  const router = useRouter()

  const [form, setForm] = useState({
    company_name: '',
    email: '',
    whatsapp_number: '',
    pixel_id: '',
    capi_token: '',
    password: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/admin/clients', {
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

      // Redirect to client edit page so WhatsApp can be connected immediately
      router.push(`/admin/clients/${json.client.id}`)
      router.refresh()
    } catch {
      setError('Erro de conexão. Tente novamente.')
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Novo Cliente</h1>
        <p className="text-sm text-gray-500 mt-1">Preencha os dados da empresa e da integração</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <Section title="Dados da Empresa">
          <Field label="Nome da Empresa" name="company_name" value={form.company_name} onChange={handleChange} required />
          <Field label="Email de Login" name="email" type="email" value={form.email} onChange={handleChange} required />
          <Field label="Número do WhatsApp" name="whatsapp_number" value={form.whatsapp_number} onChange={handleChange} placeholder="5511999999999" required />
          <Field label="Senha de Acesso" name="password" type="password" value={form.password} onChange={handleChange} placeholder="Mínimo 8 caracteres" required />
        </Section>

        <hr className="border-gray-100" />

        <Section title="Integração Facebook">
          <Field label="Pixel ID" name="pixel_id" value={form.pixel_id} onChange={handleChange} required />
          <Field label="CAPI Access Token" name="capi_token" value={form.capi_token} onChange={handleChange} required />
        </Section>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
          >
            {loading ? 'Criando...' : 'Criar Cliente'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="text-sm text-gray-600 hover:text-gray-900 px-4 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
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
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{title}</h2>
      {children}
    </div>
  )
}

function Field({
  label,
  name,
  value,
  onChange,
  type = 'text',
  placeholder,
  required,
}: {
  label: string
  name: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  type?: string
  placeholder?: string
  required?: boolean
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    </div>
  )
}
