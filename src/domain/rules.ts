import { investigatorSkillsCatalog, professionCatalog, rulesCatalog } from "@/rules-data/catalog";
import {
  isAllowedOccupationSkill,
  isCharacteristicToken,
  normalizeSkillName,
  validateChoiceSelections,
} from "@/domain/occupation";
import type {
  AgePenaltyAllocation,
  CharacterDraft,
  CharacterSheet,
  Characteristics,
  DerivedStats,
  SkillComputedValue,
  ValidationIssue,
} from "@/domain/types";

const characteristicKeys = ["FUE", "CON", "TAM", "DES", "APA", "INT", "POD", "EDU", "SUERTE"] as const;
export const SKILL_CREATION_MAX = 75;
export const SKILL_ABSOLUTE_MAX = 99;

export interface OccupationFormulaChoiceGroup {
  key: string;
  options: string[];
}

export interface RollFormulaDetail {
  formula: string;
  rolls: number[];
  add: number;
  multiplier: number;
  subtotal: number;
  total: number;
}

export interface CharacteristicRollDetail {
  key: keyof Characteristics;
  base: RollFormulaDetail;
  finalValue: number;
  steps: string[];
}

function rollDiceValues(times: number, sides: number): number[] {
  const rolls: number[] = [];
  for (let i = 0; i < times; i += 1) {
    rolls.push(Math.floor(Math.random() * sides) + 1);
  }
  return rolls;
}

function evaluateRollFormula(formula: string): number {
  return evaluateRollFormulaDetailed(formula).total;
}

function evaluateRollFormulaDetailed(formula: string): RollFormulaDetail {
  const clean = formula.replace(/\s+/g, "");
  const match = clean.match(/^(?:\((\d+)D(\d+)\+(\d+)\)|(\d+)D(\d+))(?:x(\d+))?$/i);
  if (!match) {
    throw new Error(`Formula no soportada: ${formula}`);
  }

  const groupedTimes = match[1] ? Number(match[1]) : Number(match[4]);
  const groupedSides = match[2] ? Number(match[2]) : Number(match[5]);
  const groupedAdd = match[3] ? Number(match[3]) : 0;
  const multiplier = match[6] ? Number(match[6]) : 1;
  const rolls = rollDiceValues(groupedTimes, groupedSides);
  const rollsTotal = rolls.reduce((sum, value) => sum + value, 0);
  const subtotal = rollsTotal + groupedAdd;
  const total = subtotal * multiplier;

  return {
    formula,
    rolls,
    add: groupedAdd,
    multiplier,
    subtotal,
    total,
  };
}

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

function clampPenaltyAllocation(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function getMaturePenaltyTotal(age: number): number {
  if (age >= 80) return 80;
  if (age >= 70) return 40;
  if (age >= 60) return 20;
  if (age >= 50) return 10;
  if (age >= 40) return 5;
  return 0;
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
    const d100 = rollDiceValues(1, 100)[0];
    if (d100 > edu) {
      edu = Math.min(99, edu + rollDiceValues(1, 10)[0]);
    }
  }

  return edu;
}

function applyEduImprovementsDetailed(currentEdu: number, age: number): { value: number; steps: string[] } {
  let edu = currentEdu;
  const rolls = getEduImprovementRolls(age);
  const steps: string[] = [];

  for (let i = 0; i < rolls; i += 1) {
    const eduBefore = edu;
    const d100 = rollDiceValues(1, 100)[0];
    if (d100 > eduBefore) {
      const improvement = rollDiceValues(1, 10)[0];
      edu = Math.min(99, edu + improvement);
      steps.push(`Mejora EDU ${i + 1}: 1D100=${d100} > ${eduBefore}, +1D10=${improvement} => ${edu}`);
    } else {
      steps.push(`Mejora EDU ${i + 1}: 1D100=${d100} <= ${eduBefore}, sin mejora`);
    }
  }

  return { value: edu, steps };
}

