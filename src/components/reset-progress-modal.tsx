"use client";

interface ResetProgressModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  ariaLabel?: string;
}

export function ResetProgressModal({
  open,
  onCancel,
  onConfirm,
  title = "Reiniciar progreso",
  message = "¿Estás seguro de que quieres reiniciar y comenzar de nuevo? Si continúas, perderás el progreso actual y los datos guardados en este navegador.",
  confirmLabel = "Sí, reiniciar",
  cancelLabel = "Cancelar",
  ariaLabel = "Confirmar reinicio de progreso",
}: ResetProgressModalProps) {
  if (!open) return null;

  return (
    <div className="skill-help-modal" role="dialog" aria-modal="true" aria-label={ariaLabel}>
      <div className="skill-help-overlay" onClick={onCancel} />
      <div className="skill-help-sheet">
        <div className="skill-help-title-row">
          <h3>{title}</h3>
          <button type="button" className="skill-help-close" onClick={onCancel} aria-label="Cerrar confirmación">
            x
          </button>
        </div>
        <p>{message}</p>
        <div className="confirm-reset-actions">
          <button type="button" className="ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="primary" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
