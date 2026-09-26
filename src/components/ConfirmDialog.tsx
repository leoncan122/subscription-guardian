'use client';

export interface ConfirmDialogProps {
  message: string;
  confirmLabel: string;
  // Omit to render as a single-button (alert-style) dialog.
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
}

export function ConfirmDialog({ message, confirmLabel, cancelLabel, danger, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 sm:p-6"
      onClick={onCancel ?? onConfirm}
    >
      <div
        className="w-full sm:max-w-sm bg-gray-900 border border-gray-800 rounded-t-2xl sm:rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm text-gray-200 whitespace-pre-wrap mb-6">{message}</p>
        <div className="flex gap-2">
          {cancelLabel && (
            <button
              onClick={onCancel}
              className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
            >
              {cancelLabel}
            </button>
          )}
          <button
            onClick={onConfirm}
            autoFocus
            className={`flex-1 py-2 text-white text-sm rounded-lg transition-colors ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
