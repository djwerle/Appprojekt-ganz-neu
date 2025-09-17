import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnon) {
  console.warn('[Supabase] ENV Variablen fehlen. Hast du .env.local angelegt und den Dev-Server neu gestartet?')
}

export const supabase = createClient(supabaseUrl, supabaseAnon)
