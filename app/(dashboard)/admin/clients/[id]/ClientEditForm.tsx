'use client'

import { useState } from 'react'
import type { Client } from '@/types'
import WhatsAppConnect from '@/components/whatsapp/WhatsAppConnect'
import {
  Save,
  FlaskConical,
  Settings,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
} from 'lucide-react'

export default function ClientEditForm({ client }: { client: Client }) {
  const [form, setForm] = useState({
    company_name:        client.company_name,
    whatsapp_number:     client.whatsapp_number,
    pixel_id:            client.pixel_id,
    capi_token:          client.capi_token,
    is_active:           client.is_active,
    conversion_label:    client.conversion_label ?? 'Comprou',
    conversion_label_id: client.conversion_label_id ?? '',
  })
  const [saving,      setSaving]      = useState(false)
  const [saveMsg,     setSaveMsg]     = useState('')
  const [saveMsgOk,   setSaveMsgOk]   = useState(true)
  const [testLoading, setTestLoading] = useState(false)
  const [testResult,  setTestResult]  = useState<{ success: boolean; message: string } | null>(null)
  const [testEventCode, setTestEventCode] = useState('')
  const [copiedToken, setCopiedToken] = useState(false)
  const [copiedPixel, setCopiedPixel] = useState(false)

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
      setSaveMsgOk(true)
      setSaveMsg('Alterações salvas com sucesso!')
    } else {
      const json = await res.json()
      setSaveMsgOk(false)
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
      setTestResult({
        success: true,
        message: `Evento de teste enviado com sucesso! Resposta: ${JSON.stringify(json.response)}`,
      })
    } else {
      setTestResult({
        success: false,
        message: `Falha no teste. Resposta: ${JSON.stringify(json.response ?? json.error)}`,
      })
    }
    setTestLoading(false)
  }

  async function copyToClipboard(text: string, setter: (v: boolean) => void) {
    try {
      await navigator.clipboard.writeText(text)
      setter(true)
      setTimeout(() => setter(false), 2500)
    } catch {}
  }

  return (
    <div className="space-y-5">
      {/* Settings form */}
      <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] shadow-[var(--shadow-sm)] overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-[var(--border)]">
          <Settings size={16} className="text-[var(--text-muted)]" />
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Configurações</h2>
        </div>

        <form onSubmit={handleSave} className="p-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label="Nome da Empresa"
              name="company_name"
              value={form.company_name}
              onChange={handleChange}
              required
            />
            <Field
              label="Número do WhatsApp"
              name="whatsapp_number"
              value={form.whatsapp_number}
              onChange={handleChange}
              required
              hint="Ex: 5511999999999"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide">
                Pixel ID
              </label>
              <div className="flex gap-2">
                <input
                  name="pixel_id"
                  type="text"
                  value={form.pixel_id}
                  onChange={handleChange}
                  required
                  className="flex-1 px-3 py-2.5 border border-[var(--border)] rounded-xl text-sm bg-[var(--bg-base)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)] focus:border-transparent transition-colors"
                />
                <button
                  type="button"
                  onClick={() => copyToClipboard(form.pixel_id, setCopiedPixel)}
                  className="px-3 py-2 border border-[var(--border)] rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-base)] transition-colors"
                  title="Copiar Pixel ID"
                >
                  {copiedPixel ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide">
                CAPI Access Token
              </label>
              <div className="flex gap-2">
                <input
                  name="capi_token"
                  type="password"
                  value={form.capi_token}
                  onChange={handleChange}
                  required
                  className="flex-1 px-3 py-2.5 border border-[var(--border)] rounded-xl text-sm bg-[var(--bg-base)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)] focus:border-transparent transition-colors"
                />
                <button
                  type="button"
                  onClick={() => copyToClipboard(form.capi_token, setCopiedToken)}
                  className="px-3 py-2 border border-[var(--border)] rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-base)] transition-colors"
                  title="Copiar Token"
                >
                  {copiedToken ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label="Etiqueta de Conversão"
              name="conversion_label"
              value={form.conversion_label}
              onChange={handleChange}
              required
              hint='Nome da etiqueta do WhatsApp que dispara o Purchase. Padrão: "Comprou". Ignorado no labels.association se o ID estiver preenchido.'
            />
            <Field
              label="ID da Etiqueta (WhatsApp Business)"
              name="conversion_label_id"
              value={form.conversion_label_id}
              onChange={handleChange}
              hint='ID numérico da etiqueta (ex: "4"). Usado para comparação no evento labels.association. Deixe vazio para usar o nome acima.'
            />
          </div>

          {/* Active toggle */}
          <label className="flex items-center gap-3 cursor-pointer group">
            <div className={`relative w-10 h-5.5 rounded-full transition-colors duration-200 ${
              form.is_active ? 'bg-[var(--brand)]' : 'bg-[var(--border-dark)]'
            }`}>
              <input
                type="checkbox"
                name="is_active"
                checked={form.is_active}
                onChange={handleChange}
                className="sr-only"
              />
              <div className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 rounded-full bg-white shadow-sm transform transition-transform duration-200 ${
                form.is_active ? 'translate-x-4.5' : 'translate-x-0'
              }`} />
            </div>
            <span className="text-sm font-medium text-[var(--text-primary)]">Cliente ativo</span>
            <span className="text-xs text-[var(--text-muted)]">
              {form.is_active ? 'Eventos serão processados' : 'Eventos serão ignorados'}
            </span>
          </label>

          {/* Save button */}
          <div className="flex items-center gap-4 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 bg-[var(--brand)] hover:bg-[var(--brand-dark)] disabled:opacity-60 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
            >
              <Save size={15} />
              {saving ? 'Salvando...' : 'Salvar Alterações'}
            </button>

            {saveMsg && (
              <div className={`flex items-center gap-1.5 text-sm ${saveMsgOk ? 'text-emerald-600' : 'text-red-600'}`}>
                {saveMsgOk
                  ? <CheckCircle2 size={15} />
                  : <AlertCircle size={15} />
                }
                {saveMsg}
              </div>
            )}
          </div>
        </form>
      </div>

      {/* WhatsApp connection */}
      <WhatsAppConnect
        clientId={client.id}
        initialStatus={client.whatsapp_status ?? 'disconnected'}
      />

      {/* Test CAPI */}
      <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] shadow-[var(--shadow-sm)] overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-[var(--border)]">
          <FlaskConical size={16} className="text-[var(--text-muted)]" />
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Testar Integração CAPI</h2>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            Envia um evento de teste para o Facebook com um número fictício. Use o código de teste do Gerenciador de Eventos para verificar.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide">
                Código de Teste (opcional)
              </label>
              <input
                type="text"
                value={testEventCode}
                onChange={(e) => setTestEventCode(e.target.value)}
                placeholder="Ex: TEST12345"
                className="w-full px-3 py-2.5 border border-[var(--border)] rounded-xl text-sm bg-[var(--bg-base)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)] focus:border-transparent"
              />
            </div>

            <div className="flex items-end">
              <button
                onClick={handleTestCapi}
                disabled={testLoading}
                className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors whitespace-nowrap"
              >
                <FlaskConical size={15} />
                {testLoading ? 'Testando...' : 'Testar CAPI'}
              </button>
            </div>
          </div>

          {testResult && (
            <div className={`flex items-start gap-3 rounded-xl px-4 py-3 text-sm border ${
              testResult.success
                ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 border-emerald-200 dark:border-emerald-800'
                : 'bg-red-50 dark:bg-red-950 text-red-700 border-red-200 dark:border-red-800'
            }`}>
              {testResult.success
                ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                : <AlertCircle size={16} className="shrink-0 mt-0.5" />
              }
              <span className="break-all">{testResult.message}</span>
            </div>
          )}
        </div>
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
      <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide">
        {label}
      </label>
      <input
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        required={required}
        className="w-full px-3 py-2.5 border border-[var(--border)] rounded-xl text-sm bg-[var(--bg-base)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)] focus:border-transparent transition-colors"
      />
      {hint && <p className="mt-1.5 text-xs text-[var(--text-muted)]">{hint}</p>}
    </div>
  )
}
