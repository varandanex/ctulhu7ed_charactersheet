import { professionCatalog, rulesCatalog } from "@/rules-data/catalog";
import {
  isAllowedOccupationSkill,
  isCharacteristicToken,
  normalizeSkillName,
  validateChoiceSelections,
} from "@/domain/occupation";
import type {
  CharacterDraft,
  CharacterSheet,
  Characteristics,
  DerivedStats,
  ValidationIssue,
} from "@/domain/types";

const characteristicKeys = [
  "FUE",
  "CON",
  "TAM",
  "DES",
  "APA",
  "INT",
  "POD",
  "EDU",
  "SUERTE",
] as const;

function rollDice(times: number, sides: number): number {
  let total = 0;
  for (let i = 0; i < times; i += 1) {
    total += Math.floor(Math.random() * sides) + 1;
  }
  return total;
}

function evaluateRollFormula(formula: string): number {
  const clean = formula.replace(/\s+/g, "");
  const match = clean.match(/^(?:\((\d+)D(\d+)\+(\d+)\)|(\d+)D(\d+))(?:x(\d+))?$/i);
  if (!match) {
    throw new Error(`Formula no soportada: ${formula}`);
  }

  const groupedTimes = match[1] ? Number(match[1]) : Number(match[4]);
  const groupedSides = match[2] ? Number(match[2]) : Number(match[5]);
  const groupedAdd = match[3] ? Number(match[3]) : 0;
  const multiplier = match[6] ? Number(match[6]) : 1;

  return (rollDice(groupedTimes, groupedSides) + groupedAdd) * multiplier;
}

export function rollCharacteristics(): Characteristics {
  const generation = rulesCatalog.characteristics_generation;
  return {
    FUE: evaluateRollFormula(generation.FUE),
    CON: evaluateRollFormula(generation.CON),
    TAM: evaluateRollFormula(generation.TAM),
    DES: evaluateRollFormula(generation.DES),
    APA: evaluateRollFormula(generation.APA),
    INT: evaluateRollFormula(generation.INT),
    POD: evaluateRollFormula(generation.POD),
    EDU: evaluateRollFormula(generation.EDU),
    SUERTE: evaluateRollFormula(generation.SUERTE),
  };
}

function parseRangeLabel(label: string): { min: number; max: number } {
  const [min, max] = label.split("-").map((chunk) => Number(chunk.trim()));
  return { min, max };
}

function getBuildAndDamageBonus(sumFueTam: number): { build: number; damageBonus: string } {
  const table = rulesCatalog.derived_stats.build_and_damage_bonus.by_sum_FUE_TAM;
  const direct = table.find((row) => sumFueTam >= row.min && sumFueTam <= row.max);
  if (direct) {
    return { build: direct.build, damageBonus: direct.damage_bonus };
  }

  if (sumFueTam > 524) {
    const extraSteps = Math.ceil((sumFueTam - 524) / 80);
    return {
      build: 6 + extraSteps,
      damageBonus: `+${5 + extraSteps}D6`,
    };
  }

  return { build: -2, damageBonus: "-2" };
}

function getAgeDecadePenalty(age: number): number {
  if (age >= 80) return 5;
  if (age >= 70) return 4;
  if (age >= 60) return 3;
  if (age >= 50) return 2;
  if (age >= 40) return 1;
  return 0;
}

function getEduImprovementRolls(age: number): number {
  if (age >= 80) return 4;
  if (age >= 70) return 4;
  if (age >= 60) return 4;
  if (age >= 50) return 3;
  if (age >= 40) return 2;
  if (age >= 20) return 1;
  return 0;
}

function applyEduImprovements(currentEdu: number, age: number): number {
  let edu = currentEdu;
  const rolls = getEduImprovementRolls(age);

  for (let i = 0; i < rolls; i += 1) {
    const d100 = rollDice(1, 100);
    if (d100 > edu) {
      edu = Math.min(99, edu + rollDice(1, 10));
    }
  }

  return edu;
}

