'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { BASE_PATH, TRUELAYER_COUNTRIES } from '@/lib/constants';
import { useSettings } from '@/contexts/SettingsContext';
import { useTranslation } from '@/i18n';

// TrueLayer keys use 'uk'; user settings store ISO 3166 codes ('GB').
function truelayerCountryFor(isoCountry: string): string | undefined {
  const code = isoCountry.toUpperCase() === 'GB' ? 'uk' : isoCountry.toLowerCase();
  return TRUELAYER_COUNTRIES.find((c) => c.code === code)?.code;
}

export default function ConnectBankPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { settings } = useSettings();
  const { t } = useTranslation();
  // Default to the country of residence; banks in other countries stay one tap away.
  const [pickedCountry, setCountry] = useState<string | null>(null);
  const country = pickedCountry ?? truelayerCountryFor(settings.country) ?? TRUELAYER_COUNTRIES[0].code;

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 pb-20">
      <div className="p-4 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-2">{t('connectBank.title')}</h1>
          <p className="text-gray-400 text-sm">
            {t('connectBank.subtitle')}
          </p>
        </div>

        {/* TrueLayer info card */}
        <div className="bg-blue-900/20 border border-blue-800 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🔒</span>
            <div>
              <h3 className="font-semibold text-white text-sm">{t('connectBank.secureTitle')}</h3>
              <p className="text-xs text-blue-200 mt-1">
                {t('connectBank.secureText')}
              </p>
            </div>
          </div>
        </div>

        {/* Bank country selector */}
        <div>
          <label className="text-xs text-gray-400">{t('connectBank.whereIsBank')}</label>
          <div className="flex gap-2 mt-2">
            {TRUELAYER_COUNTRIES.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => setCountry(c.code)}
                className={`flex-1 py-3 rounded-xl border text-sm font-medium transition-colors ${
                  country === c.code
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-600'
                }`}
              >
                {c.flag} {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* TrueLayer connect button */}
        <a
          href={`${BASE_PATH}/api/auth/truelayer?country=${country}`}
          className="w-full block py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium text-center transition-colors"
        >
          <div className="flex items-center justify-center gap-3">
            <span className="text-2xl">🏦</span>
            <span>{t('connectBank.connectWithTrueLayer')}</span>
          </div>
        </a>

        {/* Back button */}
        <button
          onClick={() => router.push('/dashboard')}
          className="w-full py-3 text-gray-400 text-sm hover:text-white transition-colors"
        >
          {t('common.backToDashboard')}
        </button>
      </div>
    </div>
  );
}
