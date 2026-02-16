# Creador de Investigadores CoC 7e

Aplicacion web para facilitar la creacion de hojas de personaje de La Llamada de Cthulhu 7a edicion.

## Requisitos
- Node.js LTS `24.x` (recomendado `24.13.1`)
- npm `11.x`

## Stack
- Next.js + TypeScript
- Zustand (estado)
- Zod (validacion de catalogos)
- pdf-lib (exportacion PDF)
- Vitest + Playwright (tests)

## Estructura
- `src/domain`: motor de reglas y validaciones
- `src/rules-data`: carga/validacion de JSON de reglas
- `src/state`: store persistente del wizard
- `src/services`: exportadores y transformaciones
- `src/app`: UI del wizard y API routes
- `data/creacion-personaje`: catalogos versionados

## Scripts
- `npm run dev`: iniciar app
- `npm run build`: build de produccion
- `npm run test`: tests unitarios
- `npm run test:e2e`: pruebas E2E

## Flujo
1. `/crear/1` Determinar edad
2. `/crear/2` Generar caracteristicas
3. `/crear/3` Revisar resultados
4. `/crear/4` Determinar ocupacion
5. `/crear/5` Elegir habilidades de ocupacion
6. `/crear/6` Distribuir puntos de habilidades
7. `/crear/7` Resumen final de habilidades
8. `/crear/8` Elegir Credito
9. `/crear/9` Crear trasfondo
10. `/crear/10` Equipar investigador
11. `/crear/resumen` Exportaciones JSON/PDF
# ctulhu7ed_charactersheet