export function applyAgeModifiers(base: Characteristics, age: number): Characteristics {
  const result = { ...base };

  if (age >= 15 && age <= 19) {
    result.EDU = Math.max(1, result.EDU - 5);
    const reduction = 5;
    const fueReduction = Math.floor(reduction / 2);
    const tamReduction = reduction - fueReduction;
    result.FUE = Math.max(1, result.FUE - fueReduction);
    result.TAM = Math.max(1, result.TAM - tamReduction);
    result.SUERTE = Math.max(result.SUERTE, evaluateRollFormula("3D6x5"));
  }

  if (age >= 40) {
    const decadePenaltyMap: Array<[number, number]> = [
      [40, 5],
      [50, 10],
      [60, 20],
      [70, 40],
      [80, 80],
    ];
    const totalPenalty = decadePenaltyMap.reduce((acc, [threshold, value]) => {
      if (age >= threshold) {
        return value;
      }
      return acc;
    }, 0);

    const perStatPenalty = Math.floor(totalPenalty / 3);
    result.FUE = Math.max(1, result.FUE - perStatPenalty);
    result.CON = Math.max(1, result.CON - perStatPenalty);
    result.DES = Math.max(1, result.DES - (totalPenalty - perStatPenalty * 2));

    const apaPenalty = age >= 80 ? 25 : age >= 70 ? 20 : age >= 60 ? 15 : age >= 50 ? 10 : 5;
    result.APA = Math.max(1, result.APA - apaPenalty);
  }

  result.EDU = applyEduImprovements(result.EDU, age);
  return result;
}

export function computeDerivedStats(characteristics: Characteristics, age: number): DerivedStats {
  const { CON, TAM, POD, DES, FUE } = characteristics;
  const corInicial = POD;
  const pmInicial = Math.floor(POD / 5);
  const pv = Math.floor((CON + TAM) / 10);

  let mov = 8;
  if (DES < TAM && FUE < TAM) {
    mov = 7;
  } else if (DES > TAM && FUE > TAM) {
    mov = 9;
  }
  mov -= getAgeDecadePenalty(age);

  const sumFueTam = FUE + TAM;
  const buildAndDamage = getBuildAndDamageBonus(sumFueTam);

  const hard = characteristicKeys.reduce((acc, key) => {
    acc[key] = Math.floor(characteristics[key] / 2);
    return acc;
  }, {} as Record<(typeof characteristicKeys)[number], number>);

  const extreme = characteristicKeys.reduce((acc, key) => {
    acc[key] = Math.floor(characteristics[key] / 5);
    return acc;
  }, {} as Record<(typeof characteristicKeys)[number], number>);

  return {
    corInicial,
    pmInicial,
    pv,
    mov,
    build: buildAndDamage.build,
    damageBonus: buildAndDamage.damageBonus,
    hard,
    extreme,
  };
}

function parseCreditRange(range: string): { min: number; max: number } {
  const [min, max] = range.split("-").map((n) => Number(n.trim()));
  return { min, max };
}

function isCreditSkill(skill: string): boolean {
  return normalizeSkillName(skill) === "credito";
}

export function evaluateOccupationPointsFormula(formula: string, characteristics: Characteristics): number {
  const normalized = formula.toUpperCase().replace(/\s+/g, "");

  function stripOuterParentheses(input: string): string {
    let value = input;
    while (value.startsWith("(") && value.endsWith(")")) {
      let depth = 0;
      let wrapsAll = true;
      for (let i = 0; i < value.length; i += 1) {
        const char = value[i];
        if (char === "(") depth += 1;
        if (char === ")") depth -= 1;
        if (depth === 0 && i < value.length - 1) {
          wrapsAll = false;
          break;
        }
      }
      if (!wrapsAll) break;
      value = value.slice(1, -1);
    }
    return value;
  }

  function splitAtTopLevel(input: string, separator: "+" | "O"): string[] {
    const parts: string[] = [];
    let depth = 0;
    let current = "";
    for (let i = 0; i < input.length; i += 1) {
      const char = input[i];
      if (char === "(") {
        depth += 1;
        current += char;
        continue;
      }
      if (char === ")") {
        depth -= 1;
        current += char;
        continue;
      }
      if (depth === 0 && char === separator) {
        if (separator === "O") {
          const prev = input[i - 1] ?? "";
          const next = input[i + 1] ?? "";
          const canSplit = (/\d|\)/.test(prev) && /[A-Z(]/.test(next)) || (/[A-Z]/.test(prev) && next === "(");
          if (!canSplit) {
            current += char;
            continue;
          }
        }
        parts.push(current);
        current = "";
        continue;
      }
      current += char;
    }
    parts.push(current);
    return parts.filter((part) => part.length > 0);
  }

  function evaluateToken(token: string): number {
    const cleaned = stripOuterParentheses(token);

    const plusParts = splitAtTopLevel(cleaned, "+");
    if (plusParts.length > 1) {
      return plusParts.reduce((sum, part) => sum + evaluateToken(part), 0);
    }

    const optionParts = splitAtTopLevel(cleaned, "O");
    if (optionParts.length > 1) {
      return Math.max(...optionParts.map((part) => evaluateToken(part)));
    }

    const multMatch = cleaned.match(/^([A-Z]+)X(\d+)$/);
    if (multMatch) {
      const stat = multMatch[1];
      const mult = Number(multMatch[2]);
      if (isCharacteristicToken(stat)) {
        return characteristics[stat] * mult;
      }
      return 0;
    }

    if (isCharacteristicToken(cleaned)) {
      return characteristics[cleaned];
    }

    return 0;
  }

  return evaluateToken(normalized);
}

