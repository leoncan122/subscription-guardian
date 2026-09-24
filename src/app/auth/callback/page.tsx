import { Suspense } from 'react';
import AuthCallbackContent from './AuthCallbackContent';

export default function AuthCallback() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
      </div>
    }>
      <AuthCallbackContent />
    </Suspense>
  );
}
