'use client'

import { useState } from 'react'
import type { Client } from '@/types'
import WhatsAppConnect from '@/components/whatsapp/WhatsAppConnect'

export default function ClientEditForm({ client }: { client: Client }) {
  const [form, setForm] = useState({
    company_name: client.company_name,
    whatsapp_number: client.whatsapp_number,
    pixel_id: client.pixel_id,
    capi_token: client.capi_token,
    is_active: client.is_active,
    conversion_label: client.conversion_label ?? 'Comprou',
  })
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [testLoading, setTestLoading] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [testEventCode, setTestEventCode] = useState('')

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value, type, checked } = e.target
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  async function handleSave(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setSaveMsg('')

    const res = await fetch(`/api/admin/clients/${client.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    if (res.ok) {
      setSaveMsg('Salvo com sucesso!')
    } else {
      const json = await res.json()
      setSaveMsg(`Erro: ${json.error ?? 'Falha ao salvar.'}`)
    }
    setSaving(false)
    setTimeout(() => setSaveMsg(''), 4000)
  }

  async function handleTestCapi() {
    setTestLoading(true)
    setTestResult(null)

    const res = await fetch('/api/capi-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: client.id, testEventCode: testEventCode || undefined }),
    })

    const json = await res.json()

    if (json.success) {
      setTestResult({ success: true, message: `Evento de teste enviado com sucesso! Resposta: ${JSON.stringify(json.response)}` })
    } else {
      setTestResult({ success: false, message: `Falha no teste. Resposta: ${JSON.stringify(json.response ?? json.error)}` })
    }
    setTestLoading(false)
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSave} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <h2 className="text-base font-semibold text-gray-800">Configurações</h2>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Nome da Empresa" name="company_name" value={form.company_name} onChange={handleChange} required />
          <Field label="Número do WhatsApp" name="whatsapp_number" value={form.whatsapp_number} onChange={handleChange} required />
          <Field label="Pixel ID" name="pixel_id" value={form.pixel_id} onChange={handleChange} required />
          <Field label="CAPI Access Token" name="capi_token" value={form.capi_token} onChange={handleChange} required />
          <div className="col-span-2">
            <Field
              label="Etiqueta de Conversão"
              name="conversion_label"
              value={form.conversion_label}
              onChange={handleChange}
              required
              hint='Etiqueta do WhatsApp que dispara o evento Purchase no Facebook. Padrão: "Comprou". A comparação ignora maiúsculas e minúsculas.'
            />
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            name="is_active"
            checked={form.is_active}
            onChange={handleChange}
            className="w-4 h-4 rounded"
          />
          <span className="text-sm text-gray-700">Cliente ativo</span>
        </label>

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
          >
            {saving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
          {saveMsg && (
            <p className={`text-sm ${saveMsg.startsWith('Erro') ? 'text-red-600' : 'text-green-600'}`}>
              {saveMsg}
            </p>
          )}
        </div>
      </form>

      {/* WhatsApp connection — always visible for existing clients */}
      <WhatsAppConnect
        clientId={client.id}
        initialStatus={client.whatsapp_status ?? 'disconnected'}
      />

      {/* Test CAPI section */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Testar Integração CAPI</h2>
          <p className="text-sm text-gray-500 mt-1">
            Envia um evento de teste para o Facebook com um número fictício. Use o código de teste do Gerenciador de Eventos para verificar.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Código de Teste (opcional)
          </label>
          <input
            type="text"
            value={testEventCode}
            onChange={(e) => setTestEventCode(e.target.value)}
            placeholder="Ex: TEST12345"
            className="w-64 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          onClick={handleTestCapi}
          disabled={testLoading}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
        >
          {testLoading ? 'Testando...' : 'Testar CAPI'}
        </button>

        {testResult && (
          <div className={`rounded-lg px-4 py-3 text-sm ${testResult.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {testResult.message}
          </div>
        )}
      </div>
    </div>
  )
}

function Field({
  label,
  name,
  value,
  onChange,
  type = 'text',
  required,
  hint,
}: {
  label: string
  name: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  type?: string
  required?: boolean
  hint?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        required={required}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  )
}
