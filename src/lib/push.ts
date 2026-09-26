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
  // tag groups notifications at the OS level: two pushes with the same tag
  // replace each other instead of stacking. Price-change and renewal alerts
  // use different tags so a day with both still shows both.
  payload: { title: string; body: string; url: string; tag: string }
): Promise<SendPushResult> {
  ensureConfigured()
  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        data: { url: payload.url },
        tag: payload.tag,
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

// Notification copy, kept separate from the UI's i18n message files
// (src/i18n/messages/*) - this text is generated server-side by a cron job
// and never rendered through React/useTranslation, so it doesn't belong in
// that catalog.

interface PriceChangeInfo {
  name: string
  oldAmount: number
  newAmount: number
  currency: string
}

const PRICE_CHANGE_COPY: Record<string, {
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
  return base in PRICE_CHANGE_COPY ? base : DEFAULT_LANGUAGE
}

export function buildPriceChangeNotification(
  locale: string | null | undefined,
  changes: PriceChangeInfo[]
): { title: string; body: string } {
  const copy = PRICE_CHANGE_COPY[resolvePushLanguage(locale)]
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

interface RenewalReminderInfo {
  name: string
  // always 1 or 3 - see the daily cron, which only ever reminds 1 or 3 days
  // before renewal_date
  daysUntil: number
}

const RENEWAL_COPY: Record<string, {
  title: string
  single: (name: string, daysUntil: number) => string
  multiple: (count: number) => string
}> = {
  es: {
    title: '📅 Renovación próxima',
    single: (n, d) => d === 1 ? `${n} se renueva mañana` : `${n} se renueva en 3 días`,
    multiple: (c) => `${c} de tus suscripciones se renuevan pronto`,
  },
  en: {
    title: '📅 Upcoming renewal',
    single: (n, d) => d === 1 ? `${n} renews tomorrow` : `${n} renews in 3 days`,
    multiple: (c) => `${c} of your subscriptions renew soon`,
  },
  it: {
    title: '📅 Rinnovo in arrivo',
    single: (n, d) => d === 1 ? `${n} si rinnova domani` : `${n} si rinnova tra 3 giorni`,
    multiple: (c) => `${c} dei tuoi abbonamenti si rinnovano presto`,
  },
  fr: {
    title: '📅 Renouvellement à venir',
    single: (n, d) => d === 1 ? `${n} se renouvelle demain` : `${n} se renouvelle dans 3 jours`,
    multiple: (c) => `${c} de vos abonnements se renouvellent bientôt`,
  },
  de: {
    title: '📅 Bevorstehende Verlängerung',
    single: (n, d) => d === 1 ? `${n} verlängert sich morgen` : `${n} verlängert sich in 3 Tagen`,
    multiple: (c) => `${c} deiner Abos verlängern sich bald`,
  },
  eu: {
    title: '📅 Berritze hurbila',
    single: (n, d) => d === 1 ? `${n} bihar berrituko da` : `${n} 3 egun barru berrituko da`,
    multiple: (c) => `Zure ${c} harpidetza laster berrituko dira`,
  },
  pt: {
    title: '📅 Renovação próxima',
    single: (n, d) => d === 1 ? `${n} renova amanhã` : `${n} renova em 3 dias`,
    multiple: (c) => `${c} das tuas subscrições renovam em breve`,
  },
}

export function buildRenewalReminderNotification(
  locale: string | null | undefined,
  reminders: RenewalReminderInfo[]
): { title: string; body: string } {
  const copy = RENEWAL_COPY[resolvePushLanguage(locale)]

  if (reminders.length === 1) {
    const reminder = reminders[0]
    return { title: copy.title, body: copy.single(reminder.name, reminder.daysUntil) }
  }

  return { title: copy.title, body: copy.multiple(reminders.length) }
}
