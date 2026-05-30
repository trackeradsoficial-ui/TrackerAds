'use client'

import { useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft,
  Upload,
  FileText,
  Send,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  Info,
} from 'lucide-react'

interface BatchResult {
  identificador: string
  success: boolean
  error?: string
}

interface RowInput {
  telefone?: string
  email?: string
  nome?: string
}

const CSV_EXEMPLO = `telefone,email,nome
5511999999999,cliente@email.com,João Silva
5511888888888,,Maria
5511777777777,outro@email.com,
5511666666666,,`

function parseCsvRows(text: string): RowInput[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return []

  // Detectar se a primeira linha é cabeçalho
  const firstLower = lines[0].toLowerCase()
  const isHeader = firstLower.includes('telefone') || firstLower.includes('email') || firstLower.includes('nome')
  const dataLines = isHeader ? lines.slice(1) : lines

  // Mapear índices de colunas pelo cabeçalho (ou usar posição padrão)
  let colTelefone = 0
  let colEmail    = 1
  let colNome     = 2

  if (isHeader) {
    const cols = lines[0].toLowerCase().split(',').map((c) => c.trim())
    colTelefone = cols.indexOf('telefone')
    colEmail    = cols.indexOf('email')
    colNome     = cols.indexOf('nome')
  }

  return dataLines.map((line) => {
    const parts = line.split(',')
    return {
      telefone: colTelefone >= 0 ? parts[colTelefone]?.trim() : undefined,
      email:    colEmail    >= 0 ? parts[colEmail]?.trim()    : undefined,
      nome:     colNome     >= 0 ? parts[colNome]?.trim()     : undefined,
    }
  }).filter((r) => r.telefone || r.email || r.nome)
}

