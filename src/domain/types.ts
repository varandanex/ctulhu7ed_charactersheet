export type CharacteristicKey =
  | "FUE"
  | "CON"
  | "TAM"
  | "DES"
  | "APA"
  | "INT"
  | "POD"
  | "EDU"
  | "SUERTE";

export type Characteristics = Record<CharacteristicKey, number>;

export interface DerivedStats {
  corInicial: number;
  pmInicial: number;
  pv: number;
  mov: number;
  build: number;
  damageBonus: string;
  hard: Record<CharacteristicKey, number>;
  extreme: Record<CharacteristicKey, number>;
}

export interface OccupationSelection {
  name: string;
  creditRating: number;
  selectedSkills: string[];
  selectedChoices?: Record<string, string[]>;
}

export interface SkillAllocation {
  occupation: Record<string, number>;
  personal: Record<string, number>;
}

export interface CharacterBackground {
  descripcionPersonal: string;
  ideologiaCreencias: string;
  allegados: string;
  lugaresSignificativos: string;
  posesionesPreciadas: string;
  rasgos: string;
  vinculoPrincipal?: string;
}

export interface CharacterEquipment {
  spendingLevel?: string;
  cash?: string;
  assets?: string;
  items?: string[];
  notes: string;
}

export interface CharacterIdentity {
  nombre: string;
  genero: string;
  residenciaActual: string;
  lugarNacimiento: string;
  retratoUrl?: string;
}

export interface CharacterCompanion {
  personaje: string;
  jugador: string;
  resumen: string;
}

export interface CharacterDraft {
  mode: "random" | "manual";
  age: number;
  lastRolledAge?: number;
  era?: string;
  characteristics: Partial<Characteristics>;
  occupation?: OccupationSelection;
  skills: SkillAllocation;
  background: Partial<CharacterBackground>;
  identity: CharacterIdentity;
  companions: CharacterCompanion[];
  equipment: CharacterEquipment;
}

export interface CharacterSheet {
  mode: "random" | "manual";
  age: number;
  era?: string;
  characteristics: Characteristics;
  derivedStats: DerivedStats;
  occupation: OccupationSelection;
  skills: SkillAllocation;
  background: CharacterBackground;
  identity: CharacterIdentity;
  companions: CharacterCompanion[];
  equipment: CharacterEquipment;
}

export interface ValidationIssue {
  code: string;
  message: string;
  field: string;
  severity: "error" | "warning";
}
