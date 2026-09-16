import { createClient } from '@/lib/supabase/server'

export async function POST() {
  const supabase = await createClient()
  const { error } = await supabase.auth.signOut()

  if (error) {
    return Response.redirect(new URL('/login?error=logout_failed', globalThis.location?.origin || 'http://localhost:3000'))
  }

  return Response.redirect(new URL('/login', globalThis.location?.origin || 'http://localhost:3000'))
}
