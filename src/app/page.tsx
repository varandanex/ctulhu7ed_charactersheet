import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <section className="app-shell">
        <h1 className="title">Creador de Investigadores</h1>
        <p className="subtitle">La Llamada de Cthulhu 7a - flujo guiado, reglas validadas, exportacion final.</p>
        <div className="actions" style={{ marginTop: 20 }}>
          <Link href="/crear/1">
            <button className="primary">Empezar creacion</button>
          </Link>
        </div>
      </section>
    </main>
  );
}
