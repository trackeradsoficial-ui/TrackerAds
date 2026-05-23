import crypto from 'crypto'
import type { CapiPayload, CapiEvent } from '@/types'

const CAPI_VERSION = 'v19.0'
const CAPI_BASE = 'https://graph.facebook.com'

// ── Funções de hash ──────────────────────────────────────────────────────────

/** SHA-256 de uma string já normalizada. */
function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

/** Normaliza e hasheia um telefone (remove não-dígitos, aplica SHA-256). */
export function hashPhone(phone: string): string {
  const normalized = phone.replace(/\D/g, '')
  return sha256(normalized)
}

/**
 * Normaliza e hasheia um campo de nome para o CAPI.
 * Facebook exige: letras minúsculas, sem espaços extras, sem acentos especiais removidos.
 * Referência: https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters
 */
export function hashName(name: string): string {
  const normalized = name.trim().toLowerCase()
  return sha256(normalized)
}

// ── Dados de nome estruturados ───────────────────────────────────────────────

export interface ContactName {
  /** Primeiro nome (ex.: "João") */
  firstName?: string
  /** Último nome / sobrenome (ex.: "Silva") */
  lastName?: string
}

/**
 * Extrai primeiro e último nome de um nome completo.
 * Exemplos:
 *   "João Silva"       → { firstName: "João", lastName: "Silva" }
 *   "Maria Clara Dias" → { firstName: "Maria", lastName: "Dias" }
 *   "Pedro"            → { firstName: "Pedro", lastName: undefined }
 */
export function splitName(fullName: string): ContactName {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return {}
  return {
    firstName: parts[0],
    lastName:  parts.length > 1 ? parts[parts.length - 1] : undefined,
  }
}

// ── Envio do evento CAPI ─────────────────────────────────────────────────────

export interface CapiContactData {
  phoneHashed:      string
  firstNameHashed?: string
  lastNameHashed?:  string
}

export async function sendCapiEvent(
  pixelId:        string,
  capiToken:      string,
  phoneHashed:    string,
  testEventCode?: string,
  contact?:       CapiContactData
): Promise<{ success: boolean; response: Record<string, unknown> }> {

  const event: CapiEvent = {
    event_name:    'Purchase',
    event_time:    Math.floor(Date.now() / 1000),
    action_source: 'other',
    user_data: {
      ph: [contact?.phoneHashed ?? phoneHashed],
      // fn e ln só são incluídos quando disponíveis
      ...(contact?.firstNameHashed  ? { fn: [contact.firstNameHashed] }  : {}),
      ...(contact?.lastNameHashed   ? { ln: [contact.lastNameHashed]  }  : {}),
    },
    custom_data: {
      currency: 'BRL',
      value: 1,
    },
  }

  const payload: CapiPayload = {
    data: [event],
    ...(testEventCode ? { test_event_code: testEventCode } : {}),
  }

  const url = `${CAPI_BASE}/${CAPI_VERSION}/${pixelId}/events?access_token=${capiToken}`

  try {
    const res  = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    })

    const json = (await res.json()) as Record<string, unknown>
    return { success: res.ok, response: json }
  } catch (err) {
    return {
      success:  false,
      response: { error: String(err) },
    }
  }
}
