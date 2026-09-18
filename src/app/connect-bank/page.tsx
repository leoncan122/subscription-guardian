'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { BASE_PATH } from '@/lib/constants';

export default function ConnectBankPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

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

        {/* TrueLayer connect button */}
        <a
          href={`${BASE_PATH}/api/auth/truelayer`}
          className="w-full block py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium text-center transition-colors"
        >
          <div className="flex items-center justify-center gap-3">
            <span className="text-2xl">🏦</span>
            <span>Connect with TrueLayer</span>
          </div>
        </a>

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
