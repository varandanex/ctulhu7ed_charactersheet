import { describe, expect, it } from "vitest";
import {
  applyAgeModifiers,
  computeSkillBreakdown,
  computeDerivedStats,
  evaluateOccupationPointsFormula,
  rollCharacteristicWithAgeModifiers,
  rollCharacteristicWithAgeModifiersDetailed,
  validateStep,
  validateSkillAllocation,
} from "@/domain/rules";
import type { CharacterDraft, Characteristics } from "@/domain/types";

const sampleCharacteristics: Characteristics = {
  FUE: 60,
  CON: 50,
  TAM: 65,
  DES: 55,
  APA: 45,
  INT: 70,
  POD: 55,
  EDU: 80,
  SUERTE: 50,
};
const defaultAllocation = {
  youthFuePenalty: 2,
  youthTamPenalty: 3,
  matureFuePenalty: 1,
  matureConPenalty: 1,
  matureDesPenalty: 3,
};

describe("domain rules", () => {
  it("computes derived stats with expected values", () => {
    const derived = computeDerivedStats(sampleCharacteristics, 25);

    expect(derived.pv).toBe(Math.floor((50 + 65) / 10));
    expect(derived.pmInicial).toBe(Math.floor(55 / 5));
    expect(derived.corInicial).toBe(55);
    expect(derived.hard.EDU).toBe(40);
    expect(derived.extreme.INT).toBe(14);
  });

  it("evaluates occupation formulas with options", () => {
    const pointsA = evaluateOccupationPointsFormula("EDU x2 + (DES x2 o FUE x2)", sampleCharacteristics, {
      choice_0: "DESX2",
    });
    const pointsB = evaluateOccupationPointsFormula("EDU x2 + APA x2", sampleCharacteristics);

    expect(pointsA).toBe(80 * 2 + 55 * 2);
    expect(pointsB).toBe(80 * 2 + 45 * 2);
  });

  it("evaluates formulas with parenthesized first term", () => {
    const points = evaluateOccupationPointsFormula("(APA x2) + (DES x2 o FUE x2)", sampleCharacteristics, {
      choice_0: "FUEX2",
    });
    expect(points).toBe(45 * 2 + 60 * 2);
  });

  it("evaluates formulas with three alternative characteristics", () => {
    const points = evaluateOccupationPointsFormula("EDU x2 + (APA x2 o DES x2 o FUE x2)", sampleCharacteristics, {
      choice_0: "APAX2",
    });
    expect(points).toBe(80 * 2 + 45 * 2);
  });

  it("applies EDU improvement rolls for age 20+", () => {
    const base: Characteristics = {
      FUE: 50,
      CON: 50,
      TAM: 50,
      DES: 50,
      APA: 50,
      INT: 50,
      POD: 50,
      EDU: 40,
      SUERTE: 50,
    };
    const modified = applyAgeModifiers(base, 25);
    expect(modified.EDU).toBeGreaterThanOrEqual(40);
    expect(modified.EDU).toBeLessThanOrEqual(99);
  });

  it("rejects forbidden skills for personal interest", () => {
    const issues = validateSkillAllocation(100, 100, { Psicologia: 10 }, { "Mitos de Cthulhu": 10 });
    expect(issues.some((issue) => issue.code === "FORBIDDEN_SKILL")).toBe(true);
  });

  it("computes non-zero base for variant skill names", () => {
    const computed = computeSkillBreakdown(sampleCharacteristics, {
      occupation: {
        "Conducir automovil (o camioneta)": 10,
        "Arte (Literatura)": 10,
      },
      personal: {},
    });

    expect(computed["Conducir automovil (o camioneta)"]?.base).toBe(20);
    expect(computed["Arte (Literatura)"]?.base).toBe(5);
  });

  it("counts credit as occupation points", () => {
    const issues = validateSkillAllocation(100, 100, { Psicologia: 30 }, { Historia: 10 }, 80);
    expect(issues.some((issue) => issue.code === "OCCUPATION_POINTS_EXCEEDED")).toBe(true);
  });

  it("ignores credit skill values in skill buckets", () => {
    const issues = validateSkillAllocation(120, 100, { Credito: 50, Psicologia: 10 }, { Credito: 90, Historia: 20 }, 70);
    expect(issues.some((issue) => issue.code === "OCCUPATION_POINTS_EXCEEDED")).toBe(false);
    expect(issues.some((issue) => issue.code === "PERSONAL_POINTS_EXCEEDED")).toBe(false);
  });

  it("validates occupation budget including credit rating", () => {
    const draft: CharacterDraft = {
      mode: "random",
      age: 25,
      era: "clasica",
      agePenaltyAllocation: defaultAllocation,
      characteristics: sampleCharacteristics,
      occupation: {
        name: "Abogado",
        creditRating: 80,
        selectedSkills: ["Buscar libros"],
        selectedChoices: {
          "0:interpersonales": ["Charlataneria", "Encanto"],
          "1:libres": ["Descubrir", "Historia"],
        },
        formulaChoices: {},
      },
      skills: {
        occupation: {
          "Buscar libros": 241,
        },
        personal: {},
      },
      background: {},
      identity: {
        nombre: "",
        genero: "",
        residenciaActual: "",
        lugarNacimiento: "",
      },
      companions: [],
      equipment: { notes: "", spendingLevel: "", cash: "", assets: "", items: [] },
    };

    const issues = validateStep(5, draft);
    expect(issues.some((issue) => issue.code === "OCCUPATION_POINTS_EXCEEDED")).toBe(true);
  });

  it("rejects occupation points assigned to non-occupation skills", () => {
    const draft: CharacterDraft = {
      mode: "random",
      age: 25,
      era: "clasica",
      agePenaltyAllocation: defaultAllocation,
      characteristics: sampleCharacteristics,
      occupation: {
        name: "Abogado",
        creditRating: 40,
        selectedSkills: [],
        selectedChoices: {
          "0:interpersonales": ["Persuasion", "Encanto"],
          "1:libres": ["Historia", "Descubrir"],
        },
        formulaChoices: {},
      },
      skills: {
        occupation: {
          Pilotar: 20,
        },
        personal: {},
      },
      background: {},
      identity: {
        nombre: "",
        genero: "",
        residenciaActual: "",
        lugarNacimiento: "",
      },
      companions: [],
      equipment: { notes: "", spendingLevel: "", cash: "", assets: "", items: [] },
    };

    const issues = validateStep(5, draft);
    expect(issues.some((issue) => issue.code === "INVALID_OCCUPATION_SKILL")).toBe(true);
  });

  it("requires minimum background and core connection in step 6", () => {
    const draft: CharacterDraft = {
      mode: "random",
      age: 25,
      era: "clasica",
      agePenaltyAllocation: defaultAllocation,
      characteristics: sampleCharacteristics,
      occupation: {
        name: "Abogado",
        creditRating: 40,
        selectedSkills: [],
        selectedChoices: {
          "0:interpersonales": ["Persuasion", "Encanto"],
          "1:libres": ["Historia", "Descubrir"],
        },
        formulaChoices: {},
      },
      skills: {
        occupation: {
          "Buscar libros": 100,
        },
        personal: {},
      },
      background: {
        descripcionPersonal: "Reservado y meticuloso.",
        ideologiaCreencias: "Confia en la ley.",
        allegados: "Su hermana Clara.",
        lugaresSignificativos: "",
        posesionesPreciadas: "",
        rasgos: "",
        vinculoPrincipal: "",
      },
      identity: {
        nombre: "",
        genero: "",
        residenciaActual: "",
        lugarNacimiento: "",
      },
      companions: [],
      equipment: { notes: "", spendingLevel: "", cash: "", assets: "", items: [] },
    };

    const missingCoreFields = validateStep(6, draft);
    expect(missingCoreFields.some((issue) => issue.code === "MISSING_BACKGROUND_MINIMUM")).toBe(false);
    expect(missingCoreFields.some((issue) => issue.code === "MISSING_CORE_CONNECTION")).toBe(true);

    draft.background.vinculoPrincipal = "Su hermana Clara";
    const completeBackground = validateStep(6, draft);
    expect(completeBackground.some((issue) => issue.code === "MISSING_BACKGROUND_MINIMUM")).toBe(false);
    expect(completeBackground.some((issue) => issue.code === "MISSING_CORE_CONNECTION")).toBe(false);
  });

  it("warns when age changes after random roll generation", () => {
    const draft: CharacterDraft = {
      mode: "random",
      age: 40,
      lastRolledAge: 25,
      era: "clasica",
      agePenaltyAllocation: defaultAllocation,
      characteristics: sampleCharacteristics,
      occupation: undefined,
      skills: {
        occupation: {},
        personal: {},
      },
      background: {},
      identity: {
        nombre: "",
        genero: "",
        residenciaActual: "",
        lugarNacimiento: "",
      },
      companions: [],
      equipment: { notes: "", spendingLevel: "", cash: "", assets: "", items: [] },
    };

    const issues = validateStep(2, draft);
    expect(issues.some((issue) => issue.code === "AGE_ROLL_MISMATCH" && issue.severity === "warning")).toBe(true);
  });

  it("blocks step 1 when mature age penalties do not match required total", () => {
    const draft: CharacterDraft = {
      mode: "random",
      age: 47,
      era: "clasica",
      agePenaltyAllocation: {
        ...defaultAllocation,
        matureFuePenalty: 1,
        matureConPenalty: 9,
        matureDesPenalty: 3,
      },
      characteristics: {},
      occupation: undefined,
      skills: {
        occupation: {},
        personal: {},
      },
      background: {},
      identity: {
        nombre: "",
        genero: "",
        residenciaActual: "",
        lugarNacimiento: "",
      },
      companions: [],
      equipment: { notes: "", spendingLevel: "", cash: "", assets: "", items: [] },
    };

    const issues = validateStep(1, draft);
    expect(issues.some((issue) => issue.code === "AGE_MATURE_PENALTY_MISMATCH" && issue.severity === "error")).toBe(true);
  });

  it("blocks step 1 when youth penalties do not sum exactly to 5", () => {
    const draft: CharacterDraft = {
      mode: "random",
      age: 17,
      era: "clasica",
      agePenaltyAllocation: {
        ...defaultAllocation,
        youthFuePenalty: 4,
        youthTamPenalty: 0,
      },
      characteristics: {},
      occupation: undefined,
      skills: {
        occupation: {},
        personal: {},
      },
      background: {},
      identity: {
        nombre: "",
        genero: "",
        residenciaActual: "",
        lugarNacimiento: "",
      },
      companions: [],
      equipment: { notes: "", spendingLevel: "", cash: "", assets: "", items: [] },
    };

    const issues = validateStep(1, draft);
    expect(issues.some((issue) => issue.code === "AGE_YOUTH_PENALTY_MISMATCH" && issue.severity === "error")).toBe(true);
  });

  it("rolls a single characteristic with age modifiers applied", () => {
    const rolled = rollCharacteristicWithAgeModifiers("EDU", 45, defaultAllocation);
    expect(rolled).toBeGreaterThanOrEqual(1);
    expect(rolled).toBeLessThanOrEqual(99);
  });

  it("returns detailed breakdown for single characteristic roll", () => {
    const detail = rollCharacteristicWithAgeModifiersDetailed("FUE", 25, defaultAllocation);
    expect(detail.steps.length).toBeGreaterThan(0);
    expect(detail.steps[0]).toContain("3D6x5");
    expect(detail.finalValue).toBeGreaterThanOrEqual(1);
    expect(detail.finalValue).toBeLessThanOrEqual(99);
  });
});
