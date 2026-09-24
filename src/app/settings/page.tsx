'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { UserSettings } from '@/lib/supabase/settings';
import { COUNTRIES, LOCALES, CURRENCIES, getCountry } from '@/lib/locale';
import { formatCurrency } from '@/utils/helpers';
import { useTranslation } from '@/i18n';

const inputClass =
  'w-full bg-gray-800 text-white px-3 py-2 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none text-sm';

export default function SettingsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { settings, loading: settingsLoading } = useSettings();

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [user, authLoading, router]);

  if (authLoading || settingsLoading || !user) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return <SettingsForm initial={settings} />;
}

function SettingsForm({ initial }: { initial: UserSettings }) {
  const router = useRouter();
  const { updateSettings } = useSettings();
  const { t } = useTranslation();
  const [form, setForm] = useState<UserSettings>(initial);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  const timezones = useMemo(() => {
    try {
      const all = Intl.supportedValuesOf('timeZone');
      return all.includes(form.timezone) ? all : [form.timezone, ...all];
    } catch {
      return [form.timezone];
    }
  }, [form.timezone]);

  // Include stored values that aren't in the curated lists (e.g. a browser
  // locale like "en-IE") so the selects never silently show another value.
  const localeOptions = LOCALES.some((l) => l.code === form.locale)
    ? LOCALES
    : [{ code: form.locale, label: form.locale }, ...LOCALES];
  const currencyOptions = (CURRENCIES as readonly string[]).includes(form.currency)
    ? CURRENCIES
    : [form.currency, ...CURRENCIES];

  const set = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setStatus('idle');
  };

  const handleCountryChange = (code: string) => {
    // Moving country usually means a new currency too - follow it unless
    // the user had already picked something other than the old default.
    const followCurrency = form.currency === getCountry(form.country)?.currency;
    setForm((prev) => ({
      ...prev,
      country: code,
      currency: followCurrency ? getCountry(code)?.currency ?? prev.currency : prev.currency,
    }));
    setStatus('idle');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const ok = await updateSettings({
      ...form,
      // Saving here counts as confirming the detected defaults.
      onboardedAt: form.onboardedAt ?? new Date().toISOString(),
    });
    setSaving(false);
    setStatus(ok ? 'saved' : 'error');
  };

  const preview = `${formatCurrency(1234.5, form.currency, form.locale)} · ${safeDate(form.locale, form.timezone)}`;

  return (
    <div className="min-h-screen bg-gray-950 pb-20">
      <form onSubmit={handleSave} className="p-4 space-y-5 max-w-lg mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-white mb-2">{t('settings.title')}</h1>
          <p className="text-gray-400 text-sm">
            {t('settings.intro')}
          </p>
        </div>

        <div>
          <label className="text-xs text-gray-400">{t('settings.country')}</label>
          <select value={form.country} onChange={(e) => handleCountryChange(e.target.value)} className={inputClass}>
            {!getCountry(form.country) && <option value={form.country}>{form.country}</option>}
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{c.flag} {c.label}</option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">{t('settings.countryHint')}</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-400">{t('settings.baseCurrency')}</label>
            <select value={form.currency} onChange={(e) => set('currency', e.target.value)} className={inputClass}>
              {currencyOptions.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400">{t('settings.language')}</label>
            <select value={form.locale} onChange={(e) => set('locale', e.target.value)} className={inputClass}>
              {localeOptions.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </div>
        </div>

        <p className="text-xs text-gray-500 -mt-3">{t('settings.preview')} <span className="text-gray-300">{preview}</span></p>

        <div>
          <label className="text-xs text-gray-400">{t('settings.timezone')}</label>
          <select value={form.timezone} onChange={(e) => set('timezone', e.target.value)} className={inputClass}>
            {timezones.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">{t('settings.timezoneHint')}</p>
        </div>

        <div>
          <label className="text-xs text-gray-400">{t('settings.payday')}</label>
          <select
            value={form.payday ?? ''}
            onChange={(e) => set('payday', e.target.value ? Number(e.target.value) : null)}
            className={inputClass}
          >
            <option value="">{t('settings.paydayNotSet')}</option>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>{t('settings.paydayOption', { day: d })}</option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">{t('settings.paydayHint')}</p>
        </div>

        <label className="flex items-center justify-between bg-gray-900 rounded-xl p-4 border border-gray-800">
          <span className="text-sm text-gray-300">{t('settings.notifications')}</span>
          <input
            type="checkbox"
            checked={form.notificationsEnabled}
            onChange={(e) => set('notificationsEnabled', e.target.checked)}
            className="w-4 h-4 accent-blue-500"
          />
        </label>

        <button
          type="submit"
          disabled={saving}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-medium transition-colors"
        >
          {saving ? t('common.saving') : t('common.save')}
        </button>
        {status === 'saved' && <p className="text-sm text-green-400 text-center">{t('settings.saved')}</p>}
        {status === 'error' && <p className="text-sm text-red-400 text-center">{t('settings.saveFailed')}</p>}

        <button
          type="button"
          onClick={() => router.push('/dashboard')}
          className="w-full py-3 text-gray-400 text-sm hover:text-white transition-colors"
        >
          {t('common.backToDashboard')}
        </button>
      </form>
    </div>
  );
}

function safeDate(locale: string, timeZone: string): string {
  try {
    return new Date().toLocaleDateString(locale, { timeZone, dateStyle: 'long' });
  } catch {
    return new Date().toLocaleDateString();
  }
}
