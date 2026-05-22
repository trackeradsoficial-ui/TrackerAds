import { updateSession } from '@/lib/supabase/middleware'
import type { NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Aplica em todas as rotas, exceto:
     * - _next/static  (arquivos estáticos)
     * - _next/image   (otimização de imagem)
     * - favicon.ico
     * - /connect/*    (página pública de conexão WhatsApp)
     * - /api/connect/* (API pública de conexão WhatsApp)
     */
    '/((?!_next/static|_next/image|favicon.ico|connect|api/connect).*)',
  ],
}
