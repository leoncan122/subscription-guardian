// Centralized constants for Next.js static export
// Derived from next.config.ts basePath for single-source-of-truth
export const BASE_PATH = '/subscription-guardian'

// Countries offered on the bank-connect screen. The actual TrueLayer
// "providers" value per country lives server-side in src/lib/truelayer/client.ts
// (COUNTRY_PROVIDERS) - keep the country codes here in sync with the keys there.
export const TRUELAYER_COUNTRIES = [
  { code: 'uk', label: 'United Kingdom', flag: '🇬🇧' },
  { code: 'es', label: 'España', flag: '🇪🇸' },
] as const

// ISO 3166-1 alpha-2 codes GoCardless's institutions endpoint expects, keyed
// by the same country codes used above for TrueLayer.
export const GOCARDLESS_COUNTRY_ISO: Record<string, string> = {
  uk: 'GB',
  es: 'ES',
}
