import crypto from 'crypto'
import type { CapiPayload, CapiEvent } from '@/types'

const CAPI_VERSION = 'v19.0'
const CAPI_BASE = 'https://graph.facebook.com'

export function hashPhone(phone: string): string {
  // Normalize: strip non-digits, then SHA-256
  const normalized = phone.replace(/\D/g, '')
  return crypto.createHash('sha256').update(normalized).digest('hex')
}

export async function sendCapiEvent(
  pixelId: string,
  capiToken: string,
  phoneHashed: string,
  testEventCode?: string
): Promise<{ success: boolean; response: Record<string, unknown> }> {
  const event: CapiEvent = {
    event_name: 'Purchase',
    event_time: Math.floor(Date.now() / 1000),
    action_source: 'other',
    user_data: {
      ph: [phoneHashed],
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
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const json = (await res.json()) as Record<string, unknown>
    return { success: res.ok, response: json }
  } catch (err) {
    return {
      success: false,
      response: { error: String(err) },
    }
  }
}
