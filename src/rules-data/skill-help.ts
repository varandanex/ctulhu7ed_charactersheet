export interface SkillHelp {
  skill: string;
  base: string;
  summary: string;
  example: string;
  complement: string;
}

const skillHelpCatalog: Record<string, Omit<SkillHelp, "skill">> = {
  antropologia: {
    base: "01%",
    summary: "Permite interpretar costumbres, rituales y comportamiento humano dentro de una cultura.",
    example: "Reconocer que un simbolo, ajuar funerario o gesto social pertenece a un grupo concreto.",
    complement: "Ideal para leer escenas y pistas sociales sin asumir que todo es sobrenatural.",
  },
  "armas de fuego": {
    base: "Especialidad (no se sube la habilidad generica)",
    summary: "Cubre uso seguro y eficaz de armas de fuego segun especialidad (arma corta, fusil, escopeta, etc.).",
    example: "Disparar en combate bajo presion o valorar que arma conviene en una situacion.",
    complement: "En CoC la violencia suele complicar la investigacion; util para sobrevivir, no para resolver todo.",
  },
  "armas de fuego (arma corta)": {
    base: "20%",
    summary: "Uso de pistolas y revolveres en combate, con enfasis en precision y control a corta distancia.",
    example: "Responder a una amenaza inmediata en interiores o durante una persecucion urbana.",
    complement: "Especialidad comun y versatil; suele ser mas util en escenas de ciudad.",
  },
  "armas de fuego (fusil/escopeta)": {
    base: "25%",
    summary: "Uso de armas largas con mejor rendimiento a media distancia y mayor impacto por disparo.",
    example: "Cubrir un area abierta o defender una posicion con fuego de largo alcance.",
    complement: "Muy potente, pero menos discreta y mas situacional en espacios cerrados.",
  },
  arqueologia: {
    base: "01%",
    summary: "Sirve para estudiar restos del pasado, fechar hallazgos y entender su contexto historico.",
    example: "Determinar para que servia un yacimiento y que cultura lo construyo.",
    complement: "Muy potente en aventuras con ruinas, tomos, excavaciones o civilizaciones perdidas.",
  },
  "arte/artesania": {
    base: "05% (por especialidad)",
    summary: "Representa formacion practica o artistica: crear, reparar, falsificar o evaluar trabajos tecnicos/artisticos.",
    example: "Hacer una falsificacion creible o identificar tecnica y autoria probable de una obra.",
    complement: "Define mucho la identidad del PJ; una buena especialidad abre soluciones no violentas.",
  },
  "buscar libros": {
    base: "20%",
    summary: "Permite localizar informacion en bibliotecas, hemerotecas, archivos y colecciones documentales.",
    example: "Encontrar una referencia especifica en periodicos viejos o catalogos universitarios.",
    complement: "Suele consumir horas; combina bien con Credito, Encanto o Persuasion para acceder a material restringido.",
  },
  cerrajeria: {
    base: "01%",
    summary: "Abarca apertura y manipulacion de cerraduras y mecanismos de cierre.",
    example: "Abrir una puerta, caja o candado sin romperlo.",
    complement: "Aporta acceso silencioso a pistas, pero el fracaso puede activar alarmas o dejar evidencia.",
  },
  charlataneria: {
    base: "05%",
    summary: "Enganar, distraer o manipular mediante discurso rapido y convincente.",
    example: "Hacer pasar una coartada improvisada ante un guardia.",
    complement: "El efecto suele ser temporal; si te descubren, complica la credibilidad futura del investigador.",
  },
  ciencia: {
    base: "01% (por especialidad)",
    summary: "Conocimiento cientifico formal aplicado a analisis, hipotesis y pruebas tecnicas.",
    example: "Identificar una sustancia rara en laboratorio o interpretar datos fisicos.",
    complement: "Especialidad clave para bajar la incertidumbre sin recurrir a magia o intuicion.",
  },
  "ciencias ocultas": {
    base: "05%",
    summary: "Conoce tradiciones esotericas, simbolismo, rituales y textos ocultistas (no equivale a 'Mitos de Cthulhu').",
    example: "Reconocer una invocacion clasica de grimorio ocultista comun.",
    complement: "Puede orientar la investigacion, pero no garantiza comprender los Mitos reales.",
  },
  combatir: {
    base: "Especialidad (Pelea base 25%)",
    summary: "Uso de combate cuerpo a cuerpo segun estilo o arma concreta.",
    example: "Reducir a un cultista en una pelea cerrada.",
    complement: "Subir 'Combatir (Pelea)' es eficiente para defensa personal; especialidades armadas son mas situacionales.",
  },
  "conducir automovil": {
    base: "20%",
    summary: "Conduccion de automoviles en condiciones normales y de riesgo.",
    example: "Mantener control en una persecucion urbana.",
    complement: "En persecuciones puede marcar la diferencia entre escapar o quedar aislado.",
  },
  "conducir maquinaria": {
    base: "01%",
    summary: "Manejo de maquinaria pesada o industrial (gruas, tractores, equipos especiales).",
    example: "Operar una maquina para abrir paso o mover una carga critica.",
    complement: "Poco frecuente, pero decisiva en escenas concretas de campo, fabrica o puerto.",
  },
  contabilidad: {
    base: "05%",
    summary: "Analiza libros contables, balances y rastros financieros.",
    example: "Detectar desvio de fondos o pagos encubiertos en una empresa tapadera.",
    complement: "Excelente para descubrir conspiraciones humanas antes del horror cosmico.",
  },
  credito: {
    base: "00%",
    summary: "Representa posicion social, liquidez disponible y acceso a recursos por estatus.",
    example: "Conseguir alojamiento de alto nivel o trato preferente.",
    complement: "No es solo dinero: tambien mide reputacion y como te percibe la sociedad.",
  },
  derecho: {
    base: "05%",
    summary: "Conocimiento de leyes, procedimientos judiciales y limites legales.",
    example: "Evitar que una prueba se invalide por mala cadena de custodia.",
    complement: "Muy util para moverse sin que la investigacion termine bloqueada por autoridades.",
  },
  descubrir: {
    base: "25%",
    summary: "Percepcion visual y atencion al detalle para notar pistas o anomalias.",
    example: "Ver una marca de arrastre, sangre seca o una puerta oculta.",
    complement: "Clave para hallar pistas, pero no reemplaza interpretarlas correctamente.",
  },
  disfrazarse: {
    base: "05%",
    summary: "Cambiar apariencia, lenguaje corporal y presencia para pasar por otra persona.",
    example: "Entrar en un hospital haciendote pasar por personal tecnico.",
    complement: "Funciona mejor si va acompanada de una historia creible y apoyo social.",
  },
  electricidad: {
    base: "10%",
    summary: "Instalar, diagnosticar o reparar sistemas electricos.",
    example: "Reactivar un circuito, cortar energia o evitar una descarga peligrosa.",
    complement: "Suele combinarse con Mecanica para resolver dispositivos complejos.",
  },
  encanto: {
    base: "15%",
    summary: "Influir positivamente desde carisma, empatia y presencia agradable.",
    example: "Conseguir cooperacion de un testigo reticente sin intimidarlo.",
    complement: "Suele generar relaciones utiles a medio plazo, no solo exito puntual.",
  },
  equitacion: {
    base: "05%",
    summary: "Manejo y control de monturas en condiciones normales o estresantes.",
    example: "Seguir un rastro por terreno abrupto sin perder el control del caballo.",
    complement: "Dependiente de la epoca/campana, pero muy valiosa en escenarios rurales.",
  },
  escuchar: {
    base: "20%",
    summary: "Percepcion auditiva y lectura de sonidos relevantes en el entorno.",
    example: "Detectar pasos tras una pared o una conversacion amortiguada.",
    complement: "Complementa Descubrir para escenas de tension y vigilancia.",
  },
  esquivar: {
    base: "DES/2",
    summary: "Capacidad de evitar golpes, disparos o impactos en combate.",
    example: "Apartarte a tiempo de un ataque cuerpo a cuerpo.",
    complement: "Una buena Esquivar mejora mucho la supervivencia del investigador.",
  },
  historia: {
    base: "05%",
    summary: "Conocimiento de hechos, periodos, personajes y contexto historico.",
    example: "Relacionar un culto reciente con una sociedad secreta antigua.",
    complement: "Muy util para interpretar pistas de epoca, genealogias y cronologias.",
  },
  intimidar: {
    base: "15%",
    summary: "Forzar cooperacion a traves de presion, amenaza o presencia agresiva.",
    example: "Sacar informacion urgente de un sospechoso hostil.",
    complement: "Efectivo a corto plazo; puede generar enemigos y consecuencias legales.",
  },
  "juego de manos": {
    base: "10%",
    summary: "Destreza manual para ocultar, robar o intercambiar objetos sin ser notado.",
    example: "Sustraer una llave o plantar una nota en un bolsillo.",
    complement: "Suele oponerse a Descubrir; brilla en escenas de infiltracion.",
  },
  lanzar: {
    base: "20%",
    summary: "Arrojar objetos con precision, distancia y control.",
    example: "Lanzar una piedra para distraer o una granada en combate.",
    complement: "Utilidad tactica alta cuando no quieres exponerte en cuerpo a cuerpo.",
  },
  "lengua propia": {
    base: "EDU",
    summary: "Dominio de tu idioma nativo para leer, escribir y comunicar con precision.",
    example: "Interpretar textos complejos, tecnicos o arcaizantes en tu lengua.",
    complement: "Base cultural del personaje; algunas pistas dependen de matices linguisticos.",
  },
  "otras lenguas": {
    base: "01% (por idioma)",
    summary: "Comprension y uso de idiomas no nativos, modernos o antiguos.",
    example: "Traducir notas en latin o mantener una conversacion funcional en frances.",
    complement: "En investigacion lovecraftiana permite acceder a fuentes que otros no pueden leer.",
  },
  mecanica: {
    base: "10%",
    summary: "Diagnosticar, reparar y montar mecanismos o maquinaria.",
    example: "Arreglar un motor, una bomba o un sistema mecanico averiado.",
    complement: "Suele ir de la mano con Electricidad en dispositivos modernos.",
  },
  medicina: {
    base: "01%",
    summary: "Diagnostico y tratamiento medico avanzado, mas alla de Primeros auxilios.",
    example: "Estabilizar lesiones serias y mejorar la recuperacion del paciente.",
    complement: "En mesa suele consumir tiempo y recursos, pero salva vidas.",
  },
  "mitos de cthulhu": {
    base: "00%",
    summary: "Conocimiento real de entidades, libros y verdades cosmicas de los Mitos.",
    example: "Identificar una criatura o ritual por indicios fragmentarios.",
    complement: "Subirla suele implicar perdida de Cordura; es conocimiento peligroso por definicion.",
  },
  nadar: {
    base: "20%",
    summary: "Nado seguro, resistencia y maniobra en agua.",
    example: "Cruzar corrientes o mantenerte a flote con equipo minimo.",
    complement: "Puede evitar muertes absurdas en escenas cortas pero letales.",
  },
  naturaleza: {
    base: "10%",
    summary: "Conocimiento practico del medio natural, flora, fauna y clima.",
    example: "Reconocer huellas, plantas peligrosas o signos de tormenta.",
    complement: "Muy util para orientarse y sobrevivir lejos de la ciudad.",
  },
  orientarse: {
    base: "10%",
    summary: "Navegacion y sentido de direccion en ciudad, campo o interiores complejos.",
    example: "Ubicar una ruta segura en niebla o barrio desconocido.",
    complement: "Reduce perdida de tiempo y riesgo en persecuciones o exploracion.",
  },
  persuasion: {
    base: "10%",
    summary: "Convencer mediante argumento, credibilidad y negociacion razonada.",
    example: "Obtener permiso oficial para revisar archivos o escena.",
    complement: "Suele dar frutos estables y menos conflictivos que la intimidacion.",
  },
  pilotar: {
    base: "01% (por tipo de vehiculo)",
    summary: "Control de vehiculos aereos, maritimos o especiales segun especialidad.",
    example: "Mantener una aeronave estable en condiciones adversas.",
    complement: "Habilidad especializada y de alto impacto en escenas de viaje/persecucion.",
  },
  "primeros auxilios": {
    base: "30%",
    summary: "Atencion inmediata de emergencia para detener deterioro o estabilizar heridos.",
    example: "Vendar una herida y detener una hemorragia en plena escena.",
    complement: "Rapida y vital en campo; no reemplaza Medicina para tratamientos largos.",
  },
  psicoanalisis: {
    base: "01%",
    summary: "Tratamiento psicologico especializado para trauma y estabilidad mental a largo plazo.",
    example: "Asistir recuperacion de Cordura durante periodos de descanso y terapia.",
    complement: "No es para interrogatorio rapido; su valor aparece entre aventuras.",
  },
  psicologia: {
    base: "10%",
    summary: "Leer emociones, intenciones y coherencia del comportamiento humano.",
    example: "Detectar nerviosismo, mentira parcial o miedo autentico.",
    complement: "Mejor para evaluar personas que para manipularlas directamente.",
  },
  saltar: {
    base: "20%",
    summary: "Saltos de precision y movilidad en obstaculos.",
    example: "Cruzar un hueco entre tejados o evitar caer en una trampa.",
    complement: "Brilla en persecuciones y escenas fisicas con terreno peligroso.",
  },
  "seguir rastros": {
    base: "10%",
    summary: "Rastrear movimiento por huellas, marcas, roturas o patrones de paso.",
    example: "Seguir a alguien por barro, bosque o callejones.",
    complement: "Combina muy bien con Naturaleza y Descubrir.",
  },
  sigilo: {
    base: "20%",
    summary: "Moverse sin ser detectado por vista ni oido.",
    example: "Infiltrarte en una mansion evitando guardias y suelos ruidosos.",
    complement: "Clave para investigar sin activar enfrentamientos directos.",
  },
  supervivencia: {
    base: "10% (por entorno)",
    summary: "Mantenerse vivo en condiciones hostiles: refugio, agua, fuego y decision tactica.",
    example: "Pasar la noche en bosque o tundra sin equipo adecuado.",
    complement: "Dependiente del entorno; especializarla evita riesgos acumulativos.",
  },
  tasacion: {
    base: "05%",
    summary: "Valorar autenticidad, procedencia y precio de objetos.",
    example: "Detectar que un manuscrito 'antiguo' es una falsificacion reciente.",
    complement: "Muy util para separar pista real de cebo en subastas, anticuarios y colecciones privadas.",
  },
  trepar: {
    base: "20%",
    summary: "Ascenso y descenso seguro por superficies verticales u obstaculos.",
    example: "Escalar un muro o bajar por fachada sin romperte una pierna.",
    complement: "En accion y escape, tenerla media-alta abre rutas que otros no pueden usar.",
  },
  electronica: {
    base: "01%",
    summary: "Manipulacion de equipos electronicos, circuitos modernos y dispositivos de comunicacion.",
    example: "Analizar un transmisor o arreglar un equipo dañado.",
    complement: "Complementa Electricidad/Mecanica cuando aparece tecnologia especializada.",
  },
  informatica: {
    base: "05%",
    summary: "Busqueda y operacion de sistemas informaticos, redes y datos digitales.",
    example: "Recuperar archivos borrados o rastrear actividad en un terminal.",
    complement: "Sustituye parte de la investigacion de archivo fisico cuando hay soporte digital.",
  },
};

