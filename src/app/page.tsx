import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <section className="app-shell home-shell">
        <div className="home-intro">
          <h1 className="title">Creador de Investigadores</h1>
          <p className="subtitle">La Llamada de Cthulhu 7a - flujo guiado, reglas validadas, exportacion final.</p>
          <div className="home-cta">
            <Link href="/crear/1">
              <button className="primary">Empezar creacion</button>
            </Link>
          </div>
        </div>
        <figure className="home-cover" aria-label="Ilustracion de dado para la portada">
          <img className="home-cover-image" src="/images/dado.jpg" alt="Dado sobre superficie oscura" />
        </figure>
      </section>
    </main>
  );
}
