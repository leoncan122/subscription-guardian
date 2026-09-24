// Country / locale / currency options for the user's view configuration,
// plus best-effort detection of defaults from the browser.
//
// Currencies are limited to what the FX source (ECB rates via Frankfurter,
// see src/app/api/fx/route.ts) can convert, so every base currency the user
// picks can actually be converted to.

export const COUNTRIES = [
  { code: 'ES', label: 'España', flag: '🇪🇸', currency: 'EUR', locale: 'es-ES' },
  { code: 'GB', label: 'United Kingdom', flag: '🇬🇧', currency: 'GBP', locale: 'en-GB' },
  { code: 'IE', label: 'Ireland', flag: '🇮🇪', currency: 'EUR', locale: 'en-IE' },
  { code: 'PT', label: 'Portugal', flag: '🇵🇹', currency: 'EUR', locale: 'pt-PT' },
  { code: 'FR', label: 'France', flag: '🇫🇷', currency: 'EUR', locale: 'fr-FR' },
  { code: 'DE', label: 'Deutschland', flag: '🇩🇪', currency: 'EUR', locale: 'de-DE' },
  { code: 'IT', label: 'Italia', flag: '🇮🇹', currency: 'EUR', locale: 'it-IT' },
  { code: 'NL', label: 'Nederland', flag: '🇳🇱', currency: 'EUR', locale: 'nl-NL' },
  { code: 'BE', label: 'Belgique', flag: '🇧🇪', currency: 'EUR', locale: 'fr-BE' },
  { code: 'AT', label: 'Österreich', flag: '🇦🇹', currency: 'EUR', locale: 'de-AT' },
  { code: 'CH', label: 'Schweiz', flag: '🇨🇭', currency: 'CHF', locale: 'de-CH' },
  { code: 'US', label: 'United States', flag: '🇺🇸', currency: 'USD', locale: 'en-US' },
  { code: 'CA', label: 'Canada', flag: '🇨🇦', currency: 'CAD', locale: 'en-CA' },
  { code: 'MX', label: 'México', flag: '🇲🇽', currency: 'MXN', locale: 'es-MX' },
  { code: 'BR', label: 'Brasil', flag: '🇧🇷', currency: 'BRL', locale: 'pt-BR' },
  { code: 'AU', label: 'Australia', flag: '🇦🇺', currency: 'AUD', locale: 'en-AU' },
] as const

// UI language + number/date format. Only languages with a translation in
// src/i18n are offered; other stored locales still format numbers/dates but
// show the UI in the fallback language (see resolveLanguage).
export const LOCALES = [
  { code: 'es-ES', label: 'Español (España)' },
  { code: 'es-MX', label: 'Español (México)' },
  { code: 'eu-ES', label: 'Euskara' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'en-US', label: 'English (US)' },
  { code: 'fr-FR', label: 'Français' },
  { code: 'de-DE', label: 'Deutsch' },
  { code: 'it-IT', label: 'Italiano' },
  { code: 'pt-PT', label: 'Português (Portugal)' },
  { code: 'pt-BR', label: 'Português (Brasil)' },
] as const

export const CURRENCIES = ['EUR', 'GBP', 'USD', 'CHF', 'CAD', 'MXN', 'BRL', 'AUD', 'JPY', 'SEK', 'NOK', 'DKK', 'PLN'] as const

export const DEFAULT_COUNTRY = 'GB'

// Timezone is a better residence signal than browser language (an English
// browser in Madrid is still someone living in Spain), so check it first.
const TIMEZONE_COUNTRY: Record<string, string> = {
  'Europe/Madrid': 'ES', 'Atlantic/Canary': 'ES', 'Africa/Ceuta': 'ES',
  'Europe/London': 'GB', 'Europe/Dublin': 'IE', 'Europe/Lisbon': 'PT', 'Atlantic/Madeira': 'PT',
  'Europe/Paris': 'FR', 'Europe/Berlin': 'DE', 'Europe/Rome': 'IT', 'Europe/Amsterdam': 'NL',
  'Europe/Brussels': 'BE', 'Europe/Vienna': 'AT', 'Europe/Zurich': 'CH',
  'America/Mexico_City': 'MX', 'America/Sao_Paulo': 'BR', 'America/Toronto': 'CA', 'America/Vancouver': 'CA',
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Los_Angeles': 'US',
  'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU',
}

// Last-resort guess for region-less browser languages ("es", "fr").
const LANGUAGE_COUNTRY: Record<string, string> = {
  es: 'ES', ca: 'ES', eu: 'ES', gl: 'ES', en: 'GB', fr: 'FR', de: 'DE', it: 'IT', pt: 'PT', nl: 'NL',
}

export function getCountry(code: string | null | undefined) {
  return COUNTRIES.find((c) => c.code === code?.toUpperCase())
}

export function currencyForCountry(code: string | null | undefined): string {
  return getCountry(code)?.currency ?? 'EUR'
}

export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

export interface DetectedLocaleDefaults {
  country: string
  locale: string
  currency: string
  timezone: string
}

// Browser-only (reads navigator / Intl). Call from effects, not during render.
export function detectLocaleDefaults(): DetectedLocaleDefaults {
  const timezone = detectTimezone()
  const languages = typeof navigator !== 'undefined'
    ? (navigator.languages?.length ? navigator.languages : [navigator.language])
    : []

  const regionFromLanguage = languages
    .map((l) => l.split('-')[1]?.toUpperCase())
    .find((r) => r && getCountry(r))

  const countryFromLanguage = LANGUAGE_COUNTRY[languages[0]?.split('-')[0]?.toLowerCase() ?? '']

  const country = TIMEZONE_COUNTRY[timezone] ?? regionFromLanguage ?? countryFromLanguage ?? DEFAULT_COUNTRY

  // Keep the browser's language; if it has no region (plain "es"), pin it to
  // the detected country so number/date formatting matches where they live.
  const primary = languages[0] || getCountry(country)!.locale
  const locale = primary.includes('-') ? primary : `${primary}-${country}`

  return { country, locale, currency: currencyForCountry(country), timezone }
}
