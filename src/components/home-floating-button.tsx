"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ResetProgressModal } from "@/components/reset-progress-modal";
import { hasStoredProgress } from "@/lib/client-data";

export function HomeFloatingButton() {
  const pathname = usePathname();
  const router = useRouter();
  const [showLeaveModal, setShowLeaveModal] = useState(false);

  if (pathname === "/") return null;

  const isWizardStep = pathname.startsWith("/crear/") && pathname !== "/crear/resumen";

  function handleGoHome() {
    if (isWizardStep && hasStoredProgress()) {
      setShowLeaveModal(true);
      return;
    }
    router.push("/");
  }

  return (
    <>
      <button
        type="button"
        className="home-floating-button"
        aria-label="Volver al inicio"
        title="Volver al inicio"
        onClick={handleGoHome}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 11.5 12 5l8 6.5v8a1 1 0 0 1-1 1h-4.5v-5.5h-5V20.5H5a1 1 0 0 1-1-1z" />
        </svg>
      </button>
      <ResetProgressModal
        open={showLeaveModal}
        onCancel={() => setShowLeaveModal(false)}
        onConfirm={() => {
          setShowLeaveModal(false);
          router.push("/");
        }}
        title="Volver al inicio"
        message="Tienes una creación en curso. Si sales ahora, podrás reanudarla más tarde."
        confirmLabel="Sí, volver al inicio"
        cancelLabel="Seguir editando"
        ariaLabel="Confirmar salida al inicio"
      />
    </>
  );
}
