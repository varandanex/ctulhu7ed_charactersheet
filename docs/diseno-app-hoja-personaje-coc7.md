# Documento de diseno: app web para crear hoja de personaje (La Llamada de Cthulhu 7a)

## 1. Objetivo
Construir una aplicacion web que guie al usuario paso a paso para crear un investigador de Cthulhu 7a, con validaciones de reglas, calculo automatico y exportacion final de hoja.

## 2. Alcance funcional (MVP)
El flujo principal replica la creacion oficial en 5 pasos:
1. Generar caracteristicas
2. Determinar ocupacion
3. Elegir habilidades y repartir puntos
4. Crear trasfondo
5. Equipar investigador

Tambien debe calcular automaticamente:
- Suerte
- MOV
- Puntos de Vida
- Bonificacion al dano
- Corpulencia
- Mitad y quinta parte de caracteristicas/habilidades
- COR inicial y PM inicial

## 3. Flujo UX propuesto
## 3.1 Pantalla de inicio
- Elegir modo: `Tirada aleatoria` o `Entrada manual`
- Elegir edad (15-90)
- Elegir epoca/ambientacion (opcional, para filtrar ocupaciones como "Pirata informatico")

## 3.2 Paso 1: Caracteristicas
- Mostrar FUE, CON, TAM, DES, APA, INT, POD, EDU con formula de tirada.
- Boton `Tirar todo` y botones por atributo.
- Aplicar modificadores por edad cuando corresponda.
- Calcular mitad y quinta automaticamente.

## 3.3 Paso 2: Ocupacion
- Selector de profesion con buscador y filtros (lovecraftiana, actual).
- Mostrar:
  - habilidades de ocupacion
  - grupos de eleccion
  - formula de puntos de ocupacion
  - rango de Credito
- Validar que el Credito quede dentro de rango.

## 3.4 Paso 3: Habilidades
- Subpaso A: repartir puntos de ocupacion
- Subpaso B: repartir puntos de interes particular (INT x2)
- Mostrar puntos restantes en tiempo real.
- Bloquear avance si hay puntos sin asignar (o confirmar perdida de puntos).

## 3.5 Paso 4: Trasfondo
Campos guiados para:
- descripcion personal
- ideologia/creencias
- allegados
- lugares significativos
- posesiones preciadas
- rasgos

## 3.6 Paso 5: Equipo y finanzas
- Mostrar efectivo/propiedades segun Credito.
- Checklist de equipo inicial.
- Resumen final + exportar JSON y PDF.

## 4. Reglas y validaciones criticas
- Edad fuera de 15-90 requiere confirmacion de guardian.
- EDU no puede superar 99 tras mejoras.
- Puntos de ocupacion solo en habilidades permitidas por la profesion.
- Puntos de interes no pueden ir a "Mitos de Cthulhu" en creacion inicial.
- Calculo MOV depende de comparacion DES/FUE vs TAM y ajustes por decada.
- Bonificacion al dano y Corpulencia dependen de suma FUE+TAM.

## 5. Arquitectura recomendada
- Frontend: Next.js o React + TypeScript
- Estado: Zustand o Redux Toolkit
- Validacion: Zod (esquemas compartidos)
- Datos de reglas: JSON versionado en repositorio (`data/creacion-personaje/`)
- Exportacion PDF: plantilla HTML->PDF o motor PDF dedicado

## 6. Modelo de datos recomendado
Entidades principales:
- `character`
- `characteristics`
- `derived_stats`
- `occupation`
- `skills`
- `background`
- `equipment`

La app debe cargar catalogos desde archivos JSON para no hardcodear reglas en componentes.

## 7. Estructura de ficheros propuesta
- `data/creacion-personaje/pasos.json`
- `data/creacion-personaje/reglas.json`
- `data/creacion-personaje/profesiones.json`
- `data/creacion-personaje/opciones-trasfondo.json`

## 8. Roadmap
1. Implementar motor de reglas puro (sin UI)
2. Conectar wizard de 5 pasos
3. Añadir persistencia local (localStorage)
4. Exportar/importar personaje (JSON)
5. Exportar hoja final (PDF)
6. Pruebas E2E del flujo completo

## 9. Fuente
Contenido sintetizado del Capitulo 3 (Creacion de investigadores), incluyendo:
- pasos de creacion
- formulas de caracteristicas
- modificadores por edad
- atributos derivados
- ocupaciones de ejemplo (paginas 42-43)

