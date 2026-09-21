'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { BASE_PATH, TRUELAYER_COUNTRIES } from '@/lib/constants';

interface GCInstitution {
  id: string;
  name: string;
  logo: string;
}

export default function ConnectBankPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [country, setCountry] = useState<string>(TRUELAYER_COUNTRIES[0].code);
  const [institutions, setInstitutions] = useState<GCInstitution[]>([]);
  const [selectedInstitution, setSelectedInstitution] = useState('');
  const [loadingInstitutions, setLoadingInstitutions] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  // GoCardless needs the institution picked up front (unlike TrueLayer,
  // which has its own hosted bank-search page), so fetch the list whenever
  // the selected country changes.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const loadInstitutions = async () => {
      setLoadingInstitutions(true);
      setSelectedInstitution('');
      try {
        const res = await fetch(`${BASE_PATH}/api/gocardless/institutions?country=${country}`);
        const data = await res.json();
        if (cancelled) return;
        const list: GCInstitution[] = data.institutions || [];
        setInstitutions(list);
        setSelectedInstitution(list[0]?.id || '');
      } catch {
        if (!cancelled) setInstitutions([]);
      } finally {
        if (!cancelled) setLoadingInstitutions(false);
      }
    };

    loadInstitutions();
    return () => { cancelled = true; };
  }, [country, user]);

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
          <h1 className="text-2xl font-bold text-white mb-2">Connect Your Bank</h1>
          <p className="text-gray-400 text-sm">
            Connect using TrueLayer Open Banking — secure, read-only access to your account data.
          </p>
        </div>

        {/* TrueLayer info card */}
        <div className="bg-blue-900/20 border border-blue-800 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🔒</span>
            <div>
              <h3 className="font-semibold text-white text-sm">Secure Open Banking</h3>
              <p className="text-xs text-blue-200 mt-1">
                We use TrueLayer with Open Banking standards. Your bank credentials are never stored.
                We only receive read-only access to view balances and transactions.
              </p>
            </div>
          </div>
        </div>

        {/* Bank country selector */}
        <div>
          <label className="text-xs text-gray-400">¿Dónde está tu banco?</label>
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
            <span>Connect with TrueLayer</span>
          </div>
        </a>

        {/* GoCardless alternative */}
        <div className="pt-2">
          <div className="flex items-center gap-4 mb-4">
            <div className="flex-1 h-px bg-gray-800" />
            <span className="text-gray-500 text-xs">o alternativamente</span>
            <div className="flex-1 h-px bg-gray-800" />
          </div>

          <div className="bg-green-900/20 border border-green-800 rounded-xl p-4 mb-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl">🔒</span>
              <div>
                <h3 className="font-semibold text-white text-sm">GoCardless Bank Account Data</h3>
                <p className="text-xs text-green-200 mt-1">
                  Otro proveedor de Open Banking de solo lectura, como alternativa a TrueLayer. Elige tu banco de la lista.
                </p>
              </div>
            </div>
          </div>

          {institutions.length > 0 && (
            <select
              value={selectedInstitution}
              onChange={(e) => setSelectedInstitution(e.target.value)}
              className="w-full mb-3 bg-gray-900 border border-gray-800 text-gray-300 text-sm px-3 py-3 rounded-xl focus:outline-none focus:border-green-500"
            >
              {institutions.map((inst) => (
                <option key={inst.id} value={inst.id}>{inst.name}</option>
              ))}
            </select>
          )}

          <a
            href={selectedInstitution ? `${BASE_PATH}/api/auth/gocardless?institution_id=${selectedInstitution}` : undefined}
            className={`w-full block py-4 rounded-xl font-medium text-center transition-colors ${
              selectedInstitution
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-gray-800 text-gray-500 pointer-events-none'
            }`}
          >
            <div className="flex items-center justify-center gap-3">
              <span className="text-2xl">🏦</span>
              <span>{loadingInstitutions ? 'Cargando bancos…' : 'Connect with GoCardless'}</span>
            </div>
          </a>
        </div>

        {/* Back button */}
        <button
          onClick={() => router.push('/dashboard')}
          className="w-full py-3 text-gray-400 text-sm hover:text-white transition-colors"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}
