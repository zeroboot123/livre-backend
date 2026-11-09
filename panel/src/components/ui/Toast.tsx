'use client';

import { useEffect } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, X } from 'lucide-react';

export type ToastKind = 'success' | 'error' | 'info';

export function Toast({
  message,
  kind = 'success',
  onClose,
}: {
  message: string | null;
  kind?: ToastKind;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [message, onClose]);

  if (!message) return null;

  const styles =
    kind === 'error'
      ? 'border-red-200 bg-red-50 text-red-700'
      : kind === 'info'
        ? 'border-blue-200 bg-blue-50 text-blue-700'
        : 'border-green-200 bg-green-50 text-green-700';

  const Icon = kind === 'error' ? XCircle : kind === 'info' ? AlertTriangle : CheckCircle2;

  return (
    <div className="fixed bottom-5 right-5 z-50">
      <div className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 shadow-lg text-sm font-medium ${styles}`}>
        <Icon className="h-4 w-4 shrink-0" />
        <span>{message}</span>
        <button onClick={onClose} className="ml-2 opacity-60 hover:opacity-100">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
