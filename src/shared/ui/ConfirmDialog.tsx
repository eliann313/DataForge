"use client";

import { useEffect, useRef } from "react";

// Diálogo de confirmación nativo (sin dependencias): Esc y fondo lo cierran.
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open ]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="rounded-lg border border-gray-300 p-6 shadow-xl"
    >
      <h2 id="confirm-title" className="mb-2 text-lg font-semibold">
        {title}
      </h2>
      <p className="mb-4 max-w-sm text-sm text-gray-700">{message}</p>
      <form method="dialog" className="flex justify-end gap-2">
        <button
          type="submit"
          value="cancel"
          className="rounded border border-gray-300 px-3 py-1.5 text-sm"
        >
          Cancelar
        </button>
        <button
          type="button"
          autoFocus
          onClick={() => {
            onConfirm();
            onClose();
          }}
          className="rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-white"
        >
          {confirmLabel}
        </button>
      </form>
    </dialog>
  );
}
