'use client';

import { useCallback, useState } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface DialogState {
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  resolve: (confirmed: boolean) => void;
}

interface DialogOptions {
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
}

// In-app replacement for window.confirm/window.alert, rendered as the app's
// own ConfirmDialog instead of the browser's native (unstyleable, blocking)
// dialog. `confirmDialog` resolves to whether the confirm button was
// pressed; `alertDialog` is the single-button (no cancelLabel) variant and
// resolves once acknowledged.
export function useConfirmDialog() {
  const [state, setState] = useState<DialogState | null>(null);

  const confirmDialog = useCallback((message: string, options: DialogOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setState({ message, ...options, resolve });
    });
  }, []);

  const alertDialog = useCallback((message: string, confirmLabel: string): Promise<void> => {
    return new Promise<void>((resolve) => {
      setState({ message, confirmLabel, resolve: () => resolve() });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    setState((current) => {
      current?.resolve(true);
      return null;
    });
  }, []);

  const handleCancel = useCallback(() => {
    setState((current) => {
      current?.resolve(false);
      return null;
    });
  }, []);

  const dialog = state ? (
    <ConfirmDialog
      message={state.message}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      danger={state.danger}
      onConfirm={handleConfirm}
      onCancel={state.cancelLabel ? handleCancel : undefined}
    />
  ) : null;

  return { dialog, confirmDialog, alertDialog };
}