export function validateSkillAllocation(
  occupationPoints: number,
  personalPoints: number,
  occupationAssigned: Record<string, number>,
  personalAssigned: Record<string, number>,
  occupationCredit: number = 0,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const cannotAllocateNames = rulesCatalog.skill_point_rules.cannot_allocate_to.map((x) => x.toLowerCase());
  const forbiddenInPersonal = Object.keys(personalAssigned).find((skill) =>
    cannotAllocateNames.some((forbidden) => skill.toLowerCase().includes(forbidden.replace(/\(.*\)/, "").trim())),
  );

  if (forbiddenInPersonal) {
    issues.push({
      code: "FORBIDDEN_SKILL",
      message: `${forbiddenInPersonal} no puede recibir puntos en creacion inicial`,
      field: "skills.personal",
      severity: "error",
    });
  }

  const totalOccupationSkills = Object.entries(occupationAssigned).reduce((sum, [skill, points]) => {
    if (isCreditSkill(skill)) return sum;
    return sum + points;
  }, 0);
  const totalOccupation = totalOccupationSkills + occupationCredit;
  const totalPersonal = Object.entries(personalAssigned).reduce((sum, [skill, points]) => {
    if (isCreditSkill(skill)) return sum;
    return sum + points;
  }, 0);

  if (totalOccupation > occupationPoints) {
    issues.push({
      code: "OCCUPATION_POINTS_EXCEEDED",
      message: "Se excedieron los puntos de ocupacion (incluyendo Credito).",
      field: "skills.occupation",
      severity: "error",
    });
  }

  if (totalPersonal > personalPoints) {
    issues.push({
      code: "PERSONAL_POINTS_EXCEEDED",
      message: "Se excedieron los puntos de interes personal.",
      field: "skills.personal",
      severity: "error",
    });
  }

  return issues;
}

function hasAllCharacteristics(draft: CharacterDraft): draft is CharacterDraft & { characteristics: Characteristics } {
  return characteristicKeys.every((key) => typeof draft.characteristics[key] === "number");
}

