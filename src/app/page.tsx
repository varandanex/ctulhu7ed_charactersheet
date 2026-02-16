"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ResetProgressModal } from "@/components/reset-progress-modal";
import { clearClientData, hasStoredProgress } from "@/lib/client-data";

export default function HomePage() {
  const shareUrl = "https://callofcthulhu-charactersheet.vercel.app";
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=12&data=${encodeURIComponent(shareUrl)}`;

  const router = useRouter();
  const [showResetModal, setShowResetModal] = useState(false);

  const handleStart = () => {
    if (hasStoredProgress()) {
      setShowResetModal(true);
      return;
    }

    clearClientData();
    router.push("/crear/1");
  };

  const confirmResetAndStart = () => {
    clearClientData();
    setShowResetModal(false);
    router.push("/crear/1");
  };

  return (
    <main>
      <section className="app-shell home-shell">
        <div className="home-intro">
          <h1 className="title">Creador de Investigadores</h1>
          <p className="subtitle">La Llamada de Cthulhu 7a - flujo guiado, reglas validadas, exportacion final.</p>
          <div className="home-cta">
            <button className="primary" type="button" onClick={handleStart}>
              Empezar creacion
            </button>
          </div>
          <div className="home-share" aria-label="Compartir aplicacion con codigo QR">
            <img className="home-share-qr" src={qrUrl} alt="Codigo QR para compartir la app" />
            <div className="home-share-copy">
              <p className="home-share-title">Compartir app</p>
              <a className="home-share-link" href={shareUrl} target="_blank" rel="noreferrer">
                {shareUrl}
              </a>
            </div>
          </div>
        </div>
        <figure className="home-cover" aria-label="Ilustracion de dado para la portada">
          <img className="home-cover-image" src="/images/dado.jpg" alt="Dado sobre superficie oscura" />
        </figure>
      </section>

      <ResetProgressModal open={showResetModal} onCancel={() => setShowResetModal(false)} onConfirm={confirmResetAndStart} />
    </main>
  );
}