function getDefaultAgePenaltyAllocation(age: number): AgePenaltyAllocation {
  const youthPenalty = 5;
  const youthFuePenalty = Math.floor(youthPenalty / 2);
  const youthTamPenalty = youthPenalty - youthFuePenalty;

  const maturePenalty = getMaturePenaltyTotal(age);
  const matureFuePenalty = Math.floor(maturePenalty / 3);
  const matureConPenalty = Math.floor(maturePenalty / 3);
  const matureDesPenalty = maturePenalty - matureFuePenalty - matureConPenalty;

  return {
    youthFuePenalty,
    youthTamPenalty,
    matureFuePenalty,
    matureConPenalty,
    matureDesPenalty,
  };
}

export function extractOccupationFormulaChoiceGroups(formula: string): OccupationFormulaChoiceGroup[] {
  const normalized = formula.toUpperCase().replace(/\s+/g, "");
  const groups: OccupationFormulaChoiceGroup[] = [];

  let depth = 0;
  let groupStart = -1;

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];

    if (char === "(") {
      if (depth === 0) {
        groupStart = i;
      }
      depth += 1;
      continue;
    }

    if (char === ")") {
      depth -= 1;
      if (depth === 0 && groupStart >= 0) {
        const fullGroup = normalized.slice(groupStart + 1, i);
        const options = splitAtTopLevel(fullGroup, "O");
        if (options.length > 1) {
          groups.push({
            key: `choice_${groups.length}`,
            options,
          });
        }
        groupStart = -1;
      }
    }
  }

  return groups;
}

