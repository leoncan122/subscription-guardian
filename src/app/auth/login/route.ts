import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const formData = await request.formData()
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return Response.redirect(new URL('/login?error=invalid_credentials', request.url))
  }

  return Response.redirect(new URL('/dashboard', request.url))
}
