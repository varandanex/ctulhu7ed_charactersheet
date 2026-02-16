"use client";

interface ResetProgressModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ResetProgressModal({ open, onCancel, onConfirm }: ResetProgressModalProps) {
  if (!open) return null;

  return (
    <div className="skill-help-modal" role="dialog" aria-modal="true" aria-label="Confirmar reinicio de progreso">
      <div className="skill-help-overlay" onClick={onCancel} />
      <div className="skill-help-sheet">
        <div className="skill-help-title-row">
          <h3>Reiniciar progreso</h3>
          <button type="button" className="skill-help-close" onClick={onCancel} aria-label="Cerrar confirmacion">
            x
          </button>
        </div>
        <p>
          Estas seguro de que quieres reiniciar y comenzar de nuevo? Si continuas, perderas el progreso actual y los datos
          guardados en este navegador.
        </p>
        <div className="confirm-reset-actions">
          <button type="button" className="ghost" onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className="primary" onClick={onConfirm}>
            Si, reiniciar
          </button>
        </div>
      </div>
    </div>
  );
}
