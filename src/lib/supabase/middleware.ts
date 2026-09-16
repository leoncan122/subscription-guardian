import { type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = await createClient()

  const {
    data: { session },
  } = await supabaseResponse.auth.getSession()

  const response = await supabaseResponse.auth.getUser()

  // If user is not authenticated and trying to access protected routes
  if (!response.data.user && request.nextUrl.pathname.startsWith('/dashboard')) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return Response.redirect(url)
  }

  return supabaseResponse
}
