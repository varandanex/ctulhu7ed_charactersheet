export interface OccupationHelp {
  overview: string;
  style: string;
  recommendedFor: string;
}

const occupationHelpCatalog: Record<string, OccupationHelp> = {
  abogado: {
    overview: "Especialista en ley, procedimientos y negociacion institucional.",
    style: "Resuelve conflictos por vias formales, acceso a registros y argumentacion.",
    recommendedFor: "Campanas urbanas con policia, tribunales y tramas corporativas.",
  },
  "agente de policia": {
    overview: "Investigador de calle con entrenamiento operativo y legal.",
    style: "Combina interrogatorio, rastreo y respuesta rapida en escenas de riesgo.",
    recommendedFor: "Grupos que necesitan presencia fisica y contacto con autoridades.",
  },
  "atleta profesional": {
    overview: "Especialista fisico con alto rendimiento en movimiento y esfuerzo.",
    style: "Resuelve escenas de accion con velocidad, salto, trepa y control corporal.",
    recommendedFor: "Campanas con persecuciones, exploracion fisica y riesgo constante.",
  },
  anticuario: {
    overview: "Experto en objetos antiguos, procedencias y valor historico.",
    style: "Brilla leyendo pistas en reliquias, catalogos y colecciones privadas.",
    recommendedFor: "Historias de artefactos, subastas, mansiones y tomos raros.",
  },
  artista: {
    overview: "Perfil creativo con sensibilidad social y cultural.",
    style: "Aporta lectura simbolica, improvisacion y enfoque humano de las pistas.",
    recommendedFor: "Mesas con investigacion social y ambientacion bohemia.",
  },
  bibliotecario: {
    overview: "Perfil documental con dominio de archivos, catalogos y referencias cruzadas.",
    style: "Encuentra informacion critica con rapidez y orden metodico.",
    recommendedFor: "Tramas de investigacion academica, hemerotecas y fondos antiguos.",
  },
  clerigo: {
    overview: "Figura religiosa con acceso comunitario y saber historico-cultural.",
    style: "Aporta mediacion social, contencion y lectura de simbolismos.",
    recommendedFor: "Historias con cultos, parroquias, rituales y conflictos morales.",
  },
  criminal: {
    overview: "Especialista en acceso clandestino, engano y trabajo sucio.",
    style: "Abre rutas de infiltracion y soluciones pragmaticas bajo presion.",
    recommendedFor: "Partidas con robos, sectas y operaciones encubiertas.",
  },
  diletante: {
    overview: "Miembro de clase alta con recursos, contactos y educacion amplia.",
    style: "Abre puertas por estatus social y financia acciones del grupo.",
    recommendedFor: "Historias donde Credito y reputacion importan mucho.",
  },
  escritor: {
    overview: "Investigador intelectual con foco en lenguaje, contexto y documentacion.",
    style: "Destaca en investigacion de biblioteca y reconstruccion de relatos.",
    recommendedFor: "Tramas de diarios, cartas, hemeroteca y cronicas antiguas.",
  },
  fanatico: {
    overview: "Creyente intenso, movilizado por dogma o causa personal.",
    style: "Interaccion extrema: convence, presiona o se infiltra por conviccion.",
    recommendedFor: "Historias de cultos, radicalizacion y dilemas morales.",
  },
  granjero: {
    overview: "Perfil practico de campo con manejo de entorno y maquinaria.",
    style: "Sostiene al grupo en escenas rurales, rastreo y supervivencia local.",
    recommendedFor: "Campanas en granjas, pueblos y territorios abiertos.",
  },
  ingeniero: {
    overview: "Tecnico con base cientifica para sistemas mecanicos y electricos.",
    style: "Resuelve problemas de infraestructura, equipos y dispositivos.",
    recommendedFor: "Escenarios industriales, laboratorios y sabotajes tecnicos.",
  },
  "inspector de policia": {
    overview: "Investigador veterano con experiencia en crimen complejo.",
    style: "Conduce pesquisas, conecta pistas y maneja testigos bajo presion.",
    recommendedFor: "Campanas noir y casos criminales de largo recorrido.",
  },
  interprete: {
    overview: "Especialista en performance y construccion de identidad.",
    style: "Ideal para infiltracion social, engano elegante y lectura del publico.",
    recommendedFor: "Mesas con espionaje social y alta interaccion.",
  },
  "investigador privado": {
    overview: "Detective autonomo, meticuloso y orientado a pruebas.",
    style: "Equilibrio entre calle, archivo y seguimiento de sospechosos.",
    recommendedFor: "Campanas clasicas de misterio e investigacion progresiva.",
  },
  medico: {
    overview: "Profesional sanitario con ciencia aplicada al cuerpo humano.",
    style: "Mantiene vivo al grupo y aporta analisis tecnico de lesiones y toxicos.",
    recommendedFor: "Partidas duras donde dano y recuperacion son frecuentes.",
  },
  "miembro de una tribu": {
    overview: "Superviviente de entorno natural con saber tradicional.",
    style: "Aporta orientacion, rastreo y lectura espiritual/cultural local.",
    recommendedFor: "Aventuras de frontera, selva, desierto o regiones remotas.",
  },
  misionero: {
    overview: "Figura de servicio con mezcla de oficio, medicina y fe.",
    style: "Buena mediacion comunitaria y presencia en zonas aisladas.",
    recommendedFor: "Historias de choques culturales y comunidades cerradas.",
  },
  musico: {
    overview: "Perfil sensible con gran escucha y expresion social.",
    style: "Sobresale en trato humano, observacion y presencia escenica.",
    recommendedFor: "Campanas urbanas con vida nocturna y redes sociales.",
  },
  "oficial militar": {
    overview: "Lider tactico con disciplina, logistica y mando.",
    style: "Ordena al grupo en crisis y sostiene operaciones de riesgo.",
    recommendedFor: "Partidas con combate, expediciones y decisiones duras.",
  },
  parapsicologo: {
    overview: "Investigador de fenomenos limite entre ciencia y ocultismo.",
    style: "Combina metodologia de estudio con apertura a lo inexplicable.",
    recommendedFor: "Tramas sobrenaturales donde importan teoria y evidencia.",
  },
  periodista: {
    overview: "Buscador de verdad con red de fuentes y olfato para la noticia.",
    style: "Excelente para reunir testimonios y exponer corrupcion.",
    recommendedFor: "Campanas de conspiracion, prensa y opinion publica.",
  },
  piloto: {
    overview: "Especialista en navegacion y operacion de vehiculos complejos.",
    style: "Asegura movilidad del grupo en escenarios amplios o urgentes.",
    recommendedFor: "Aventuras con viajes largos, rescates y persecuciones.",
  },
  "pirata informatico": {
    overview: "Perfil tecnico de era actual para sistemas y redes.",
    style: "Rompe barreras digitales y recupera datos criticos de forma no convencional.",
    recommendedFor: "Campanas contemporaneas con infraestructura digital.",
  },
  "profesor de universidad": {
    overview: "Academico con alto nivel de investigacion y especializacion.",
    style: "Convierte pistas dispersas en teoria consistente y verificable.",
    recommendedFor: "Mesas que disfrutan de investigacion profunda en archivo.",
  },
  soldado: {
    overview: "Operador entrenado para amenaza directa y terreno hostil.",
    style: "Aporta aguante, disciplina y proteccion del grupo en accion.",
    recommendedFor: "Aventuras peligrosas donde la supervivencia es central.",
  },
  vagabundo: {
    overview: "Superviviente urbano con intuicion callejera y bajo perfil.",
    style: "Se mueve donde otros no pueden: callejones, periferia y ruinas.",
    recommendedFor: "Historias de investigacion cruda y entornos marginales.",
  },
};

function normalizeOccupationName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function getOccupationHelp(name: string): OccupationHelp {
  const normalized = normalizeOccupationName(name);
  return (
    occupationHelpCatalog[normalized] ?? {
      overview: "Ocupacion de investigacion del Manual del Guardian.",
      style: "Define tu foco de juego por acceso social, conocimientos y riesgos.",
      recommendedFor: "Elegir segun la fantasia de personaje y el tono de la campana.",
    }
  );
}
