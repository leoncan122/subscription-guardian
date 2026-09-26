import webpush from 'web-push'
import { formatCurrency } from '@/utils/helpers'

let configured = false

function ensureConfigured(): void {
  if (configured) return
  // Same key the browser gets via NEXT_PUBLIC_VAPID_PUBLIC_KEY when
  // subscribing (src/utils/push-notifications.ts) - a VAPID public key
  // isn't secret, and NEXT_PUBLIC_ only controls whether Next.js also
  // inlines it into the client bundle, not whether server code can read it.
  // A second server-only copy would just be one more place to forget to
  // update if the key ever rotates.
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) {
    throw new Error('VAPID keys are not configured (NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)')
  }
  // The subject just identifies who's sending, for push services that want
  // to contact the sender about abuse - doesn't need to be a real inbox.
  webpush.setVapidDetails('mailto:support@subscription-guardian.app', publicKey, privateKey)
  configured = true
}

export interface PushTarget {
  endpoint: string
  p256dh: string
  auth: string
}

export type SendPushResult =
  | 'sent'
  // the push service says this subscription no longer exists (uninstalled,
  // permission revoked, browser data cleared) - the caller should delete it
  | 'gone'
  | 'failed'

export async function sendPush(
  target: PushTarget,
  payload: { title: string; body: string; url: string }
): Promise<SendPushResult> {
  ensureConfigured()
  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        data: { url: payload.url },
        tag: 'price-change',
      })
    )
    return 'sent'
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode
    if (statusCode === 404 || statusCode === 410) return 'gone'
    console.error('Failed to send push notification:', error)
    return 'failed'
  }
}

interface PriceChangeInfo {
  name: string
  oldAmount: number
  newAmount: number
  currency: string
}

// Notification copy, kept separate from the UI's i18n message files
// (src/i18n/messages/*) - this text is generated server-side by a cron job
// and never rendered through React/useTranslation, so it doesn't belong in
// that catalog.
const COPY: Record<string, {
  title: string
  single: (name: string, oldFormatted: string, newFormatted: string) => string
  multiple: (count: number) => string
}> = {
  es: {
    title: '💰 Cambio de precio detectado',
    single: (n, o, x) => `${n}: ${o} → ${x}`,
    multiple: (c) => `${c} de tus suscripciones cambiaron de precio`,
  },
  en: {
    title: '💰 Price change detected',
    single: (n, o, x) => `${n}: ${o} → ${x}`,
    multiple: (c) => `${c} of your subscriptions changed price`,
  },
  it: {
    title: '💰 Cambio di prezzo rilevato',
    single: (n, o, x) => `${n}: ${o} → ${x}`,
    multiple: (c) => `${c} dei tuoi abbonamenti hanno cambiato prezzo`,
  },
  fr: {
    title: '💰 Changement de prix détecté',
    single: (n, o, x) => `${n}: ${o} → ${x}`,
    multiple: (c) => `${c} de vos abonnements ont changé de prix`,
  },
  de: {
    title: '💰 Preisänderung erkannt',
    single: (n, o, x) => `${n}: ${o} → ${x}`,
    multiple: (c) => `${c} deiner Abos haben den Preis geändert`,
  },
  eu: {
    title: '💰 Prezio-aldaketa detektatuta',
    single: (n, o, x) => `${n}: ${o} → ${x}`,
    multiple: (c) => `Zure ${c} harpidetzek prezioa aldatu dute`,
  },
  pt: {
    title: '💰 Alteração de preço detetada',
    single: (n, o, x) => `${n}: ${o} → ${x}`,
    multiple: (c) => `${c} das tuas subscrições mudaram de preço`,
  },
}

const DEFAULT_LANGUAGE = 'en'

function resolvePushLanguage(locale: string | null | undefined): string {
  const base = locale?.split('-')[0]?.toLowerCase() ?? ''
  return base in COPY ? base : DEFAULT_LANGUAGE
}

export function buildPriceChangeNotification(
  locale: string | null | undefined,
  changes: PriceChangeInfo[]
): { title: string; body: string } {
  const copy = COPY[resolvePushLanguage(locale)]
  const numberFormatLocale = locale || 'en-US'

  if (changes.length === 1) {
    const change = changes[0]
    return {
      title: copy.title,
      body: copy.single(
        change.name,
        formatCurrency(change.oldAmount, change.currency, numberFormatLocale),
        formatCurrency(change.newAmount, change.currency, numberFormatLocale)
      ),
    }
  }

  return { title: copy.title, body: copy.multiple(changes.length) }
}