export function validateStep(stepId: number, draft: CharacterDraft): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (stepId >= 1) {
    if (draft.age < 15 || draft.age > 90) {
      issues.push({
        code: "AGE_RANGE",
        message: "Edad fuera de 15-90. Requiere confirmacion del guardian.",
        field: "age",
        severity: "warning",
      });
    }

    if (!hasAllCharacteristics(draft)) {
      issues.push({
        code: "MISSING_CHARACTERISTICS",
        message: "Completa todas las caracteristicas.",
        field: "characteristics",
        severity: "error",
      });
    }

    if (
      draft.mode === "random" &&
      hasAllCharacteristics(draft) &&
      typeof draft.lastRolledAge === "number" &&
      draft.lastRolledAge !== draft.age
    ) {
      issues.push({
        code: "AGE_ROLL_MISMATCH",
        message: "La edad cambio tras la tirada aleatoria. Repite la tirada para reaplicar modificadores de edad.",
        field: "age",
        severity: "warning",
      });
    }
  }

  if (stepId >= 2) {
    if (!draft.occupation) {
      issues.push({
        code: "MISSING_OCCUPATION",
        message: "Selecciona una ocupacion.",
        field: "occupation",
        severity: "error",
      });
    } else {
      const occupation = professionCatalog.occupations.find((occ) => occ.name === draft.occupation?.name);
      if (!occupation) {
        issues.push({
          code: "INVALID_OCCUPATION",
          message: "La ocupacion seleccionada no existe en el catalogo.",
          field: "occupation.name",
          severity: "error",
        });
      } else {
        const range = parseCreditRange(occupation.credit_range);
        if (draft.occupation.creditRating < range.min || draft.occupation.creditRating > range.max) {
          issues.push({
            code: "CREDIT_RANGE",
            message: `Credito fuera del rango permitido (${range.min}-${range.max}).`,
            field: "occupation.creditRating",
            severity: "error",
          });
        }

        const choiceSelectionErrors = validateChoiceSelections(draft.occupation);
        for (const message of choiceSelectionErrors) {
          issues.push({
            code: "OCCUPATION_CHOICE_GROUP",
            message,
            field: "occupation.selectedChoices",
            severity: "error",
          });
        }
      }
    }
  }

  if (stepId >= 3 && hasAllCharacteristics(draft) && draft.occupation) {
    const occupationDef = professionCatalog.occupations.find((occ) => occ.name === draft.occupation?.name);
    if (occupationDef) {
      const occupationPoints = evaluateOccupationPointsFormula(
        occupationDef.occupation_points_formula,
        draft.characteristics,
      );
      const personalPoints = draft.characteristics.INT * 2;
      issues.push(
        ...validateSkillAllocation(
          occupationPoints,
          personalPoints,
          draft.skills.occupation,
          draft.skills.personal,
          draft.occupation.creditRating,
        ),
      );

      const occupationAllocationErrors = Object.entries(draft.skills.occupation)
        .filter(([skill, points]) => points > 0 && !isCreditSkill(skill))
        .filter(([skill]) => !isAllowedOccupationSkill(draft.occupation, skill));
      for (const [skill] of occupationAllocationErrors) {
        issues.push({
          code: "INVALID_OCCUPATION_SKILL",
          message: `${skill} no pertenece a las habilidades permitidas por la ocupacion seleccionada.`,
          field: `skills.occupation.${skill}`,
          severity: "error",
        });
      }
    }
  }

  if (stepId >= 4) {
    const requiredBackgroundFields = [
      draft.background.descripcionPersonal,
      draft.background.ideologiaCreencias,
      draft.background.allegados,
      draft.background.lugaresSignificativos,
      draft.background.posesionesPreciadas,
      draft.background.rasgos,
    ];
    const completedBackgroundFields = requiredBackgroundFields.filter((value) => value && value.trim().length > 0).length;

    if (completedBackgroundFields < requiredBackgroundFields.length) {
      issues.push({
        code: "MISSING_BACKGROUND_MINIMUM",
        message:
          "Completa las 6 categorias principales de trasfondo: descripcion personal, ideologia/creencias, allegados, lugares significativos, posesiones preciadas y rasgos.",
        field: "background",
        severity: "error",
      });
    }
  }

  return issues;
}

export function finalizeCharacter(draft: CharacterDraft): CharacterSheet {
  const issues = validateStep(5, draft).filter((issue) => issue.severity === "error");
  if (issues.length > 0) {
    throw new Error(`No se puede finalizar: ${issues.map((i) => i.message).join(" | ")}`);
  }

  if (!hasAllCharacteristics(draft) || !draft.occupation) {
    throw new Error("Draft incompleto");
  }

  const finalizedCharacteristics = { ...draft.characteristics };
  finalizedCharacteristics.EDU = Math.min(99, finalizedCharacteristics.EDU);

  return {
    mode: draft.mode,
    age: draft.age,
    era: draft.era,
    characteristics: finalizedCharacteristics,
    derivedStats: computeDerivedStats(finalizedCharacteristics, draft.age),
    occupation: draft.occupation,
    skills: draft.skills,
    background: {
      descripcionPersonal: draft.background.descripcionPersonal ?? "",
      ideologiaCreencias: draft.background.ideologiaCreencias ?? "",
      allegados: draft.background.allegados ?? "",
      lugaresSignificativos: draft.background.lugaresSignificativos ?? "",
      posesionesPreciadas: draft.background.posesionesPreciadas ?? "",
      rasgos: draft.background.rasgos ?? "",
      vinculoPrincipal: draft.background.vinculoPrincipal ?? "",
    },
    identity: {
      nombre: draft.identity.nombre ?? "",
      genero: draft.identity.genero ?? "",
      residenciaActual: draft.identity.residenciaActual ?? "",
      lugarNacimiento: draft.identity.lugarNacimiento ?? "",
      retratoUrl: draft.identity.retratoUrl ?? "",
    },
    companions: draft.companions ?? [],
    equipment: draft.equipment,
  };
}