function normalizeSkillName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\[[^\]]*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveSkillKey(skill: string): string | undefined {
  const normalized = normalizeSkillName(skill);
  if (skillHelpCatalog[normalized]) return normalized;

  const withoutParenthesis = normalized.replace(/\s*\([^)]*\)\s*/g, "").trim();
  if (skillHelpCatalog[withoutParenthesis]) return withoutParenthesis;

  const parts = normalized.split(/\s+o\s+/);
  for (const part of parts) {
    const trimmed = part.trim();
    if (skillHelpCatalog[trimmed]) return trimmed;
    const withoutParensPart = trimmed.replace(/\s*\([^)]*\)\s*/g, "").trim();
    if (skillHelpCatalog[withoutParensPart]) return withoutParensPart;
  }

  return undefined;
}

export function getSkillHelp(skill: string): SkillHelp {
  const resolved = resolveSkillKey(skill);
  if (resolved) {
    return { skill, ...skillHelpCatalog[resolved] };
  }

  return {
    skill,
    base: "Segun especialidad/hoja",
    summary: "Habilidad no estandar o combinada. Revisa con el Guardian como se aplica en la escena.",
    example: "Usarla cuando la ficcion de la aventura justifique un conocimiento muy concreto.",
    complement: "Si aparece como opcion de ocupacion, suele ser una via legitima para resolver pistas.",
  };
}
