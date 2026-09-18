// Best-effort client IP extraction for the TrueLayer X-PSU-IP header.
// Next.js Route Handlers don't expose a reliable request.ip, so this reads
// the headers a reverse proxy/load balancer typically sets.
export function getClientIp(request: Request): string | undefined {
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) return forwardedFor.split(',')[0].trim()

  const realIp = request.headers.get('x-real-ip')
  if (realIp) return realIp

  return undefined
}
