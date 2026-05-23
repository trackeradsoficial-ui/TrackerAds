export type UserRole = 'admin' | 'client'

export interface Profile {
  id: string
  role: UserRole
  client_id: string | null
  created_at: string
}

export interface Client {
  id: string
  company_name: string
  email: string
  whatsapp_number: string
  pixel_id: string
  capi_token: string
  is_active: boolean
  whatsapp_status: 'connected' | 'disconnected' | 'connecting'
  conversion_label: string
  created_at: string
}

export interface Lead {
  id: string
  client_id: string
  phone_raw: string
  phone_hashed: string
  label: string | null
  status: 'converted' | 'pending'
  facebook_event_sent: boolean
  facebook_event_response: Record<string, unknown> | null
  created_at: string
}

// Evolution API webhook payload shapes (simplified)
export interface EvolutionWebhookPayload {
  event: string
  instance: string
  data: EvolutionEventData
}

export interface EvolutionEventData {
  id?: string
  remoteJid?: string
  pushName?: string
  // label events
  labelName?: string
  contact?: {
    remoteJid?: string
    pushName?: string
  }
  // chats.upsert / contacts.upsert shapes
  phone?: string
}

// Facebook CAPI shapes
export interface CapiUserData {
  ph:  string[]   // telefone(s) hasheado(s) com SHA-256
  fn?: string[]   // primeiro nome hasheado com SHA-256
  ln?: string[]   // último nome hasheado com SHA-256
  client_ip_address?: string
  client_user_agent?: string
  fbc?: string
  fbp?: string
}

export interface CapiCustomData {
  currency?: string
  value?: number
  [key: string]: unknown
}

export interface CapiEvent {
  event_name: string
  event_time: number
  action_source: string
  user_data: CapiUserData
  custom_data?: CapiCustomData
}

export interface CapiPayload {
  data: CapiEvent[]
  test_event_code?: string
}

// Dashboard stats
export interface ClientStats {
  total_leads: number
  total_conversions: number
  conversion_rate: number
}
