"use client";

interface ResetProgressModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title?: string;
  message?: string;
  secondaryMessage?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  ariaLabel?: string;
  showArcaneEye?: boolean;
}

export function ResetProgressModal({
  open,
  onCancel,
  onConfirm,
  title = "Reiniciar progreso",
  message = "¿Estás seguro de que quieres reiniciar y comenzar de nuevo? Si continúas, perderás el progreso actual y los datos guardados en este navegador.",
  secondaryMessage,
  confirmLabel = "Sí, reiniciar",
  cancelLabel = "Cancelar",
  ariaLabel = "Confirmar reinicio de progreso",
  showArcaneEye = false,
}: ResetProgressModalProps) {
  if (!open) return null;

  return (
    <div className="skill-help-modal" role="dialog" aria-modal="true" aria-label={ariaLabel}>
      <div className="skill-help-overlay" onClick={onCancel} />
      <div className="skill-help-sheet">
        {showArcaneEye && (
          <div className="guardian-arcane-eye" aria-hidden="true">
            <svg viewBox="0 0 260 84" role="presentation">
              <defs>
                <radialGradient id="arcane-red-core" cx="50%" cy="50%" r="60%">
                  <stop offset="0%" stopColor="#ff7a7a" />
                  <stop offset="55%" stopColor="#d44747" />
                  <stop offset="100%" stopColor="#6c1111" />
                </radialGradient>
              </defs>
              <path
                d="M18 42 C46 14, 92 6, 130 6 C168 6, 214 14, 242 42 C214 70, 168 78, 130 78 C92 78, 46 70, 18 42 Z"
                className="guardian-eye-outline"
              />
              <path
                d="M28 42 C52 22, 94 14, 130 14 C166 14, 208 22, 232 42"
                className="guardian-eye-engraving"
              />
              <path
                d="M28 42 C52 62, 94 70, 130 70 C166 70, 208 62, 232 42"
                className="guardian-eye-engraving"
              />
              <g className="guardian-eye-iris-track">
                <circle cx="130" cy="42" r="16" className="guardian-eye-iris" />
                <circle cx="130" cy="42" r="7" fill="#1e0505" />
                <circle cx="134" cy="39" r="2" fill="#ffb8b8" opacity="0.8" />
              </g>
              <g className="guardian-eye-rune-dots">
                <circle cx="62" cy="42" r="2.3" />
                <circle cx="198" cy="42" r="2.3" />
                <circle cx="130" cy="20" r="2.3" />
                <circle cx="130" cy="64" r="2.3" />
              </g>
              <circle cx="130" cy="42" r="16" fill="url(#arcane-red-core)" opacity="0.15" />
            </svg>
          </div>
        )}
        <div className="skill-help-title-row">
          <h3>{title}</h3>
          <button type="button" className="skill-help-close" onClick={onCancel} aria-label="Cerrar confirmación">
            x
          </button>
        </div>
        <p>{message}</p>
        {secondaryMessage ? <p>{secondaryMessage}</p> : null}
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