export default function ImportPage() {
  const { id } = useParams<{ id: string }>()
  const fileRef = useRef<HTMLInputElement>(null)

  const today = new Date().toISOString().split('T')[0]

  const [csvText, setCsvText]       = useState('')
  const [eventDate, setEventDate]   = useState(today)
  const [eventName, setEventName]   = useState('Purchase')
  const [loading, setLoading]       = useState(false)
  const [progress, setProgress]   = useState(0)
  const [results, setResults]     = useState<BatchResult[] | null>(null)
  const [successCount, setSuccessCount] = useState(0)
  const [errorCount, setErrorCount]     = useState(0)
  const [globalError, setGlobalError]   = useState<string | null>(null)
  const [showExemplo, setShowExemplo]   = useState(false)

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      setCsvText(ev.target?.result as string)
    }
    reader.readAsText(file)
    if (fileRef.current) fileRef.current.value = ''
  }

  const parsedRows = parseCsvRows(csvText)

  async function handleImport() {
    setGlobalError(null)
    setResults(null)
    setProgress(0)

    if (parsedRows.length === 0) {
      setGlobalError('Cole ao menos uma linha com telefone, e-mail ou nome.')
      return
    }

    if (parsedRows.length > 500) {
      setGlobalError('Máximo de 500 registros por importação.')
      return
    }

    if (!eventDate) {
      setGlobalError('Selecione uma data para a conversão.')
      return
    }

    setLoading(true)

    const CHUNK = 50
    const allResults: BatchResult[] = []

    for (let i = 0; i < parsedRows.length; i += CHUNK) {
      const chunk = parsedRows.slice(i, i + CHUNK)

      try {
        const res = await fetch(`/api/admin/clients/${id}/conversions/batch`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ rows: chunk, eventDate, eventName }),
        })

        const json = await res.json()

        if (!res.ok) {
          setGlobalError(json.error ?? 'Erro ao processar lote.')
          setLoading(false)
          return
        }

        allResults.push(...(json.results as BatchResult[]))
      } catch {
        setGlobalError('Erro de conexão. Verifique sua internet e tente novamente.')
        setLoading(false)
        return
      }

      setProgress(Math.min(i + CHUNK, parsedRows.length))
    }

    setResults(allResults)
    setSuccessCount(allResults.filter((r) => r.success).length)
    setErrorCount(allResults.filter((r) => !r.success).length)
    setLoading(false)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Breadcrumb */}
      <div>
        <Link
          href={`/admin/clients/${id}`}
          className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] mb-3 transition-colors"
        >
          <ChevronLeft size={14} /> Voltar ao Cliente
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--brand-light)] flex items-center justify-center shrink-0">
            <Upload size={18} className="text-[var(--brand)]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">Importar Conversões Históricas</h1>
            <p className="text-sm text-[var(--text-secondary)]">Envie eventos em lote ao Facebook CAPI</p>
          </div>
        </div>
      </div>

      {/* Formulário */}
      <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] p-5 shadow-[var(--shadow-sm)] space-y-5">

        {/* Área CSV */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-[var(--text-primary)]">
              Dados para importação
            </label>
            <button
              type="button"
              onClick={() => setShowExemplo((v) => !v)}
              className="inline-flex items-center gap-1 text-xs text-[var(--brand)] hover:underline"
            >
              <Info size={12} />
              {showExemplo ? 'Ocultar exemplo' : 'Ver formato aceito'}
            </button>
          </div>

          {showExemplo && (
            <div className="mb-3 rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-3 space-y-2">
              <p className="text-xs font-medium text-[var(--text-secondary)]">Formato CSV aceito — todos os campos são opcionais, mas ao menos um deve estar preenchido por linha:</p>
              <pre className="text-xs font-mono text-[var(--text-primary)] whitespace-pre-wrap">{CSV_EXEMPLO}</pre>
              <ul className="text-xs text-[var(--text-muted)] space-y-0.5 list-disc list-inside">
                <li>A primeira linha pode ser cabeçalho — será detectada e ignorada automaticamente</li>
                <li>Telefone: somente dígitos, com DDI e DDD (ex: <span className="font-mono">5511999999999</span>)</li>
                <li>Campos vazios entre vírgulas são aceitos</li>
              </ul>
              <button
                type="button"
                onClick={() => setCsvText(CSV_EXEMPLO)}
                className="text-xs text-[var(--brand)] hover:underline"
              >
                Usar este exemplo
              </button>
            </div>
          )}

          <textarea
            rows={8}
            placeholder={"telefone,email,nome\n5511999999999,cliente@email.com,João Silva\n5511888888888,,Maria"}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            disabled={loading}
            className="w-full px-3 py-2.5 text-sm font-mono rounded-lg border border-[var(--border)] bg-[var(--bg-base)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)] resize-y disabled:opacity-50"
          />
          {parsedRows.length > 0 && (
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {parsedRows.length} registro{parsedRows.length !== 1 ? 's' : ''} detectado{parsedRows.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* Upload CSV */}
        <div>
          <p className="text-xs text-[var(--text-secondary)] mb-2">Ou importe de um arquivo CSV:</p>
          <label className="inline-flex items-center gap-2 cursor-pointer px-3 py-2 text-sm font-medium rounded-lg border border-[var(--border)] bg-[var(--bg-base)] text-[var(--text-secondary)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)] transition-colors">
            <FileText size={14} />
            Selecionar arquivo CSV
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={handleFileUpload}
              disabled={loading}
            />
          </label>
        </div>

        {/* Tipo de evento + Data */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
              Tipo de evento
            </label>
            <select
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              disabled={loading}
              className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg-base)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)] disabled:opacity-50"
            >
              <option value="Purchase">Purchase (Compra)</option>
              <option value="InitiateCheckout">InitiateCheckout (Carrinho)</option>
              <option value="Lead">Lead (Cadastro)</option>
            </select>
            <p className="text-xs text-[var(--text-muted)] mt-1">Evento que será enviado ao Facebook CAPI.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
              Data da conversão
            </label>
            <input
              type="date"
              value={eventDate}
              max={today}
              onChange={(e) => setEventDate(e.target.value)}
              disabled={loading}
              className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg-base)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)] disabled:opacity-50"
            />
            <p className="text-xs text-[var(--text-muted)] mt-1">Horário das 12h00 UTC dessa data.</p>
          </div>
        </div>

        {/* Erro global */}
        {globalError && (
          <div className="flex items-start gap-2 text-sm px-3 py-2.5 rounded-lg border text-red-700 bg-red-50 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{globalError}</span>
          </div>
        )}

        {/* Barra de progresso */}
        {loading && parsedRows.length > 0 && (
          <div>
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1.5">
              <span>Processando...</span>
              <span>{progress} / {parsedRows.length}</span>
            </div>
            <div className="w-full h-2 bg-[var(--bg-base)] rounded-full overflow-hidden border border-[var(--border)]">
              <div
                className="h-full bg-[var(--brand)] rounded-full transition-all duration-300"
                style={{ width: `${parsedRows.length > 0 ? (progress / parsedRows.length) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {/* Botão */}
        <button
          type="button"
          onClick={handleImport}
          disabled={loading || parsedRows.length === 0}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg bg-[var(--brand)] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        >
          {loading ? (
            <><Loader2 size={15} className="animate-spin" /> Importando...</>
          ) : (
            <><Send size={15} /> Importar e Enviar ao Facebook</>
          )}
        </button>
      </div>

      {/* Resumo final */}
      {results && !loading && (
        <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] p-5 shadow-[var(--shadow-sm)] space-y-4">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Resultado da Importação</h2>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800">
              <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
              <div>
                <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300">{successCount}</p>
                <p className="text-xs text-emerald-600 dark:text-emerald-400">enviados com sucesso</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
              <XCircle size={20} className="text-red-600 shrink-0" />
              <div>
                <p className="text-xl font-bold text-red-700 dark:text-red-300">{errorCount}</p>
                <p className="text-xs text-red-600 dark:text-red-400">com erro</p>
              </div>
            </div>
          </div>

          {/* Listagem de erros */}
          {errorCount > 0 && (
            <div>
              <p className="text-xs font-medium text-[var(--text-secondary)] mb-2">Registros com falha:</p>
              <ul className="space-y-1 max-h-48 overflow-y-auto">
                {results.filter((r) => !r.success).map((r, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs">
                    <XCircle size={11} className="text-red-500 shrink-0" />
                    <span className="font-mono text-[var(--text-secondary)]">{r.identificador}</span>
                    <span className="text-[var(--text-muted)]">— {r.error}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setResults(null)
              setCsvText('')
              setProgress(0)
            }}
            className="text-sm text-[var(--brand)] hover:underline"
          >
            Fazer nova importação
          </button>
        </div>
      )}
    </div>
  )
}
