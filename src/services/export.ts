import type { CharacterSheet } from "@/domain/types";

export interface PrintableCharacterModel {
  title: string;
  sections: Array<{ label: string; value: string }>;
}

export function toCharacterJson(sheet: CharacterSheet): string {
  return JSON.stringify(sheet, null, 2);
}

export function toPrintablePdfModel(sheet: CharacterSheet): PrintableCharacterModel {
  return {
    title: "Hoja de Investigador - La Llamada de Cthulhu 7e",
    sections: [
      {
        label: "Identidad",
        value: [
          sheet.identity.nombre && `Nombre: ${sheet.identity.nombre}`,
          sheet.identity.genero && `Genero: ${sheet.identity.genero}`,
          sheet.identity.residenciaActual && `Residencia: ${sheet.identity.residenciaActual}`,
          sheet.identity.lugarNacimiento && `Nacimiento: ${sheet.identity.lugarNacimiento}`,
        ]
          .filter(Boolean)
          .join(" | "),
      },
      { label: "Edad", value: String(sheet.age) },
      { label: "Modo", value: sheet.mode },
      { label: "Ocupacion", value: sheet.occupation.name },
      { label: "Credito", value: String(sheet.occupation.creditRating) },
      { label: "PV", value: String(sheet.derivedStats.pv) },
      { label: "PM", value: String(sheet.derivedStats.pmInicial) },
      { label: "MOV", value: String(sheet.derivedStats.mov) },
      { label: "DB", value: sheet.derivedStats.damageBonus },
      {
        label: "Caracteristicas",
        value: Object.entries(sheet.characteristics)
          .map(([key, value]) => `${key}: ${value}`)
          .join(", "),
      },
      {
        label: "Habilidades (totales)",
        value: Object.entries(sheet.computedSkills)
          .filter(([, value]) => value.total > 0)
          .map(([key, value]) => `${key}: ${value.total} (${value.hard}/${value.extreme})`)
          .join(" | "),
      },
      {
        label: "Trasfondo",
        value: Object.values(sheet.background)
          .filter(Boolean)
          .join(" | "),
      },
      {
        label: "Finanzas",
        value: [
          sheet.equipment.spendingLevel && `Nivel de gasto: ${sheet.equipment.spendingLevel}`,
          sheet.equipment.cash && `Efectivo: ${sheet.equipment.cash}`,
          sheet.equipment.assets && `Propiedades: ${sheet.equipment.assets}`,
        ]
          .filter(Boolean)
          .join(" | "),
      },
      {
        label: "Companeros",
        value:
          sheet.companions.length > 0
            ? sheet.companions
                .map((item) => [item.personaje, item.jugador, item.resumen].filter(Boolean).join(" - "))
                .join(" | ")
            : "Sin companeros anotados",
      },
      { label: "Equipo", value: sheet.equipment.notes || "Sin notas" },
    ],
  };
}