function getSelectedFormulaOption(
  groupKey: string,
  options: string[],
  formulaChoices?: Record<string, string>,
): string {
  const selected = (formulaChoices?.[groupKey] ?? "").toUpperCase().replace(/\s+/g, "");
  if (selected.length > 0 && options.includes(selected)) {
    return selected;
  }
  return options[0];
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

export function rollCharacteristicWithAgeModifiers(
  key: keyof Characteristics,
  age: number,
  allocation: AgePenaltyAllocation = getDefaultAgePenaltyAllocation(age),
): number {
  return rollCharacteristicWithAgeModifiersDetailed(key, age, allocation).finalValue;
}

export function rollCharacteristicWithAgeModifiersDetailed(
  key: keyof Characteristics,
  age: number,
  allocation: AgePenaltyAllocation = getDefaultAgePenaltyAllocation(age),
): CharacteristicRollDetail {
  const generation = rulesCatalog.characteristics_generation;
  const base = evaluateRollFormulaDetailed(generation[key]);
  let value = base.total;
  const steps = [
    `${base.formula}: [${base.rolls.join(", ")}]` +
      `${base.add > 0 ? ` + ${base.add}` : ""} = ${base.subtotal}` +
      `${base.multiplier > 1 ? ` x${base.multiplier}` : ""} => ${base.total}`,
  ];
  const fallback = getDefaultAgePenaltyAllocation(age);

  if (age >= 15 && age <= 19) {
    const youthFue = clampPenaltyAllocation(allocation.youthFuePenalty);
    const youthTam = clampPenaltyAllocation(allocation.youthTamPenalty);
    const youthTotal = youthFue + youthTam;
    const fuePenalty = youthTotal === 5 ? youthFue : fallback.youthFuePenalty;
    const tamPenalty = youthTotal === 5 ? youthTam : fallback.youthTamPenalty;

    if (key === "EDU") {
      value = Math.max(1, value - 5);
      steps.push(`Edad 15-19 EDU: -5 => ${value}`);
    }
    if (key === "FUE") {
      value = Math.max(1, value - fuePenalty);
      steps.push(`Edad 15-19 FUE: -${fuePenalty} => ${value}`);
    }
    if (key === "TAM") {
      value = Math.max(1, value - tamPenalty);
      steps.push(`Edad 15-19 TAM: -${tamPenalty} => ${value}`);
    }
    if (key === "SUERTE") {
      const secondLuck = evaluateRollFormulaDetailed("3D6x5");
      const secondValue = secondLuck.total;
      const previous = value;
      value = Math.max(value, secondValue);
      steps.push(`Edad 15-19 SUERTE 2a: [${secondLuck.rolls.join(", ")}] = ${secondLuck.subtotal} x5 => ${secondValue}`);
      steps.push(`Mejor de dos SUERTE: max(${previous}, ${secondValue}) => ${value}`);
    }
  }

  const matureTotalRequired = getMaturePenaltyTotal(age);
  if (matureTotalRequired > 0) {
    const matureFue = clampPenaltyAllocation(allocation.matureFuePenalty);
    const matureCon = clampPenaltyAllocation(allocation.matureConPenalty);
    const matureDes = clampPenaltyAllocation(allocation.matureDesPenalty);
    const matureTotal = matureFue + matureCon + matureDes;
    const fuePenalty = matureTotal === matureTotalRequired ? matureFue : fallback.matureFuePenalty;
    const conPenalty = matureTotal === matureTotalRequired ? matureCon : fallback.matureConPenalty;
    const desPenalty = matureTotal === matureTotalRequired ? matureDes : fallback.matureDesPenalty;
    const apaPenalty = age >= 80 ? 25 : age >= 70 ? 20 : age >= 60 ? 15 : age >= 50 ? 10 : 5;

    if (key === "FUE") {
      value = Math.max(1, value - fuePenalty);
      steps.push(`Edad ${age} FUE: -${fuePenalty} => ${value}`);
    }
    if (key === "CON") {
      value = Math.max(1, value - conPenalty);
      steps.push(`Edad ${age} CON: -${conPenalty} => ${value}`);
    }
    if (key === "DES") {
      value = Math.max(1, value - desPenalty);
      steps.push(`Edad ${age} DES: -${desPenalty} => ${value}`);
    }
    if (key === "APA") {
      value = Math.max(1, value - apaPenalty);
      steps.push(`Edad ${age} APA: -${apaPenalty} => ${value}`);
    }
  }

  if (key === "EDU") {
    const improved = applyEduImprovementsDetailed(value, age);
    value = improved.value;
    if (improved.steps.length > 0) {
      steps.push(...improved.steps);
    }
  }

  return {
    key,
    base,
    finalValue: value,
    steps,
  };
}

function parseCreditRange(range: string): { min: number; max: number } {
  const [min, max] = range.split("-").map((n) => Number(n.trim()));
  return { min, max };
}

function isCreditSkill(skill: string): boolean {
  return normalizeSkillName(skill) === "credito";
}

export function applyAgeModifiers(
  base: Characteristics,
  age: number,
  allocation: AgePenaltyAllocation = getDefaultAgePenaltyAllocation(age),
): Characteristics {
  const result = { ...base };
  const fallback = getDefaultAgePenaltyAllocation(age);

  if (age >= 15 && age <= 19) {
    result.EDU = Math.max(1, result.EDU - 5);

    const youthFue = clampPenaltyAllocation(allocation.youthFuePenalty);
    const youthTam = clampPenaltyAllocation(allocation.youthTamPenalty);
    const youthTotal = youthFue + youthTam;

    const fuePenalty = youthTotal === 5 ? youthFue : fallback.youthFuePenalty;
    const tamPenalty = youthTotal === 5 ? youthTam : fallback.youthTamPenalty;

    result.FUE = Math.max(1, result.FUE - fuePenalty);
    result.TAM = Math.max(1, result.TAM - tamPenalty);

    // Regla 15-19: tirar Suerte dos veces y conservar la mayor.
    result.SUERTE = Math.max(result.SUERTE, evaluateRollFormula("3D6x5"));
  }

  const matureTotalRequired = getMaturePenaltyTotal(age);
  if (matureTotalRequired > 0) {
    const matureFue = clampPenaltyAllocation(allocation.matureFuePenalty);
    const matureCon = clampPenaltyAllocation(allocation.matureConPenalty);
    const matureDes = clampPenaltyAllocation(allocation.matureDesPenalty);
    const matureTotal = matureFue + matureCon + matureDes;

    const fuePenalty = matureTotal === matureTotalRequired ? matureFue : fallback.matureFuePenalty;
    const conPenalty = matureTotal === matureTotalRequired ? matureCon : fallback.matureConPenalty;
    const desPenalty = matureTotal === matureTotalRequired ? matureDes : fallback.matureDesPenalty;

    result.FUE = Math.max(1, result.FUE - fuePenalty);
    result.CON = Math.max(1, result.CON - conPenalty);
    result.DES = Math.max(1, result.DES - desPenalty);

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

export function evaluateOccupationPointsFormula(
  formula: string,
  characteristics: Characteristics,
  formulaChoices?: Record<string, string>,
): number {
  const normalized = formula.toUpperCase().replace(/\s+/g, "");
  const choiceGroups = extractOccupationFormulaChoiceGroups(formula);

  let nextChoiceIndex = 0;
  function evaluateToken(token: string): number {
    const cleaned = stripOuterParentheses(token);

    const plusParts = splitAtTopLevel(cleaned, "+");
    if (plusParts.length > 1) {
      return plusParts.reduce((sum, part) => sum + evaluateToken(part), 0);
    }

    const optionParts = splitAtTopLevel(cleaned, "O");
    if (optionParts.length > 1) {
      const group = choiceGroups[nextChoiceIndex];
      nextChoiceIndex += 1;
      const selectedOption = getSelectedFormulaOption(group?.key ?? "", optionParts, formulaChoices);
      return evaluateToken(selectedOption);
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

export function pickHighestOccupationFormulaChoices(
  formula: string,
  characteristics: Characteristics,
): Record<string, string> {
  const groups = extractOccupationFormulaChoiceGroups(formula);
  if (groups.length === 0) return {};

  let bestPoints = Number.NEGATIVE_INFINITY;
  let bestChoices: Record<string, string> = {};
  const currentChoices: Record<string, string> = {};

  function walk(groupIndex: number) {
    if (groupIndex >= groups.length) {
      const points = evaluateOccupationPointsFormula(formula, characteristics, currentChoices);
      if (points > bestPoints) {
        bestPoints = points;
        bestChoices = { ...currentChoices };
      }
      return;
    }

    const group = groups[groupIndex];
    for (const option of group.options) {
      currentChoices[group.key] = option;
      walk(groupIndex + 1);
    }
  }

  walk(0);
  return bestChoices;
}

function normalizeFormulaOptionDisplay(option: string): string {
  return option.replace(/X/g, " x ");
}

function getBaseSkillValue(skill: string, characteristics: Characteristics): number {
  const normalized = normalizeSkillName(skill);

  if (normalized === "lengua propia" || normalized.startsWith("lengua propia (")) return characteristics.EDU;
  if (normalized === "esquivar") return Math.floor(characteristics.DES / 2);

  if (normalized === "armas de fuego (arma corta)") return 20;
  if (normalized === "armas de fuego (ametralladora)") return 10;
  if (normalized === "armas de fuego (armamento pesado)") return 10;
  if (normalized === "armas de fuego (arco)") return 15;
  if (normalized === "armas de fuego (fusil/escopeta)") return 25;
  if (normalized === "armas de fuego (lanzallamas)") return 10;
  if (normalized === "armas de fuego (subfusil)") return 15;
  if (normalized === "combatir (pelea)") return 25;

  if (normalized === "antropologia") return 1;
  if (normalized === "arqueologia") return 1;
  if (normalized === "artilleria") return 1;
  if (normalized === "buscar libros") return 20;
  if (normalized === "bucear") return 1;
  if (normalized === "cerrajeria") return 1;
  if (normalized === "charlataneria") return 5;
  if (normalized === "demolicion") return 1;
  if (normalized === "ciencias ocultas") return 5;
  if (normalized === "conducir automovil") return 20;
  if (normalized === "conducir maquinaria") return 1;
  if (normalized === "contabilidad") return 5;
  if (normalized === "credito") return 0;
  if (normalized === "derecho") return 5;
  if (normalized === "descubrir") return 25;
  if (normalized === "disfrazarse") return 5;
  if (normalized === "electricidad") return 10;
  if (normalized === "electronica") return 1;
  if (normalized === "encanto") return 15;
  if (normalized === "equitacion") return 5;
  if (normalized === "escuchar") return 20;
  if (normalized === "historia") return 5;
  if (normalized === "hipnosis") return 1;
  if (normalized === "informatica") return 5;
  if (normalized === "intimidar") return 15;
  if (normalized === "juego de manos") return 10;
  if (normalized === "lanzar") return 20;
  if (normalized === "lectura de labios") return 1;
  if (normalized === "mecanica") return 10;
  if (normalized === "medicina") return 1;
  if (normalized === "mitos de cthulhu") return 0;
  if (normalized === "nadar") return 20;
  if (normalized === "naturaleza") return 10;
  if (normalized === "orientarse") return 5;
  if (normalized === "persuasion") return 10;
  if (normalized === "primeros auxilios") return 30;
  if (normalized === "psicoanalisis") return 1;
  if (normalized === "psicologia") return 10;
  if (normalized === "saltar") return 20;
  if (normalized === "seguir rastros") return 10;
  if (normalized === "sigilo") return 20;
  if (normalized === "tasacion") return 5;
  if (normalized === "trato con animales") return 5;
  if (normalized === "trepar") return 20;

  if (normalized.startsWith("arte/artesania")) return 5;
  if (normalized.startsWith("arte (")) return 5;
  if (normalized.startsWith("ciencia")) return 1;
  if (normalized.startsWith("armas de fuego")) return 0;
  if (normalized.startsWith("combatir")) return 0;
  if (normalized.startsWith("conducir automovil")) return 20;
  if (normalized.startsWith("otras lenguas")) return 1;
  if (normalized.startsWith("pilotar")) return 1;
  if (normalized.startsWith("supervivencia")) return 10;

  return 0;
}

function buildSkillPointsMap(pointsBySkill: Record<string, number>): Record<string, number> {
  return Object.entries(pointsBySkill).reduce(
    (acc, [skill, points]) => {
      const key = normalizeSkillName(skill);
      acc[key] = (acc[key] ?? 0) + points;
      return acc;
    },
    {} as Record<string, number>,
  );
}

export function computeSkillBreakdown(
  characteristics: Characteristics,
  skills: CharacterDraft["skills"],
): Record<string, SkillComputedValue> {
  const occupationMap = buildSkillPointsMap(skills.occupation);
  const personalMap = buildSkillPointsMap(skills.personal);

  const catalogSkills = investigatorSkillsCatalog.skills;
  const assignedSkills = [...Object.keys(skills.occupation), ...Object.keys(skills.personal)];

  const canonicalByNormalized = new Map<string, string>();
  for (const skill of [...catalogSkills, ...assignedSkills]) {
    const normalized = normalizeSkillName(skill);
    if (!canonicalByNormalized.has(normalized)) {
      canonicalByNormalized.set(normalized, skill);
    }
  }

  const computed: Record<string, SkillComputedValue> = {};
  for (const [normalized, skill] of canonicalByNormalized.entries()) {
    const occupation = occupationMap[normalized] ?? 0;
    const personal = personalMap[normalized] ?? 0;
    const base = getBaseSkillValue(skill, characteristics);
    const total = base + occupation + personal;

    computed[skill] = {
      base,
      occupation,
      personal,
      total,
      hard: Math.floor(total / 2),
      extreme: Math.floor(total / 5),
    };
  }

  return computed;
}

export function validateSkillAllocation(
  occupationPoints: number,
  personalPoints: number,
  occupationAssigned: Record<string, number>,
  personalAssigned: Record<string, number>,
  occupationCredit: number = 0,
  characteristics?: Characteristics,
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

  const occupationMap = buildSkillPointsMap(occupationAssigned);
  const personalMap = buildSkillPointsMap(personalAssigned);
  const canonicalByNormalized = new Map<string, string>();
  const allAssignedSkills = [...Object.keys(occupationAssigned), ...Object.keys(personalAssigned)];

  for (const skill of allAssignedSkills) {
    const normalized = normalizeSkillName(skill);
    if (!canonicalByNormalized.has(normalized)) {
      canonicalByNormalized.set(normalized, skill);
    }
  }

  const normalizedSkills = new Set([...Object.keys(occupationMap), ...Object.keys(personalMap)]);
  for (const normalizedSkill of normalizedSkills) {
    if (normalizedSkill === "credito") continue;

    const sampleSkill = canonicalByNormalized.get(normalizedSkill) ?? normalizedSkill;
    const base = characteristics ? getBaseSkillValue(sampleSkill, characteristics) : 0;
    const total = base + (occupationMap[normalizedSkill] ?? 0) + (personalMap[normalizedSkill] ?? 0);

    if (total > SKILL_ABSOLUTE_MAX) {
      issues.push({
        code: "SKILL_ABSOLUTE_CAP_EXCEEDED",
        message: `${sampleSkill} supera el tope absoluto de ${SKILL_ABSOLUTE_MAX}%.`,
        field: `skills.${sampleSkill}`,
        severity: "error",
      });
      continue;
    }

    if (total > SKILL_CREATION_MAX) {
      issues.push({
        code: "SKILL_CREATION_CAP_EXCEEDED",
        message: `${sampleSkill} supera el tope recomendado de creacion (${SKILL_CREATION_MAX}%).`,
        field: `skills.${sampleSkill}`,
        severity: "error",
      });
    }
  }

  return issues;
}

function hasAllCharacteristics(draft: CharacterDraft): draft is CharacterDraft & { characteristics: Characteristics } {
  return characteristicKeys.every((key) => {
    const value = draft.characteristics[key];
    return typeof value === "number" && Number.isFinite(value);
  });
}

export function validateStep(stepId: number, draft: CharacterDraft): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (stepId >= 1) {
    if (draft.age < 15 || draft.age > 89) {
      issues.push({
        code: "AGE_RANGE",
        message: "Edad fuera de 15-89. Requiere confirmacion del guardian.",
        field: "age",
        severity: "warning",
      });
    }

    const allocation = draft.agePenaltyAllocation ?? getDefaultAgePenaltyAllocation(draft.age);
    const youthFue = clampPenaltyAllocation(allocation.youthFuePenalty);
    const youthTam = clampPenaltyAllocation(allocation.youthTamPenalty);
    const youthExpected = draft.age >= 15 && draft.age <= 19 ? 5 : 0;
    const youthTotal = youthFue + youthTam;

    if (draft.age >= 15 && draft.age <= 19 && youthTotal !== youthExpected) {
      issues.push({
        code: "AGE_YOUTH_PENALTY_MISMATCH",
        message: "El reparto de penalizador para FUE/TAM debe sumar exactamente 5.",
        field: "agePenaltyAllocation",
        severity: "error",
      });
    }

    const matureFue = clampPenaltyAllocation(allocation.matureFuePenalty);
    const matureCon = clampPenaltyAllocation(allocation.matureConPenalty);
    const matureDes = clampPenaltyAllocation(allocation.matureDesPenalty);
    const matureExpected = getMaturePenaltyTotal(draft.age);
    const matureTotal = matureFue + matureCon + matureDes;
    if (draft.age >= 40 && matureTotal !== matureExpected) {
      issues.push({
        code: "AGE_MATURE_PENALTY_MISMATCH",
        message: `El reparto de penalizador para FUE/CON/DES debe sumar exactamente ${matureExpected}.`,
        field: "agePenaltyAllocation",
        severity: "error",
      });
    }
  }

  if (stepId >= 2) {
    if (!hasAllCharacteristics(draft)) {
      issues.push({
        code: "MISSING_CHARACTERISTICS",
        message: "Completa todas las caracteristicas.",
        field: "characteristics",
        severity: "error",
      });
    }

    if (hasAllCharacteristics(draft) && typeof draft.lastRolledAge === "number" && draft.lastRolledAge !== draft.age) {
      issues.push({
        code: "AGE_ROLL_MISMATCH",
        message: "La edad cambio tras la tirada aleatoria. Repite la tirada para reaplicar modificadores de edad.",
        field: "age",
        severity: "warning",
      });
    }
  }

  if (stepId >= 6) {
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
      }
    }
  }

  if (stepId >= 5) {
    if (draft.occupation) {
      const occupation = professionCatalog.occupations.find((occ) => occ.name === draft.occupation?.name);
      if (occupation) {
        const choiceSelectionErrors = validateChoiceSelections(draft.occupation);
        for (const message of choiceSelectionErrors) {
          issues.push({
            code: "OCCUPATION_CHOICE_GROUP",
            message,
            field: "occupation.selectedChoices",
            severity: "error",
          });
        }

        const formulaChoiceGroups = extractOccupationFormulaChoiceGroups(occupation.occupation_points_formula);
        for (const group of formulaChoiceGroups) {
          const selected = (draft.occupation.formulaChoices?.[group.key] ?? "").toUpperCase().replace(/\s+/g, "");
          if (!group.options.includes(selected)) {
            issues.push({
              code: "OCCUPATION_FORMULA_CHOICE",
              message: `Debes elegir una opcion para la formula de puntos (${normalizeFormulaOptionDisplay(group.options.join(" o "))}).`,
              field: `occupation.formulaChoices.${group.key}`,
              severity: "error",
            });
          }
        }
      }
    }
  }

  if (stepId >= 6 && hasAllCharacteristics(draft) && draft.occupation) {
    const occupationDef = professionCatalog.occupations.find((occ) => occ.name === draft.occupation?.name);
    if (occupationDef) {
      const occupationPoints = evaluateOccupationPointsFormula(
        occupationDef.occupation_points_formula,
        draft.characteristics,
        draft.occupation.formulaChoices,
      );
      const personalPoints = draft.characteristics.INT * 2;
      issues.push(
        ...validateSkillAllocation(
          occupationPoints,
          personalPoints,
          draft.skills.occupation,
          draft.skills.personal,
          draft.occupation.creditRating,
          draft.characteristics,
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

  if (stepId >= 9) {
    const backgroundFields = [
      draft.background.descripcionPersonal,
      draft.background.ideologiaCreencias,
      draft.background.allegados,
      draft.background.lugaresSignificativos,
      draft.background.posesionesPreciadas,
      draft.background.rasgos,
    ];
    const completedBackgroundFields = backgroundFields.filter((value) => value && value.trim().length > 0).length;

    if (completedBackgroundFields < 3) {
      issues.push({
        code: "MISSING_BACKGROUND_MINIMUM",
        message:
          "Debes completar al menos 3 categorias de trasfondo (descripcion, ideologia/creencias, allegados, lugares, posesiones o rasgos).",
        field: "background",
        severity: "error",
      });
    }

    if (!draft.background.vinculoPrincipal || draft.background.vinculoPrincipal.trim().length === 0) {
      issues.push({
        code: "MISSING_CORE_CONNECTION",
        message: "Debes indicar el vinculo fundamental del investigador.",
        field: "background.vinculoPrincipal",
        severity: "error",
      });
    }
  }

  if (stepId >= 10) {
    if (!draft.equipment.spendingLevel || draft.equipment.spendingLevel.trim().length === 0) {
      issues.push({
        code: "MISSING_SPENDING_LEVEL",
        message: "Completa el nivel de gasto (Tabla II).",
        field: "equipment.spendingLevel",
        severity: "error",
      });
    }
    if (!draft.equipment.cash || draft.equipment.cash.trim().length === 0) {
      issues.push({
        code: "MISSING_CASH",
        message: "Completa el dinero en efectivo (Tabla II).",
        field: "equipment.cash",
        severity: "error",
      });
    }
    if (!draft.equipment.assets || draft.equipment.assets.trim().length === 0) {
      issues.push({
        code: "MISSING_ASSETS",
        message: "Completa las propiedades/bienes (Tabla II).",
        field: "equipment.assets",
        severity: "error",
      });
    }
    if (!draft.equipment.notes || draft.equipment.notes.trim().length === 0) {
      issues.push({
        code: "MISSING_EQUIPMENT_NOTES",
        message: "Anota armas/equipo/objetos importantes.",
        field: "equipment.notes",
        severity: "error",
      });
    }
  }

  return issues;
}

export function finalizeCharacter(draft: CharacterDraft): CharacterSheet {
  const issues = validateStep(10, draft).filter((issue) => issue.severity === "error");
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
    computedSkills: computeSkillBreakdown(finalizedCharacteristics, draft.skills),
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
