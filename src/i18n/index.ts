'use client'

import { useEffect, useMemo } from 'react'
import { useSettings } from '@/contexts/SettingsContext'
import { en } from './messages/en'
import { es } from './messages/es'
import { it } from './messages/it'
import { fr } from './messages/fr'
import { de } from './messages/de'
import { eu } from './messages/eu'
import { pt } from './messages/pt'

// UI languages. The language is derived from the user's formatting locale
// (UserSettings.locale, e.g. 'es-MX' -> 'es'), so one setting drives both
// the texts and number/date formatting.
export const LANGUAGES = ['es', 'en', 'it', 'fr', 'de', 'eu', 'pt'] as const
export type Language = (typeof LANGUAGES)[number]

export const DEFAULT_LANGUAGE: Language = 'en'

// Same shape as the English messages, with every leaf a string.
type DeepStrings<T> = { [K in keyof T]: T[K] extends string ? string : DeepStrings<T[K]> }
export type Messages = DeepStrings<typeof en>

const MESSAGES: Record<Language, Messages> = { en, es, it, fr, de, eu, pt }

// Languages without a translation that have an obvious second choice
// (Catalan and Galician speakers in Spain read Spanish).
const LANGUAGE_FALLBACK: Record<string, Language> = { ca: 'es', gl: 'es' }

export function resolveLanguage(locale: string | null | undefined): Language {
  const base = locale?.split('-')[0]?.toLowerCase() ?? ''
  if ((LANGUAGES as readonly string[]).includes(base)) return base as Language
  return LANGUAGE_FALLBACK[base] ?? DEFAULT_LANGUAGE
}

// Dotted key paths ('dashboard.connect'); plural variants ('x_one',
// 'x_other') collapse into their base key ('x'), which needs `count`.
type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>
}[keyof T & string]
type StripPlural<K> = K extends `${infer B}_${'zero' | 'one' | 'two' | 'few' | 'many' | 'other'}` ? B : K
export type MessageKey = StripPlural<Leaves<Messages>>

export type TranslateVars = Record<string, string | number>
export type Translate = (key: MessageKey, vars?: TranslateVars) => string

function lookup(messages: Messages, path: string): string | undefined {
  let node: unknown = messages
  for (const part of path.split('.')) {
    if (node == null || typeof node !== 'object') return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === 'string' ? node : undefined
}

function resolve(lang: Language, key: string, count: number | undefined): string | undefined {
  const messages = MESSAGES[lang]
  if (typeof count === 'number') {
    const form = new Intl.PluralRules(lang).select(count)
    return lookup(messages, `${key}_${form}`) ?? lookup(messages, `${key}_other`) ?? lookup(messages, key)
  }
  return lookup(messages, key)
}

export function createTranslator(lang: Language): Translate {
  return (key, vars) => {
    const count = typeof vars?.count === 'number' ? vars.count : undefined
    const template = resolve(lang, key, count) ?? resolve(DEFAULT_LANGUAGE, key, count) ?? key
    if (!vars) return template
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in vars ? String(vars[name]) : match
    )
  }
}

// Texts in the signed-in user's language (or the browser's, signed out).
export function useTranslation() {
  const { settings } = useSettings()
  const lang = resolveLanguage(settings.locale)
  const t = useMemo(() => createTranslator(lang), [lang])
  return { t, lang, locale: settings.locale }
}

// Keeps <html lang> in step with the UI language (screen readers,
// hyphenation, browser translation prompts).
export function DocumentLanguage() {
  const { lang } = useTranslation()
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])
  return null
}

// Label for a category / billing cycle value; values outside the known set
// (e.g. from older rows) are shown as-is.
export function categoryLabel(t: Translate, category: string): string {
  const key = `categories.${category}` as MessageKey
  const label = t(key)
  return label === key ? category : label
}

export function billingCycleLabel(t: Translate, cycle: string): string {
  const key = `billingCycles.${cycle}` as MessageKey
  const label = t(key)
  return label === key ? cycle : label
}

export function renewalText(t: Translate, daysUntil: number): string {
  if (daysUntil <= 0) return t('renewal.dueToday')
  if (daysUntil === 1) return t('renewal.tomorrow')
  return t('renewal.inDays', { count: daysUntil })
}
