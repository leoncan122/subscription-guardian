'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { connectBank } from '@/lib/supabase/banking';

const BANKS = [
  { id: 'santander', name: 'Santander', color: 'bg-red-600' },
  { id: 'bbva', name: 'BBVA', color: 'bg-blue-600' },
  { id: 'caixabank', name: 'CaixaBank', color: 'bg-green-600' },
  { id: 'sabadell', name: 'Sabadell', color: 'bg-purple-600' },
  { id: 'ing', name: 'ING', color: 'bg-orange-600' },
  { id: 'n26', name: 'N26', color: 'bg-gray-600' },
  { id: 'revolut', name: 'Revolut', color: 'bg-black' },
  { id: 'other', name: 'Other Bank', color: 'bg-gray-700' },
];

export default function ConnectBankPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [selectedBank, setSelectedBank] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleConnect = async () => {
    if (!selectedBank || !user) return;

    setConnecting(true);
    setError(null);
    try {
      const bank = BANKS.find((b) => b.id === selectedBank);
      if (!bank) return;

      const { redirect_url } = await connectBank(selectedBank, bank.name);
      if (redirect_url) {
        window.location.href = redirect_url;
      }
    } catch (err: any) {
      console.error('Failed to connect bank:', err);
      setError(err.message || 'Failed to connect to bank. Please try again.');
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 pb-20">
      <div className="p-4 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-2">Connect Your Bank</h1>
          <p className="text-gray-400 text-sm">
            Select your bank to automatically detect your subscriptions using Open Banking standards.
            Your data is encrypted and secure.
          </p>
        </div>

        {/* Info card */}
        <div className="bg-blue-900/20 border border-blue-800 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🔒</span>
            <div>
              <h3 className="font-semibold text-white text-sm">Secure Connection</h3>
              <p className="text-xs text-blue-200 mt-1">
                We use Open Banking APIs with your explicit consent. Your bank credentials are never stored — we only receive an access token. Read-only access means we can&apos;t move your money.
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-800 text-red-200 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Bank list */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-3">Select Your Bank</h2>
          <div className="grid grid-cols-2 gap-3">
            {BANKS.map((bank) => (
              <button
                key={bank.id}
                onClick={() => setSelectedBank(bank.id)}
                className={`p-4 rounded-xl border-2 transition-all ${
                  selectedBank === bank.id
                    ? 'border-blue-500 bg-blue-900/20'
                    : 'border-gray-800 bg-gray-900 hover:border-gray-700'
                }`}
              >
                <div className={`w-10 h-10 rounded-lg ${bank.color} flex items-center justify-center mb-2`}>
                  <span className="text-white font-bold text-lg">{bank.name[0]}</span>
                </div>
                <p className="text-white text-sm font-medium">{bank.name}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Continue button */}
        <button
          onClick={handleConnect}
          disabled={!selectedBank || connecting}
          className={`w-full py-3 rounded-xl font-medium text-sm transition-colors ${
            selectedBank && !connecting
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-gray-800 text-gray-500 cursor-not-allowed'
          }`}
        >
          {connecting ? (
            <span className="flex items-center justify-center gap-2">
              <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
              Connecting...
            </span>
          ) : (
            `Connect with ${selectedBank ? BANKS.find((b) => b.id === selectedBank)?.name : 'a bank'}`
          )}
        </button>

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
