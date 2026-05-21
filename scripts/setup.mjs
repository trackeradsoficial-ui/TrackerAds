import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://atfylxfnvpkutwwqiseq.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0ZnlseGZudnBrdXR3d3Fpc2VxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODg2Mzg2MCwiZXhwIjoyMDk0NDM5ODYwfQ.xwlTY-5mxLUdXM8YqOhK2WnRMkaXeiguXu1TsdlvpGM'

// Project ref extracted from URL
const PROJECT_REF = 'atfylxfnvpkutwwqiseq'

const ADMIN_EMAIL = 'adrielgodoymarketingdigital@gmail.com'
const ADMIN_PASSWORD = 'Admin@123456'

async function runSQL() {
  console.log('▶ Executando SQL de migração...')
  const sql = readFileSync('./supabase/migrations/001_initial_schema.sql', 'utf8')

  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  })

  if (!res.ok) {
    const text = await res.text()
    // Try alternative endpoint
    console.log('  Tentando endpoint alternativo...')
    return runSQLViaRPC()
  }

  console.log('✓ SQL executado com sucesso')
  return true
}

async function runSQLViaRPC() {
  const sql = readFileSync('./supabase/migrations/001_initial_schema.sql', 'utf8')

  // Split into individual statements and run via REST
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  })

  // Run each statement individually via pg_query RPC if available
  const { data, error } = await supabase.rpc('exec_sql', { sql })
  if (error) {
    console.log('  RPC exec_sql não disponível, usando Management API...')
    return runSQLViaManagementAPI()
  }
  console.log('✓ SQL executado via RPC')
  return true
}

async function runSQLViaManagementAPI() {
  const sql = readFileSync('./supabase/migrations/001_initial_schema.sql', 'utf8')

  // Use Supabase Management API with service role as personal access token
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  })

  const text = await res.text()
  console.log('Management API response:', res.status, text.slice(0, 200))

  if (!res.ok) {
    console.log('\n⚠ Não foi possível executar o SQL via API automaticamente.')
    console.log('  Execute manualmente no Supabase SQL Editor:')
    console.log('  https://supabase.com/dashboard/project/' + PROJECT_REF + '/sql/new')
    return false
  }

  console.log('✓ SQL executado')
  return true
}

async function createAdminUser() {
  console.log('\n▶ Criando usuário admin...')
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  })

  // Check if already exists
  const { data: existing } = await supabase.auth.admin.listUsers()
  const alreadyExists = existing?.users?.find(u => u.email === ADMIN_EMAIL)

  if (alreadyExists) {
    console.log('  Usuário admin já existe, verificando profile...')
    await ensureAdminProfile(supabase, alreadyExists.id)
    return alreadyExists
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: { role: 'admin' },
  })

  if (error) {
    console.error('✗ Erro ao criar usuário:', error.message)
    return null
  }

  console.log('✓ Usuário admin criado:', data.user.email)
  await ensureAdminProfile(supabase, data.user.id)
  return data.user
}

async function ensureAdminProfile(supabase, userId) {
  // Check if profile exists (trigger should have created it)
  await new Promise(r => setTimeout(r, 500))

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', userId)
    .single()

  if (profile) {
    if (profile.role !== 'admin') {
      await supabase.from('profiles').update({ role: 'admin' }).eq('id', userId)
      console.log('✓ Profile atualizado para admin')
    } else {
      console.log('✓ Profile admin já correto')
    }
  } else {
    // Trigger didn't fire (tables not created yet) — insert manually
    const { error } = await supabase
      .from('profiles')
      .insert({ id: userId, role: 'admin', client_id: null })

    if (error) {
      console.error('✗ Erro ao criar profile:', error.message)
    } else {
      console.log('✓ Profile admin criado manualmente')
    }
  }
}

async function main() {
  console.log('═══════════════════════════════════════')
  console.log(' Tracker Ads — Setup Automático')
  console.log('═══════════════════════════════════════\n')

  const sqlOk = await runSQL()
  const user = await createAdminUser()

  console.log('\n═══════════════════════════════════════')
  if (user) {
    console.log('✓ Setup concluído!\n')
    console.log('  Login admin:')
    console.log('  Email:  ', ADMIN_EMAIL)
    console.log('  Senha:  ', ADMIN_PASSWORD)
    console.log('\n  Acesse: http://localhost:3000')
  } else {
    console.log('⚠ Setup parcialmente concluído.')
    console.log('  Verifique os erros acima.')
  }
  console.log('═══════════════════════════════════════')
}

main().catch(console.error)
