import { createHash } from 'crypto'

export function hashPhoneCrm(phone: string): string {
  const normalized = '55' + phone.replace(/\D/g, '')
  return createHash('sha256').update(normalized).digest('hex')
}
