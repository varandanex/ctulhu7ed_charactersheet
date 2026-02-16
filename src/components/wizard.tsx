"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type TouchEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { investigatorSkillsCatalog, professionCatalog, rulesCatalog, stepsCatalog } from "@/rules-data/catalog";
import { getSkillHelp } from "@/rules-data/skill-help";
import {
  buildDefaultChoiceSelections,
  collectAllowedOccupationSkills,
  getChoiceGroupSkillOptions,
  isAllowedOccupationSkill,
} from "@/domain/occupation";
import {
  computeSkillBreakdown,
  computeDerivedStats,
  evaluateOccupationPointsFormula,
  extractOccupationFormulaChoiceGroups,
  finalizeCharacter,
  rollCharacteristicWithAgeModifiersDetailed,
  SKILL_CREATION_MAX,
  validateStep,
} from "@/domain/rules";
import { getFinanceByCredit } from "@/domain/finance";
import type { CharacteristicKey, ValidationIssue } from "@/domain/types";
import { useCharacterStore } from "@/state/character-store";
import { toCharacterJson } from "@/services/export";
import { clearClientData } from "@/lib/client-data";
import { ResetProgressModal } from "@/components/reset-progress-modal";

const characteristicKeys: CharacteristicKey[] = ["FUE", "CON", "TAM", "DES", "APA", "INT", "POD", "EDU", "SUERTE"];
const occupationImageOverrides: Record<string, string> = {
  "Investigador privado": "/ocupaciones/investigador-privado.jpg",
  Anticuario: "/ocupaciones/anticuario.jpg",
  "Agente de policia": "/ocupaciones/policia.jpg",
  "Inspector de policia": "/ocupaciones/inspector-policia.jpg",
};
const defaultAgePenaltyAllocation = {
  youthFuePenalty: 2,
  youthTamPenalty: 3,
  matureFuePenalty: 1,
  matureConPenalty: 1,
  matureDesPenalty: 3,
};
const AGE_MIN = 15;
const AGE_MAX = 89;
const AGE_MARKS = [20, 40, 60, 80];
const INITIAL_ROLL_ANIMATION_MS = 500;
const COSMIC_REROLL_WARNING_THRESHOLD = 2;
const CTHULHU_ANGER_THRESHOLD = 3;
const DICE_FACE_VALUES = {
  front: 1,
  back: 6,
  right: 3,
  left: 4,
  top: 5,
  bottom: 2,
} as const;
const DICE_PIP_LAYOUTS: Record<number, Array<"tl" | "tr" | "ml" | "mr" | "bl" | "br" | "c">> = {
  1: ["c"],
  2: ["tl", "br"],
  3: ["tl", "c", "br"],
  4: ["tl", "tr", "bl", "br"],
  5: ["tl", "tr", "c", "bl", "br"],
  6: ["tl", "tr", "ml", "mr", "bl", "br"],
};
const customSkillBaseOptions = [
  "Armas de fuego",
  "Arte/Artesania",
  "Ciencia",
  "Combatir",
  "Lengua propia",
  "Otras lenguas",
  "Pilotar",
];

function parseCreditRange(range: string): { min: number; max: number } {
  const [min, max] = range.split("-").map((n) => Number(n.trim()));
  return { min, max };
}

function normalizeSkillName(skill: string): string {
  return skill
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function extractSkillBase(normalizedSkill: string): string {
  return normalizedSkill.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

function isForbiddenInitialCreationSkill(skill: string): boolean {
  const normalizedSkill = normalizeSkillName(skill);
  return rulesCatalog.skill_point_rules.cannot_allocate_to.some((entry) => {
    const normalizedEntry = normalizeSkillName(entry).replace(/\(.*\)/g, "").trim();
    return normalizedEntry.length > 0 && normalizedSkill.includes(normalizedEntry);
  });
}

function toSlug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function getOccupationImagePath(name: string): string {
  const override = occupationImageOverrides[name];
  if (override) return override;
  return `/ocupaciones/${toSlug(name)}.jpg`;
}

function isCreditSkill(skill: string): boolean {
  return normalizeSkillName(skill) === "credito";
}

function getChoiceKey(index: number, label: string): string {
  return `${index}:${label}`;
}

function formatFormulaOption(option: string): string {
  return option.replace(/X/g, " x ");
}

function formatSkillBaseLabel(base: string): string {
  const normalized = base.toLowerCase();
  const percentageMatch = base.match(/\d+%/);
  if (percentageMatch) return percentageMatch[0];
  if (normalized.includes("especialidad")) return "Especialidad";
  const noParen = base.replace(/\s*\([^)]*\)\s*/g, "").trim();
  return noParen.length > 16 ? noParen.slice(0, 16).trim() : noParen;
}

function buildCustomSkillName(base: string, detail: string): string {
  const cleanBase = base.trim();
  const cleanDetail = detail.trim();
  if (!cleanDetail) return cleanBase;
  return `${cleanBase} (${cleanDetail})`;
}

function buildSkillOrderIndexMap(skills: string[]): Map<string, number> {
  const order = new Map<string, number>();
  skills.forEach((skill, index) => {
    const normalized = normalizeSkillName(skill);
    if (!order.has(normalized)) {
      order.set(normalized, index);
    }
  });
  return order;
}

function getSkillSortWeight(skill: string, orderMap: Map<string, number>): number {
  const normalized = normalizeSkillName(skill);
  const direct = orderMap.get(normalized);
  if (typeof direct === "number") return direct * 10;

  const base = extractSkillBase(normalized);
  const baseDirect = orderMap.get(base);
  if (typeof baseDirect === "number") return baseDirect * 10 + 5;

  return 100_000;
}

function getMaturePenaltyTarget(age: number): number {
  if (age >= 80) return 80;
  if (age >= 70) return 40;
  if (age >= 60) return 20;
  if (age >= 50) return 10;
  if (age >= 40) return 5;
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

function clampPenaltyAllocation(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function getCharacteristicAgeModifier(
  key: CharacteristicKey,
  age: number,
  allocation: typeof defaultAgePenaltyAllocation,
): number {
  let modifier = 0;
  const matureTarget = getMaturePenaltyTarget(age);
  const defaultMatureFuePenalty = Math.floor(matureTarget / 3);
  const defaultMatureConPenalty = Math.floor(matureTarget / 3);
  const defaultMatureDesPenalty = matureTarget - defaultMatureFuePenalty - defaultMatureConPenalty;

  if (age >= 15 && age <= 19) {
    const youthFue = clampPenaltyAllocation(allocation.youthFuePenalty);
    const youthTam = clampPenaltyAllocation(allocation.youthTamPenalty);
    const youthTotal = youthFue + youthTam;
    const fuePenalty = youthTotal === 5 ? youthFue : defaultAgePenaltyAllocation.youthFuePenalty;
    const tamPenalty = youthTotal === 5 ? youthTam : defaultAgePenaltyAllocation.youthTamPenalty;
    if (key === "FUE") modifier -= fuePenalty;
    if (key === "TAM") modifier -= tamPenalty;
    if (key === "EDU") modifier -= 5;
  }

  if (matureTarget > 0) {
    const matureFue = clampPenaltyAllocation(allocation.matureFuePenalty);
    const matureCon = clampPenaltyAllocation(allocation.matureConPenalty);
    const matureDes = clampPenaltyAllocation(allocation.matureDesPenalty);
    const matureTotal = matureFue + matureCon + matureDes;
    const fuePenalty = matureTotal === matureTarget ? matureFue : defaultMatureFuePenalty;
    const conPenalty = matureTotal === matureTarget ? matureCon : defaultMatureConPenalty;
    const desPenalty = matureTotal === matureTarget ? matureDes : defaultMatureDesPenalty;
    const apaPenalty = age >= 80 ? 25 : age >= 70 ? 20 : age >= 60 ? 15 : age >= 50 ? 10 : 5;

    if (key === "FUE") modifier -= fuePenalty;
    if (key === "CON") modifier -= conPenalty;
    if (key === "DES") modifier -= desPenalty;
    if (key === "APA") modifier -= apaPenalty;
  }

  return modifier;
}

function getAgeGuidance(age: number): string[] {
  if (age >= 15 && age <= 19) {
    return [
      "Resta 5 puntos entre FUE y TAM.",
      "EDU comienza con 5 puntos menos.",
      "SUERTE se tira dos veces y eliges el resultado mayor.",
      "No hay tiradas de mejora de EDU por edad.",
    ];
  }
  if (age >= 20 && age <= 39) {
    return ["Haz 1 tirada de mejora de EDU."];
  }
  if (age >= 40 && age <= 49) {
    return ["Resta 5 puntos entre FUE/CON/DES.", "Reduce APA en 5.", "Haz 2 tiradas de mejora de EDU."];
  }
  if (age >= 50 && age <= 59) {
    return ["Resta 10 puntos entre FUE/CON/DES.", "Reduce APA en 10.", "Haz 3 tiradas de mejora de EDU."];
  }
  if (age >= 60 && age <= 69) {
    return ["Resta 20 puntos entre FUE/CON/DES.", "Reduce APA en 15.", "Haz 4 tiradas de mejora de EDU."];
  }
  if (age >= 70 && age <= 79) {
    return ["Resta 40 puntos entre FUE/CON/DES.", "Reduce APA en 20.", "Haz 4 tiradas de mejora de EDU."];
  }
  return ["Resta 80 puntos entre FUE/CON/DES.", "Reduce APA en 25.", "Haz 4 tiradas de mejora de EDU."];
}

function getAgeGuidanceTone(line: string): "negative" | "positive" | "neutral" {
  const normalized = line.toLowerCase();
  if (normalized.includes("resta") || normalized.includes("reduce") || normalized.includes("menos")) return "negative";
  if (
    normalized.includes("mejor de dos") ||
    normalized.includes("haz") ||
    normalized.includes("eliges") ||
    normalized.includes("resultado mayor")
  )
    return "positive";
  return "neutral";
}

function getTargetState(current: number, expected: number): "ok" | "warn" | "over" {
  if (current === expected) return "ok";
  if (current < expected) return "warn";
  return "over";
}

function formatRollFormula(formula: string): string {
  return formula.replace(/x/gi, " x ");
}

function getFormulaModifierTokens(formula: string): { additive: string[]; multiplier: string | null } {
  const normalized = formula.replace(/\s+/g, "");
  const additive = normalized.match(/[+-]\d+/g) ?? [];
  const multiplier = normalized.match(/x(\d+)/i);
  return {
    additive,
    multiplier: multiplier ? `x${multiplier[1]}` : null,
  };
}

function getCharacteristicDiceCount(key: CharacteristicKey): number {
  const formula = rulesCatalog.characteristics_generation[key];
  const d6Match = formula.match(/(\d+)D6/i);
  const parsed = d6Match ? Number(d6Match[1]) : 3;
  if (!Number.isFinite(parsed)) return 3;
  return Math.max(1, Math.min(3, parsed));
}

function isDiceSumFormula(formula: string): boolean {
  const match = formula.match(/(\d+)D\d+/i);
  if (!match) return false;
  return Number(match[1]) > 1;
}

function extractRolledDiceFromStep(stepLine: string): number[] {
  const match = stepLine.match(/\[([^\]]+)\]/);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((value) => Number.isFinite(value) && value >= 1 && value <= 6)
    .slice(0, 3);
}

function dieSettleTransform(value: number): string {
  switch (value) {
    case 1:
      return "rotateX(12deg) rotateY(-16deg) rotateZ(0deg)";
    case 2:
      return "rotateX(102deg) rotateY(-10deg) rotateZ(0deg)";
    case 3:
      return "rotateX(8deg) rotateY(-106deg) rotateZ(0deg)";
    case 4:
      return "rotateX(8deg) rotateY(78deg) rotateZ(0deg)";
    case 5:
      return "rotateX(-82deg) rotateY(12deg) rotateZ(0deg)";
    case 6:
      return "rotateX(8deg) rotateY(164deg) rotateZ(0deg)";
    default:
      return "rotateX(12deg) rotateY(-16deg) rotateZ(0deg)";
  }
}

function renderDieFace(className: string, value: number) {
  const pipLayout = DICE_PIP_LAYOUTS[value] ?? DICE_PIP_LAYOUTS[1];
  return (
    <i className={className}>
      <span className="dice-face-pips">
        {pipLayout.map((pip, index) => (
          <span key={`${className}-${value}-pip-${index}`} className={`dice-pip ${pip}`} />
        ))}
      </span>
      <b className="dice-face-value">{value}</b>
    </i>
  );
}

function Issues({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <div>
      {issues.map((issue) => (
        <div className="alert" key={`${issue.code}-${issue.field}`}>
          {issue.message}
        </div>
      ))}
    </div>
  );
}

export function Wizard({ step }: { step: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showResetModal, setShowResetModal] = useState(false);
  const [showResetRollsModal, setShowResetRollsModal] = useState(false);
  const [showGuardianPermissionModal, setShowGuardianPermissionModal] = useState(false);
  const [pendingRerollCharacteristic, setPendingRerollCharacteristic] = useState<CharacteristicKey | null>(null);
  const [rerollingCharacteristic, setRerollingCharacteristic] = useState<CharacteristicKey | null>(null);
  const [summaryRerollCompleted, setSummaryRerollCompleted] = useState(false);
  const [summaryHighlightCharacteristics, setSummaryHighlightCharacteristics] = useState<CharacteristicKey[]>([]);
  const [mobilePointsOpen, setMobilePointsOpen] = useState(false);
  const [helpSkillOpen, setHelpSkillOpen] = useState<string | null>(null);
  const [customSkillBase, setCustomSkillBase] = useState<string>("Armas de fuego");
  const [customSkillDetail, setCustomSkillDetail] = useState<string>("");
  const [customSkillBucket, setCustomSkillBucket] = useState<"occupation" | "personal">("personal");
  const [customSkillMessage, setCustomSkillMessage] = useState<string>("");
  const [rollingCharacteristic, setRollingCharacteristic] = useState<CharacteristicKey | null>(null);
  const [recentlyRolledCharacteristic, setRecentlyRolledCharacteristic] = useState<CharacteristicKey | null>(null);
  const [rollingPreviewValue, setRollingPreviewValue] = useState<number | null>(null);
  const [diceValues, setDiceValues] = useState<number[]>([]);
  const [characteristicRollDetails, setCharacteristicRollDetails] = useState<Partial<Record<CharacteristicKey, string[]>>>({});
  const [occupationSlideIndex, setOccupationSlideIndex] = useState(0);
  const [occupationImageErrors, setOccupationImageErrors] = useState<Record<string, boolean>>({});
  const [occupationImageLoaded, setOccupationImageLoaded] = useState<Record<string, boolean>>({});
  const [occupationImageOrientation, setOccupationImageOrientation] = useState<Record<string, "portrait" | "landscape">>({});
  const launchTimeoutRef = useRef<number | null>(null);
  const rollPreviewIntervalRef = useRef<number | null>(null);
  const summaryHighlightTimeoutsRef = useRef<Partial<Record<CharacteristicKey, number>>>({});
  const occupationTouchStartX = useRef<number | null>(null);
  const occupationTouchStartY = useRef<number | null>(null);
  const occupationTouchCurrentX = useRef<number | null>(null);
  const occupationTouchCurrentY = useRef<number | null>(null);
  const {
    draft,
    setAge,
    setAgePenaltyAllocation,
    setLastRolledAge,
    incrementGuardianRerollRequests,
    resetGuardianRerollRequests,
    clearCharacteristics,
    setCharacteristic,
    setOccupation,
    setSkill,
    setBackgroundField,
    setIdentityField,
    setCompanion,
    removeCompanion,
    setEquipmentField,
    setEquipmentNotes,
    reset,
  } = useCharacterStore();

  const issues = useMemo(() => validateStep(step, draft), [step, draft]);

  const occupation = professionCatalog.occupations.find((occ) => occ.name === draft.occupation?.name);
  const occupationCreditRange = occupation ? parseCreditRange(occupation.credit_range) : null;
  const selectedEra = draft.era === "actual" ? "clasica" : (draft.era ?? "clasica");
  const allOccupations = useMemo(() => {
    if (selectedEra === "actual") return professionCatalog.occupations;
    return professionCatalog.occupations.filter((item) => !item.tags.includes("actual"));
  }, [selectedEra]);
  const activeOccupation = allOccupations[occupationSlideIndex] ?? null;
  const activeOccupationImage = activeOccupation ? getOccupationImagePath(activeOccupation.name) : null;
  const activeOccupationImageUnavailable = activeOccupation ? occupationImageErrors[activeOccupation.name] : false;
  const activeOccupationImageLoading =
    activeOccupation && activeOccupationImage ? !occupationImageLoaded[activeOccupation.name] && !activeOccupationImageUnavailable : false;
  const activeOccupationImageOrientation = activeOccupation ? occupationImageOrientation[activeOccupation.name] : undefined;
  const occupationSkills = useMemo(
    () => (draft.occupation ? collectAllowedOccupationSkills(draft.occupation) : []),
    [draft.occupation],
  );
  const normalizedCatalogSkills = useMemo(
    () => new Set(investigatorSkillsCatalog.skills.map((skill) => normalizeSkillName(skill))),
    [],
  );
  const personalSkills = useMemo(() => {
    const assignedSkills = [...Object.keys(draft.skills.occupation), ...Object.keys(draft.skills.personal)];
    const unique = new Set([...investigatorSkillsCatalog.skills, ...occupationSkills, ...assignedSkills]);
    return [...unique];
  }, [draft.skills.occupation, draft.skills.personal, occupationSkills]);
  const groupedSkills = useMemo(() => {
    const fallback = ["Mitos de Cthulhu", "Psicologia", "Descubrir", "Buscar libros"];
    const allSkills = personalSkills.length > 0 ? personalSkills : fallback;
    const occupationSet = new Set(occupationSkills);
    const orderMap = buildSkillOrderIndexMap(investigatorSkillsCatalog.skills);
    const byGroupOrder = (a: string, b: string) => {
      const weightA = getSkillSortWeight(a, orderMap);
      const weightB = getSkillSortWeight(b, orderMap);
      if (weightA !== weightB) return weightA - weightB;
      return a.localeCompare(b, "es");
    };

    const occupationFirst = allSkills.filter((skill) => occupationSet.has(skill) && !isCreditSkill(skill)).sort(byGroupOrder);
    const personalOnly = allSkills.filter((skill) => !occupationSet.has(skill) && !isCreditSkill(skill)).sort(byGroupOrder);
    return { occupationFirst, personalOnly };
  }, [occupationSkills, personalSkills]);

  const occupationPoints = useMemo(() => {
    if (!occupation || !draft.characteristics.INT) return 0;
    return evaluateOccupationPointsFormula(
      occupation.occupation_points_formula,
      draft.characteristics as any,
      draft.occupation?.formulaChoices,
    );
  }, [occupation, draft.characteristics, draft.occupation?.formulaChoices]);
  const occupationFormulaChoices = useMemo(
    () => (occupation ? extractOccupationFormulaChoiceGroups(occupation.occupation_points_formula) : []),
    [occupation],
  );
  const fixedOccupationSkills = useMemo(() => {
    const selectedSkills = draft.occupation?.selectedSkills ?? [];
    const selectedChoices = Object.values(draft.occupation?.selectedChoices ?? {}).flat();
    const selectedChoicesSet = new Set(selectedChoices);
    return selectedSkills.filter((skill) => !selectedChoicesSet.has(skill));
  }, [draft.occupation?.selectedSkills, draft.occupation?.selectedChoices]);
  const computedSkills = useMemo(() => {
    if (!draft.characteristics.INT) return {};
    return computeSkillBreakdown(draft.characteristics as any, draft.skills);
  }, [draft.characteristics, draft.skills]);

  const personalPoints = (draft.characteristics.INT ?? 0) * 2;
  const financeSnapshot = useMemo(
    () => getFinanceByCredit(draft.occupation?.creditRating ?? 0),
    [draft.occupation?.creditRating],
  );

  const occupationSkillAssigned = Object.entries(draft.skills.occupation).reduce((sum, [skill, points]) => {
    if (isCreditSkill(skill)) return sum;
    return sum + points;
  }, 0);
  const occupationCreditAssigned = draft.occupation?.creditRating ?? 0;
  const occupationAssigned = occupationSkillAssigned + occupationCreditAssigned;
  const personalAssigned = Object.entries(draft.skills.personal).reduce((sum, [skill, points]) => {
    if (isCreditSkill(skill)) return sum;
    return sum + points;
  }, 0);
  const occupationRemaining = occupationPoints - occupationAssigned;
  const personalRemaining = personalPoints - personalAssigned;
  const finalSkillTotals = useMemo(() => {
    const candidateSkills = new Set([
      ...Object.keys(computedSkills),
      ...Object.keys(draft.skills.occupation),
      ...Object.keys(draft.skills.personal),
    ]);

    return [...candidateSkills]
      .filter((skill) => !isCreditSkill(skill))
      .map((skill) => {
        const base = computedSkills[skill]?.base ?? 0;
        const occupation = draft.skills.occupation[skill] ?? 0;
        const personal = draft.skills.personal[skill] ?? 0;
        const total = base + occupation + personal;
        return { skill, base, occupation, personal, total };
      })
      .filter((entry) => entry.occupation + entry.personal > 0)
      .sort((a, b) => b.total - a.total || a.skill.localeCompare(b.skill, "es"));
  }, [computedSkills, draft.skills.occupation, draft.skills.personal]);
  const occupationRemainingBudget = Math.max(occupationRemaining, 0);
  const personalRemainingBudget = Math.max(personalRemaining, 0);
  const agePenaltyAllocation = draft.agePenaltyAllocation ?? defaultAgePenaltyAllocation;
  const completedCharacteristicCount = characteristicKeys.filter((key) => typeof draft.characteristics[key] === "number").length;
  const nextCharacteristicToRoll = characteristicKeys.find((key) => typeof draft.characteristics[key] !== "number");
  const currentCharacteristicInRoll = rollingCharacteristic ?? recentlyRolledCharacteristic ?? nextCharacteristicToRoll ?? null;
  const isFirstRollPending =
    completedCharacteristicCount === 0 &&
    nextCharacteristicToRoll === characteristicKeys[0] &&
    !rollingCharacteristic;
  const allCharacteristicsRolled = completedCharacteristicCount === characteristicKeys.length;
  const highlightedCharacteristic = rollingCharacteristic ?? recentlyRolledCharacteristic ?? nextCharacteristicToRoll ?? null;
  const youthTarget = draft.age >= 15 && draft.age <= 19 ? 5 : 0;
  const ageGuidance = useMemo(() => getAgeGuidance(draft.age), [draft.age]);
  const youthCurrent = agePenaltyAllocation.youthFuePenalty + agePenaltyAllocation.youthTamPenalty;
  const matureTarget = getMaturePenaltyTarget(draft.age);
  const matureCurrent =
    agePenaltyAllocation.matureFuePenalty +
    agePenaltyAllocation.matureConPenalty +
    agePenaltyAllocation.matureDesPenalty;
  const youthState = getTargetState(youthCurrent, youthTarget);
  const matureState = getTargetState(matureCurrent, matureTarget);
  const eduImprovementRolls = getEduImprovementRolls(draft.age);
  const rerollFromSummary = searchParams.get("reroll");
  const rerollReturnStep = Number(searchParams.get("return") ?? "3");
  const highlightFromSummary = searchParams.get("highlight");
  const rerollCharacteristicFromSummary = characteristicKeys.includes(rerollFromSummary as CharacteristicKey)
    ? (rerollFromSummary as CharacteristicKey)
    : null;
  const highlightCharacteristicFromSummary = characteristicKeys.includes(highlightFromSummary as CharacteristicKey)
    ? (highlightFromSummary as CharacteristicKey)
    : null;
  const shouldAutoRerollFromSummary = step === 2 && rerollCharacteristicFromSummary !== null;
  const isSummaryRerollFlow = shouldAutoRerollFromSummary;
  const isSummaryRerollInProgress = shouldAutoRerollFromSummary && !summaryRerollCompleted;
  const summaryRerollReturnStep =
    Number.isFinite(rerollReturnStep) && rerollReturnStep >= 1 && rerollReturnStep <= 10 ? rerollReturnStep : 3;

  const canContinue = issues.every((issue) => issue.severity !== "error");
  const activeDiceCount = rollingCharacteristic
    ? getCharacteristicDiceCount(rollingCharacteristic)
    : highlightedCharacteristic
      ? getCharacteristicDiceCount(highlightedCharacteristic)
      : Math.max(1, Math.min(3, diceValues.length || 3));
  const highlightedFormulaModifiers = highlightedCharacteristic
    ? getFormulaModifierTokens(rulesCatalog.characteristics_generation[highlightedCharacteristic])
    : { additive: [], multiplier: null };
  const highlightedAgeModifier = highlightedCharacteristic
    ? getCharacteristicAgeModifier(highlightedCharacteristic, draft.age, agePenaltyAllocation)
    : 0;
  const showDiceSumPlus =
    highlightedCharacteristic && isDiceSumFormula(rulesCatalog.characteristics_generation[highlightedCharacteristic]);
  const shouldWrapAdditiveGroup =
    showDiceSumPlus &&
    (highlightedFormulaModifiers.additive.length > 0 || Boolean(highlightedFormulaModifiers.multiplier));
  const highlightedRollValue =
    highlightedCharacteristic && typeof draft.characteristics[highlightedCharacteristic] === "number"
      ? draft.characteristics[highlightedCharacteristic]
      : null;

  function getBoundedAge(rawAge: number): number {
    if (!Number.isFinite(rawAge)) return AGE_MIN;
    return Math.min(AGE_MAX, Math.max(AGE_MIN, Math.trunc(rawAge)));
  }

  function getSkillMax(bucket: "occupation" | "personal", skill: string) {
    if (isCreditSkill(skill)) {
      return occupationCreditRange?.max ?? 99;
    }
    const base = getSkillBase(skill);
    const otherBucketAssigned = bucket === "occupation" ? (draft.skills.personal[skill] ?? 0) : (draft.skills.occupation[skill] ?? 0);
    const maxByCreationCap = Math.max(SKILL_CREATION_MAX - base - otherBucketAssigned, 0);
    if (bucket === "occupation") {
      const current = draft.skills.occupation[skill] ?? 0;
      const maxByBudget = Math.max(occupationRemainingBudget + current, 0);
      return Math.min(maxByBudget, maxByCreationCap);
    }
    const current = draft.skills.personal[skill] ?? 0;
    const maxByBudget = Math.max(personalRemainingBudget + current, 0);
    return Math.min(maxByBudget, maxByCreationCap);
  }

  function pointsStateClass(remaining: number) {
    if (remaining < 0) return "over";
    if (remaining === 0) return "ok";
    return "warn";
  }

  function handlePrepareNextCharacteristic() {
    if (!nextCharacteristicToRoll || rollingCharacteristic) return;
    const characteristicToPrepare = nextCharacteristicToRoll;
    const diceCount = getCharacteristicDiceCount(characteristicToPrepare);
    if (typeof draft.lastRolledAge !== "number" || completedCharacteristicCount === 0) {
      setLastRolledAge(draft.age);
    }

    setRollingCharacteristic(characteristicToPrepare);
    setRollingPreviewValue(Math.floor(Math.random() * 99) + 1);
    setDiceValues(Array.from({ length: diceCount }, () => Math.floor(Math.random() * 6) + 1));
    if (rollPreviewIntervalRef.current !== null) {
      window.clearInterval(rollPreviewIntervalRef.current);
    }
    rollPreviewIntervalRef.current = window.setInterval(() => {
      setRollingPreviewValue(Math.floor(Math.random() * 99) + 1);
      setDiceValues(Array.from({ length: diceCount }, () => Math.floor(Math.random() * 6) + 1));
    }, 72);
    setRecentlyRolledCharacteristic(null);
  }

  function handleLaunchPreparedCharacteristic() {
    if (!rollingCharacteristic) return;
    const characteristicToRoll = rollingCharacteristic;
    const diceCount = getCharacteristicDiceCount(characteristicToRoll);
    const detail = rollCharacteristicWithAgeModifiersDetailed(characteristicToRoll, draft.age, agePenaltyAllocation);
    setCharacteristic(characteristicToRoll, detail.finalValue);
    const rolledDice = extractRolledDiceFromStep(detail.steps[0] ?? "");
    setDiceValues(rolledDice.length > 0 ? rolledDice : Array.from({ length: diceCount }, () => Math.floor(Math.random() * 6) + 1));
    setCharacteristicRollDetails((current) => ({
      ...current,
      [characteristicToRoll]: detail.steps,
    }));
    if (rollPreviewIntervalRef.current !== null) {
      window.clearInterval(rollPreviewIntervalRef.current);
      rollPreviewIntervalRef.current = null;
    }
    setRecentlyRolledCharacteristic(characteristicToRoll);
    setRollingPreviewValue(null);
    setRollingCharacteristic(null);
  }

  function handleLaunchNextCharacteristic() {
    if (!nextCharacteristicToRoll) return;
    const characteristicToRoll = nextCharacteristicToRoll;
    const diceCount = getCharacteristicDiceCount(characteristicToRoll);
    if (typeof draft.lastRolledAge !== "number" || completedCharacteristicCount === 0) {
      setLastRolledAge(draft.age);
    }

    setRecentlyRolledCharacteristic(null);
    setRollingCharacteristic(characteristicToRoll);
    setRollingPreviewValue(Math.floor(Math.random() * 99) + 1);
    setDiceValues(Array.from({ length: diceCount }, () => Math.floor(Math.random() * 6) + 1));
    if (rollPreviewIntervalRef.current !== null) {
      window.clearInterval(rollPreviewIntervalRef.current);
    }
    rollPreviewIntervalRef.current = window.setInterval(() => {
      setRollingPreviewValue(Math.floor(Math.random() * 99) + 1);
      setDiceValues(Array.from({ length: diceCount }, () => Math.floor(Math.random() * 6) + 1));
    }, 72);
    if (launchTimeoutRef.current !== null) {
      window.clearTimeout(launchTimeoutRef.current);
    }
    launchTimeoutRef.current = window.setTimeout(() => {
      const detail = rollCharacteristicWithAgeModifiersDetailed(characteristicToRoll, draft.age, agePenaltyAllocation);
      setCharacteristic(characteristicToRoll, detail.finalValue);
      const rolledDice = extractRolledDiceFromStep(detail.steps[0] ?? "");
      setDiceValues(rolledDice.length > 0 ? rolledDice : Array.from({ length: diceCount }, () => Math.floor(Math.random() * 6) + 1));
      setCharacteristicRollDetails((current) => ({
        ...current,
        [characteristicToRoll]: detail.steps,
      }));
      if (rollPreviewIntervalRef.current !== null) {
        window.clearInterval(rollPreviewIntervalRef.current);
        rollPreviewIntervalRef.current = null;
      }
      launchTimeoutRef.current = null;
      setRecentlyRolledCharacteristic(characteristicToRoll);
      setRollingPreviewValue(null);
      setRollingCharacteristic(null);
    }, INITIAL_ROLL_ANIMATION_MS);
  }

  function handleResetCharacteristicRolls() {
    setShowResetRollsModal(true);
  }

  function handleAskGuardianPermissionForReroll(key: CharacteristicKey) {
    setPendingRerollCharacteristic(key);
    setShowGuardianPermissionModal(true);
  }

  function handleConfirmGuardianReroll() {
    if (!pendingRerollCharacteristic || rerollingCharacteristic) return;
    const key = pendingRerollCharacteristic;
    router.push(`/crear/2?reroll=${key}&return=3`);
    setRerollingCharacteristic(key);
    incrementGuardianRerollRequests();
    setShowGuardianPermissionModal(false);
    setPendingRerollCharacteristic(null);
  }

  function handleReturnAfterSummaryReroll() {
    if (!rerollCharacteristicFromSummary || !summaryRerollCompleted) return;
    router.push(
      summaryRerollReturnStep === 3
        ? `/crear/${summaryRerollReturnStep}?highlight=${rerollCharacteristicFromSummary}`
        : `/crear/${summaryRerollReturnStep}`,
    );
  }

  function handleConfirmResetCharacteristicRolls() {
    if (launchTimeoutRef.current !== null) {
      window.clearTimeout(launchTimeoutRef.current);
      launchTimeoutRef.current = null;
    }
    if (rollPreviewIntervalRef.current !== null) {
      window.clearInterval(rollPreviewIntervalRef.current);
      rollPreviewIntervalRef.current = null;
    }
    setRecentlyRolledCharacteristic(null);
    setRollingPreviewValue(null);
    setDiceValues([]);
    setRollingCharacteristic(null);
    setCharacteristicRollDetails({});
    resetGuardianRerollRequests();
    clearCharacteristics();
    setShowResetRollsModal(false);
  }

  function getCharacteristicRollSource(key: CharacteristicKey): string {
    const base = formatRollFormula(rulesCatalog.characteristics_generation[key]);
    const details: string[] = [base];

    if (draft.age >= 15 && draft.age <= 19) {
      if (key === "FUE") details.push(`- ${agePenaltyAllocation.youthFuePenalty} (edad 15-19)`);
      if (key === "TAM") details.push(`- ${agePenaltyAllocation.youthTamPenalty} (edad 15-19)`);
      if (key === "EDU") details.push("- 5 (edad 15-19)");
      if (key === "SUERTE") details.push("mejor de 2 tiradas");
    }

    if (draft.age >= 40) {
      if (key === "FUE") details.push(`- ${agePenaltyAllocation.matureFuePenalty} (edad)`);
      if (key === "CON") details.push(`- ${agePenaltyAllocation.matureConPenalty} (edad)`);
      if (key === "DES") details.push(`- ${agePenaltyAllocation.matureDesPenalty} (edad)`);
      if (key === "APA")
        details.push(`- ${draft.age >= 80 ? 25 : draft.age >= 70 ? 20 : draft.age >= 60 ? 15 : draft.age >= 50 ? 10 : 5} (edad)`);
    }

    if (key === "EDU" && eduImprovementRolls > 0) {
      details.push(`+ mejoras EDU (${eduImprovementRolls} tiradas 1D100 / +1D10 si mejora)`);
    }

    return details.join(" | ");
  }

  function handleSkillChange(bucket: "occupation" | "personal", skill: string, rawPoints: number) {
    const normalized = Number.isFinite(rawPoints) ? Math.max(0, Math.trunc(rawPoints)) : 0;
    if (isCreditSkill(skill)) {
      if (bucket === "occupation" && draft.occupation) {
        const min = occupationCreditRange?.min ?? 0;
        const max = occupationCreditRange?.max ?? 99;
        const bounded = Math.min(Math.max(normalized, min), max);
        setOccupation({
          ...draft.occupation,
          creditRating: bounded,
        });
      }
      return;
    }
    const max = getSkillMax(bucket, skill);
    setSkill(bucket, skill, Math.min(normalized, max));
  }

  function getSkillBase(skill: string) {
    return computedSkills[skill]?.base ?? 0;
  }

  function handleAddCustomSkill() {
    const candidate = buildCustomSkillName(customSkillBase, customSkillDetail);
    const normalizedCandidate = normalizeSkillName(candidate);
    if (!normalizedCandidate) {
      setCustomSkillMessage("Escribe una especialidad valida.");
      return;
    }

    const exists = [...personalSkills].some((skill) => normalizeSkillName(skill) === normalizedCandidate);
    if (exists) {
      setCustomSkillMessage(`${candidate} ya existe en la lista.`);
      return;
    }

    if (!normalizedCatalogSkills.has(normalizedCandidate)) {
      setCustomSkillMessage(`${candidate} no aparece en el libro basico cargado.`);
      return;
    }

    if (customSkillBucket === "occupation" && !isAllowedOccupationSkill(draft.occupation, candidate)) {
      setCustomSkillMessage(`${candidate} no esta habilitada para tu ocupacion actual.`);
      return;
    }

    if (isForbiddenInitialCreationSkill(candidate)) {
      const bucketLabel = customSkillBucket === "occupation" ? "ocupacion" : "interes";
      setCustomSkillMessage(`${candidate} no puede recibir puntos de ${bucketLabel} al crear personaje.`);
      return;
    }

    setSkill(customSkillBucket, candidate, 0);
    setCustomSkillDetail("");
    setCustomSkillMessage(`Habilidad agregada: ${candidate}`);
  }

  function setChoiceGroupSkills(groupIndex: number, groupLabel: string, selectedValues: string[], count: number) {
    if (!draft.occupation) return;
    const bounded = selectedValues.filter((skill) => !isForbiddenInitialCreationSkill(skill)).slice(0, count);
    const key = getChoiceKey(groupIndex, groupLabel);
    const currentChoices = draft.occupation.selectedChoices ?? {};
    const selectedChoices = {
      ...currentChoices,
      [key]: bounded,
    };
    const selectedSkills = collectAllowedOccupationSkills({
      ...draft.occupation,
      selectedChoices,
    });
    setOccupation({
      ...draft.occupation,
      selectedChoices,
      selectedSkills,
    });
  }

  function setOccupationFormulaChoice(choiceKey: string, selectedOption: string) {
    if (!draft.occupation) return;
    setOccupation({
      ...draft.occupation,
      formulaChoices: {
        ...(draft.occupation.formulaChoices ?? {}),
        [choiceKey]: selectedOption,
      },
    });
  }

  function goNext() {
    if (!canContinue) return;
    if (step >= 10) {
      router.push("/crear/resumen");
      return;
    }
    router.push(`/crear/${step + 1}`);
  }

  function goBack() {
    if (step <= 1) {
      router.push("/");
      return;
    }
    router.push(`/crear/${step - 1}`);
  }

  const title = stepsCatalog.steps.find((item) => item.id === step)?.title ?? `Paso ${step}`;
  const activeSkillHelp = useMemo(() => (helpSkillOpen ? getSkillHelp(helpSkillOpen) : null), [helpSkillOpen]);

  useEffect(() => {
    return () => {
      if (launchTimeoutRef.current !== null) {
        window.clearTimeout(launchTimeoutRef.current);
      }
      if (rollPreviewIntervalRef.current !== null) {
        window.clearInterval(rollPreviewIntervalRef.current);
      }
      Object.values(summaryHighlightTimeoutsRef.current).forEach((timeoutId) => {
        if (typeof timeoutId === "number") {
          window.clearTimeout(timeoutId);
        }
      });
    };
  }, []);

  useEffect(() => {
    if (!shouldAutoRerollFromSummary) return;
    setSummaryRerollCompleted(false);
  }, [rerollCharacteristicFromSummary, shouldAutoRerollFromSummary]);

  useEffect(() => {
    if (
      !shouldAutoRerollFromSummary ||
      !rerollCharacteristicFromSummary ||
      summaryRerollCompleted ||
      rollingCharacteristic ||
      rerollingCharacteristic
    )
      return;
    const characteristicToRoll = rerollCharacteristicFromSummary;
    const diceCount = getCharacteristicDiceCount(characteristicToRoll);

    setRerollingCharacteristic(characteristicToRoll);
    setRecentlyRolledCharacteristic(null);
    setRollingCharacteristic(characteristicToRoll);
    setRollingPreviewValue(Math.floor(Math.random() * 99) + 1);
    setDiceValues(Array.from({ length: diceCount }, () => Math.floor(Math.random() * 6) + 1));

    if (rollPreviewIntervalRef.current !== null) {
      window.clearInterval(rollPreviewIntervalRef.current);
    }
    rollPreviewIntervalRef.current = window.setInterval(() => {
      setRollingPreviewValue(Math.floor(Math.random() * 99) + 1);
      setDiceValues(Array.from({ length: diceCount }, () => Math.floor(Math.random() * 6) + 1));
    }, 72);

    if (launchTimeoutRef.current !== null) {
      window.clearTimeout(launchTimeoutRef.current);
    }
    launchTimeoutRef.current = window.setTimeout(() => {
      const detail = rollCharacteristicWithAgeModifiersDetailed(characteristicToRoll, draft.age, agePenaltyAllocation);
      setCharacteristic(characteristicToRoll, detail.finalValue);
      const rolledDice = extractRolledDiceFromStep(detail.steps[0] ?? "");
      setDiceValues(rolledDice.length > 0 ? rolledDice : Array.from({ length: diceCount }, () => Math.floor(Math.random() * 6) + 1));
      setCharacteristicRollDetails((current) => ({
        ...current,
        [characteristicToRoll]: detail.steps,
      }));
      if (rollPreviewIntervalRef.current !== null) {
        window.clearInterval(rollPreviewIntervalRef.current);
        rollPreviewIntervalRef.current = null;
      }
      launchTimeoutRef.current = null;
      setRecentlyRolledCharacteristic(characteristicToRoll);
      setRollingPreviewValue(null);
      setRollingCharacteristic(null);
      setRerollingCharacteristic(null);
      setSummaryRerollCompleted(true);
    }, INITIAL_ROLL_ANIMATION_MS);
  }, [
    agePenaltyAllocation,
    draft.age,
    rerollCharacteristicFromSummary,
    summaryRerollCompleted,
    rerollingCharacteristic,
    rollingCharacteristic,
    setCharacteristic,
    shouldAutoRerollFromSummary,
  ]);

  useEffect(() => {
    if (step !== 3 || !highlightCharacteristicFromSummary) return;
    const characteristic = highlightCharacteristicFromSummary;
    setSummaryHighlightCharacteristics((current) => (current.includes(characteristic) ? current : [...current, characteristic]));
    const currentTimeout = summaryHighlightTimeoutsRef.current[characteristic];
    if (typeof currentTimeout === "number") {
      window.clearTimeout(currentTimeout);
    }
    summaryHighlightTimeoutsRef.current[characteristic] = window.setTimeout(() => {
      setSummaryHighlightCharacteristics((current) => current.filter((item) => item !== characteristic));
      delete summaryHighlightTimeoutsRef.current[characteristic];
    }, 3000);
    router.replace("/crear/3");
  }, [highlightCharacteristicFromSummary, router, step]);

  useEffect(() => {
    if (!helpSkillOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setHelpSkillOpen(null);
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [helpSkillOpen]);

  useEffect(() => {
    if (step !== 4) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const element = document.activeElement as HTMLElement | null;
      const isTypingField =
        element?.tagName === "INPUT" ||
        element?.tagName === "TEXTAREA" ||
        element?.tagName === "SELECT" ||
        element?.isContentEditable;

      if (isTypingField) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToPreviousOccupation();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goToNextOccupation();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [step, goToNextOccupation, goToPreviousOccupation]);

  useEffect(() => {
    if (step !== 4 || !draft.occupation?.name) return;
    const selectedIndex = allOccupations.findIndex((item) => item.name === draft.occupation?.name);
    if (selectedIndex >= 0) {
      setOccupationSlideIndex(selectedIndex);
    }
  }, [allOccupations, draft.occupation?.name, step]);

  useEffect(() => {
    if (step !== 4 || !draft.occupation) return;
    const selectedOccupation = professionCatalog.occupations.find((occ) => occ.name === draft.occupation?.name);
    if (!selectedOccupation) return;
    const requiredFormulaChoiceCount = extractOccupationFormulaChoiceGroups(selectedOccupation.occupation_points_formula).length;
    const hasChoiceGroups = Object.keys(draft.occupation.selectedChoices ?? {}).length > 0;
    const hasFormulaChoices = Object.keys(draft.occupation.formulaChoices ?? {}).length >= requiredFormulaChoiceCount;
    if (hasChoiceGroups && hasFormulaChoices) return;
    const selectedChoices = buildDefaultChoiceSelections(draft.occupation.name);
    const formulaChoices = extractOccupationFormulaChoiceGroups(selectedOccupation.occupation_points_formula).reduce(
      (acc, group) => {
        acc[group.key] = group.options[0];
        return acc;
      },
      {} as Record<string, string>,
    );
    const selectedSkills = collectAllowedOccupationSkills({
      ...draft.occupation,
      selectedChoices,
    });
    setOccupation({
      ...draft.occupation,
      selectedChoices,
      selectedSkills,
      formulaChoices,
    });
  }, [draft.occupation, setOccupation, step]);

  useEffect(() => {
    if (occupationSlideIndex < allOccupations.length) return;
    setOccupationSlideIndex(0);
  }, [allOccupations.length, occupationSlideIndex]);

  function applyOccupationBySlide(index: number) {
    const selected = allOccupations[index];
    if (!selected) return;
    const isCurrentSelection = draft.occupation?.name === selected.name;
    const preservedCredit = isCurrentSelection ? draft.occupation?.creditRating : undefined;
    const preservedChoices = isCurrentSelection ? draft.occupation?.selectedChoices : undefined;
    const preservedFormulaChoices = isCurrentSelection ? draft.occupation?.formulaChoices : undefined;
    const selectedChoices = buildDefaultChoiceSelections(selected.name);
    const formulaChoices = extractOccupationFormulaChoiceGroups(selected.occupation_points_formula).reduce(
      (acc, group) => {
        acc[group.key] = group.options[0];
        return acc;
      },
      {} as Record<string, string>,
    );
    const finalChoices = preservedChoices && Object.keys(preservedChoices).length > 0 ? preservedChoices : selectedChoices;
    const finalFormulaChoices =
      preservedFormulaChoices && Object.keys(preservedFormulaChoices).length > 0 ? preservedFormulaChoices : formulaChoices;
    const creditRating = preservedCredit ?? Number(selected.credit_range.split("-")[0]);
    const selectedSkills = collectAllowedOccupationSkills({
      name: selected.name,
      creditRating,
      selectedSkills: [],
      selectedChoices: finalChoices,
    });
    setOccupation({
      name: selected.name,
      creditRating,
      selectedChoices: finalChoices,
      selectedSkills,
      formulaChoices: finalFormulaChoices,
    });
    router.push("/crear/5");
  }

  function goToPreviousOccupation() {
    if (allOccupations.length === 0) return;
    setOccupationSlideIndex((current) => (current - 1 + allOccupations.length) % allOccupations.length);
  }

  function goToNextOccupation() {
    if (allOccupations.length === 0) return;
    setOccupationSlideIndex((current) => (current + 1) % allOccupations.length);
  }

  function handleOccupationTouchStart(event: TouchEvent<HTMLDivElement>) {
    const touch = event.touches[0];
    occupationTouchStartX.current = touch.clientX;
    occupationTouchStartY.current = touch.clientY;
    occupationTouchCurrentX.current = touch.clientX;
    occupationTouchCurrentY.current = touch.clientY;
  }

  function handleOccupationTouchMove(event: TouchEvent<HTMLDivElement>) {
    const touch = event.touches[0];
    occupationTouchCurrentX.current = touch.clientX;
    occupationTouchCurrentY.current = touch.clientY;
  }

  function handleOccupationTouchEnd() {
    const startX = occupationTouchStartX.current;
    const startY = occupationTouchStartY.current;
    const endX = occupationTouchCurrentX.current;
    const endY = occupationTouchCurrentY.current;

    occupationTouchStartX.current = null;
    occupationTouchStartY.current = null;
    occupationTouchCurrentX.current = null;
    occupationTouchCurrentY.current = null;

    if (startX === null || startY === null || endX === null || endY === null) return;
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const horizontalSwipe = Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY);
    if (!horizontalSwipe) return;

    if (deltaX > 0) {
      goToPreviousOccupation();
      return;
    }
    goToNextOccupation();
  }

  function handleConfirmReset() {
    reset();
    clearClientData();
    setShowResetModal(false);
    router.push("/");
  }

  const currentRerollAttempt = (draft.guardianRerollRequests ?? 0) + (showGuardianPermissionModal ? 1 : 0);
  const guardianCosmicWarning =
    currentRerollAttempt >= CTHULHU_ANGER_THRESHOLD
      ? "Una relanzada más, y Cthulhu no te hará tirar Cordura; te arrancará la mente antes de que toques los dados"
      : currentRerollAttempt >= COSMIC_REROLL_WARNING_THRESHOLD
        ? "El Ojo Cosmico de Loverfatcraft ya sospecha trampa. Vale una vez... pero ya vas por la segunda relanzada."
        : undefined;

  return (
    <main>
      <section className="app-shell">
        <h1 className="title">Creador de Investigadores</h1>
        <p className="subtitle">{title}</p>

        <Issues issues={issues} />

        {step === 1 && (
          <div className="grid two">
            <div className="card age-card" style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="age-slider">Edad ({AGE_MIN}-{AGE_MAX})</label>
              <p className="age-current-value">{draft.age} anos</p>
              <input
                id="age-slider"
                type="range"
                min={AGE_MIN}
                max={AGE_MAX}
                value={draft.age}
                onChange={(e) => setAge(getBoundedAge(Number(e.target.value)))}
                aria-label="Seleccionar edad"
              />
              <div className="age-markers" aria-hidden="true">
                {AGE_MARKS.map((mark) => (
                  <span key={mark}>{mark}</span>
                ))}
              </div>
            </div>
            <div className="card" style={{ gridColumn: "1 / -1" }}>
              <p className="kpi">Que implica esta edad</p>
              <div className="age-guidance-badges">
                {ageGuidance.map((line) => (
                  <span key={line} className={`age-guidance-badge age-guidance-badge--${getAgeGuidanceTone(line)}`}>
                    {line}
                  </span>
                ))}
                {(() => {
                  const movPenalty = draft.age >= 40 ? Math.min(5, Math.floor(draft.age / 10) - 3) : 0;
                  return (
                    <span className={`age-guidance-badge ${movPenalty > 0 ? "age-guidance-badge--negative" : "age-guidance-badge--neutral"}`}>
                      Penalizador MOV por edad: {movPenalty > 0 ? `-${movPenalty}` : "0"}
                    </span>
                  );
                })()}
              </div>
            </div>
            {draft.age >= 15 && draft.age <= 19 && (
              <div className="card" style={{ gridColumn: "1 / -1" }}>
                <p className="kpi">Penalizador 15-19 (repartir 5 entre FUE y TAM)</p>
                <div className="grid two">
                  <div>
                    <label>FUE</label>
                    <div className="number-stepper">
                      <button
                        type="button"
                        className="stepper-btn"
                        aria-label="Restar 1 punto a penalizador FUE joven"
                        onClick={() =>
                          setAgePenaltyAllocation({
                            youthFuePenalty: agePenaltyAllocation.youthFuePenalty - 1,
                          })
                        }
                        disabled={agePenaltyAllocation.youthFuePenalty <= 0}
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min={0}
                        max={5}
                        value={agePenaltyAllocation.youthFuePenalty}
                        onChange={(e) => setAgePenaltyAllocation({ youthFuePenalty: Number(e.target.value) })}
                      />
                      <button
                        type="button"
                        className="stepper-btn"
                        aria-label="Sumar 1 punto a penalizador FUE joven"
                        onClick={() =>
                          setAgePenaltyAllocation({
                            youthFuePenalty: agePenaltyAllocation.youthFuePenalty + 1,
                          })
                        }
                        disabled={agePenaltyAllocation.youthFuePenalty >= 5}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div>
                    <label>TAM</label>
                    <div className="number-stepper">
                      <button
                        type="button"
                        className="stepper-btn"
                        aria-label="Restar 1 punto a penalizador TAM joven"
                        onClick={() =>
                          setAgePenaltyAllocation({
                            youthTamPenalty: agePenaltyAllocation.youthTamPenalty - 1,
                          })
                        }
                        disabled={agePenaltyAllocation.youthTamPenalty <= 0}
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min={0}
                        max={5}
                        value={agePenaltyAllocation.youthTamPenalty}
                        onChange={(e) => setAgePenaltyAllocation({ youthTamPenalty: Number(e.target.value) })}
                      />
                      <button
                        type="button"
                        className="stepper-btn"
                        aria-label="Sumar 1 punto a penalizador TAM joven"
                        onClick={() =>
                          setAgePenaltyAllocation({
                            youthTamPenalty: agePenaltyAllocation.youthTamPenalty + 1,
                          })
                        }
                        disabled={agePenaltyAllocation.youthTamPenalty >= 5}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
                <p className={`points-state ${youthState}`}>
                  Total actual: {agePenaltyAllocation.youthFuePenalty + agePenaltyAllocation.youthTamPenalty} / 5
                </p>
              </div>
            )}
            {draft.age >= 40 && (
              <div className="card" style={{ gridColumn: "1 / -1" }}>
                <p className="kpi">Penalizador fisico por edad (FUE/CON/DES)</p>
                <div className="grid three">
                  <div>
                    <label>FUE</label>
                    <div className="number-stepper">
                      <button
                        type="button"
                        className="stepper-btn"
                        aria-label="Restar 1 punto a penalizador FUE por edad"
                        onClick={() =>
                          setAgePenaltyAllocation({
                            matureFuePenalty: agePenaltyAllocation.matureFuePenalty - 1,
                          })
                        }
                        disabled={agePenaltyAllocation.matureFuePenalty <= 0}
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min={0}
                        value={agePenaltyAllocation.matureFuePenalty}
                        onChange={(e) => setAgePenaltyAllocation({ matureFuePenalty: Number(e.target.value) })}
                      />
                      <button
                        type="button"
                        className="stepper-btn"
                        aria-label="Sumar 1 punto a penalizador FUE por edad"
                        onClick={() =>
                          setAgePenaltyAllocation({
                            matureFuePenalty: agePenaltyAllocation.matureFuePenalty + 1,
                          })
                        }
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div>
                    <label>CON</label>
                    <div className="number-stepper">
                      <button
                        type="button"
                        className="stepper-btn"
                        aria-label="Restar 1 punto a penalizador CON por edad"
                        onClick={() =>
                          setAgePenaltyAllocation({
                            matureConPenalty: agePenaltyAllocation.matureConPenalty - 1,
                          })
                        }
                        disabled={agePenaltyAllocation.matureConPenalty <= 0}
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min={0}
                        value={agePenaltyAllocation.matureConPenalty}
                        onChange={(e) => setAgePenaltyAllocation({ matureConPenalty: Number(e.target.value) })}
                      />
                      <button
                        type="button"
                        className="stepper-btn"
                        aria-label="Sumar 1 punto a penalizador CON por edad"
                        onClick={() =>
                          setAgePenaltyAllocation({
                            matureConPenalty: agePenaltyAllocation.matureConPenalty + 1,
                          })
                        }
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div>
                    <label>DES</label>
                    <div className="number-stepper">
                      <button
                        type="button"
                        className="stepper-btn"
                        aria-label="Restar 1 punto a penalizador DES por edad"
                        onClick={() =>
                          setAgePenaltyAllocation({
                            matureDesPenalty: agePenaltyAllocation.matureDesPenalty - 1,
                          })
                        }
                        disabled={agePenaltyAllocation.matureDesPenalty <= 0}
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min={0}
                        value={agePenaltyAllocation.matureDesPenalty}
                        onChange={(e) => setAgePenaltyAllocation({ matureDesPenalty: Number(e.target.value) })}
                      />
                      <button
                        type="button"
                        className="stepper-btn"
                        aria-label="Sumar 1 punto a penalizador DES por edad"
                        onClick={() =>
                          setAgePenaltyAllocation({
                            matureDesPenalty: agePenaltyAllocation.matureDesPenalty + 1,
                          })
                        }
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
                <p className={`points-state ${matureState}`}>
                  Total actual:
                  {agePenaltyAllocation.matureFuePenalty +
                    agePenaltyAllocation.matureConPenalty +
                    agePenaltyAllocation.matureDesPenalty}
                  / {matureTarget}
                </p>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="grid two">
            <div className="card roll-substeps-card" style={{ gridColumn: "1 / -1" }}>
              <p className="roll-next-step">
                {currentCharacteristicInRoll
                  ? `Habilidad en curso: ${currentCharacteristicInRoll}`
                  : "Habilidad en curso: completadas"}
              </p>
              {highlightedCharacteristic && (
                <p className="roll-source">
                  Tirada:{` `}
                  {getCharacteristicRollSource(highlightedCharacteristic)}
                </p>
              )}
              {rollingCharacteristic && (
                <p className="roll-breakdown">Preview en curso. Pulsa "Lanzar característica" para confirmar.</p>
              )}
              <div className={`dice-roller-3d ${rollingCharacteristic ? "active" : ""} ${!rollingCharacteristic && diceValues.length > 0 ? "settled" : ""}`} aria-hidden="true">
                <div className="dice-expression-group">
                  <div className="dice-sum-group">
                    {shouldWrapAdditiveGroup && <span className="dice-group-paren">(</span>}
                    {[0, 1, 2].map((index) => {
                      const value = diceValues[index] ?? 1;
                      const style = {
                        "--dice-settle-transform": dieSettleTransform(value),
                      } as CSSProperties;
                      const hidden = index >= activeDiceCount;
                      const sizeClass = index === 0 ? "dice-cube-a" : index === 1 ? "dice-cube-b" : "dice-cube-c";

                      return (
                        <Fragment key={`roll-die-${index}`}>
                          <span className={`dice-cube ${sizeClass} ${hidden ? "hidden" : ""}`} style={style}>
                            {renderDieFace("dice-face dice-face-front", DICE_FACE_VALUES.front)}
                            {renderDieFace("dice-face dice-face-back", DICE_FACE_VALUES.back)}
                            {renderDieFace("dice-face dice-face-right", DICE_FACE_VALUES.right)}
                            {renderDieFace("dice-face dice-face-left", DICE_FACE_VALUES.left)}
                            {renderDieFace("dice-face dice-face-top", DICE_FACE_VALUES.top)}
                            {renderDieFace("dice-face dice-face-bottom", DICE_FACE_VALUES.bottom)}
                          </span>
                          {showDiceSumPlus && !hidden && index < activeDiceCount - 1 && <span className="dice-plus-badge">+</span>}
                        </Fragment>
                      );
                    })}
                    {highlightedFormulaModifiers.additive.map((modifier) => (
                        <span
                          key={`modifier-${highlightedCharacteristic}-${modifier}`}
                          className={`dice-formula-modifier-chip ${modifier.startsWith("-") ? "dice-formula-modifier-chip--negative" : ""}`}
                        >
                          {modifier}
                        </span>
                      ))}
                    {shouldWrapAdditiveGroup && <span className="dice-group-paren">)</span>}
                  </div>
                  {highlightedFormulaModifiers.multiplier && (
                    <p className="dice-formula-modifiers" aria-live="polite">
                      <span
                        key={`modifier-${highlightedCharacteristic}-${highlightedFormulaModifiers.multiplier}`}
                        className="dice-formula-modifier-chip"
                      >
                        {highlightedFormulaModifiers.multiplier}
                      </span>
                    </p>
                  )}
                  {highlightedAgeModifier !== 0 && (
                    <p className="dice-formula-modifiers" aria-live="polite">
                      <span
                        key={`modifier-age-${highlightedCharacteristic}-${highlightedAgeModifier}`}
                        className={`dice-formula-modifier-chip ${highlightedAgeModifier < 0 ? "dice-formula-modifier-chip--negative" : ""}`}
                      >
                        {highlightedAgeModifier > 0 ? `+${highlightedAgeModifier}` : `${highlightedAgeModifier}`} (edad)
                      </span>
                    </p>
                  )}
                </div>
                {highlightedCharacteristic && (
                  <span
                    key={`dice-total-${highlightedCharacteristic}-${highlightedRollValue ?? "pending"}`}
                    className={`dice-total-badge ${highlightedRollValue === null ? "" : "dice-total-badge--updated"}`}
                    aria-live="polite"
                  >
                    {highlightedRollValue === null ? "= ?" : `= ${highlightedRollValue}`}
                  </span>
                )}
              </div>
              <div className="roll-substeps-actions">
                {shouldAutoRerollFromSummary ? (
                  <button
                    className="primary"
                    type="button"
                    onClick={handleReturnAfterSummaryReroll}
                    disabled={!summaryRerollCompleted || Boolean(rollingCharacteristic)}
                  >
                    {summaryRerollCompleted ? "Volver al resumen" : "Relanzando..."}
                  </button>
                ) : (
                  <>
                    {!isFirstRollPending && (
                      <button
                        className={`primary ${rollingCharacteristic ? "rolling" : ""}`}
                        type="button"
                        onClick={handlePrepareNextCharacteristic}
                        disabled={!nextCharacteristicToRoll || Boolean(rollingCharacteristic)}
                      >
                        {nextCharacteristicToRoll ? `Siguiente característica (${nextCharacteristicToRoll})` : "Sin pendientes"}
                      </button>
                    )}
                    <button
                      className="primary"
                      type="button"
                      onClick={isFirstRollPending ? handleLaunchNextCharacteristic : handleLaunchPreparedCharacteristic}
                      disabled={isFirstRollPending ? !nextCharacteristicToRoll : !rollingCharacteristic}
                    >
                      {isFirstRollPending
                        ? `Lanzar ${nextCharacteristicToRoll ?? "característica"}`
                        : rollingCharacteristic
                          ? `Lanzar ${rollingCharacteristic}`
                          : "Lanzar característica"}
                    </button>
                    <button className="ghost" type="button" onClick={handleResetCharacteristicRolls}>
                      Reiniciar tiradas
                    </button>
                  </>
                )}
              </div>
              <p className="small">
                {shouldAutoRerollFromSummary
                  ? summaryRerollCompleted
                    ? "Resultado aplicado. Pulsa para volver al resumen."
                    : "Relanzando característica con animación..."
                  : "Ve lanzando una por una y observa como van quedando los valores."}
              </p>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="roll-summary-layout">
            <div className="card roll-summary-hero">
              <p className="kpi">Resultado de tiradas hasta ahora</p>
              <p className="small">Revisa atributos, formula aplicada y derivados antes de pasar a ocupacion.</p>
              <div className="roll-summary-hero-metrics">
                <span className="roll-summary-meta">Edad: {draft.age}</span>
                <span className="roll-summary-meta">
                  Caracteristicas listas: {completedCharacteristicCount}/{characteristicKeys.length}
                </span>
                <span className={`roll-summary-meta ${allCharacteristicsRolled ? "done" : ""}`}>
                  {allCharacteristicsRolled ? "Listo para ocupacion" : "Faltan tiradas"}
                </span>
              </div>
            </div>

            <div className="roll-summary-stats">
              {characteristicKeys.map((key) => (
                <div
                  className={`card roll-summary-card ${typeof draft.characteristics[key] === "number" ? "filled" : ""} ${summaryHighlightCharacteristics.includes(key) ? "reroll-highlight" : ""}`}
                  key={`summary-roll-${key}`}
                >
                  <div className="roll-summary-card-head">
                    <p className="kpi roll-summary-label">{key}</p>
                  </div>
                  <p className="roll-summary-value">
                    <span className={`roll-summary-value-badge ${typeof draft.characteristics[key] === "number" ? "" : "is-empty"}`}>
                      {draft.characteristics[key] ?? "--"}
                    </span>
                  </p>
                  <p className="roll-summary-formula">Tirada: {getCharacteristicRollSource(key)}</p>
                  <div className="roll-summary-card-actions">
                    <button
                      type="button"
                      className="ghost roll-summary-reroll-button"
                      onClick={() => handleAskGuardianPermissionForReroll(key)}
                      disabled={typeof draft.characteristics[key] !== "number" || rerollingCharacteristic === key}
                    >
                      {rerollingCharacteristic === key ? "Relanzando..." : "Relanzar"}
                    </button>
                  </div>
                {characteristicRollDetails[key]?.length ? (
                    <details className="roll-summary-detail">
                      <summary>Ver detalle</summary>
                      <p className="small">{characteristicRollDetails[key]?.join(" | ")}</p>
                    </details>
                ) : null}
                </div>
              ))}
            </div>
            {allCharacteristicsRolled ? (
              <div className="card roll-summary-derived">
                <p className="kpi">Cálculos automáticos</p>
                {(() => {
                  const characteristics = draft.characteristics as any;
                  const derived = computeDerivedStats(characteristics, draft.age);
                  const movBase = characteristics.DES < characteristics.TAM && characteristics.FUE < characteristics.TAM
                    ? 7
                    : characteristics.DES > characteristics.TAM && characteristics.FUE > characteristics.TAM
                      ? 9
                      : 8;
                  const movPenalty = draft.age >= 40 ? Math.min(5, Math.floor(draft.age / 10) - 3) : 0;
                  const sumFueTam = characteristics.FUE + characteristics.TAM;
                  return (
                    <div className="roll-summary-derived-grid">
                      <div className="roll-summary-derived-item">
                        <p className="roll-summary-derived-label">PV</p>
                        <p className="roll-summary-derived-value">
                          <span className="roll-summary-value-badge roll-summary-value-badge--derived">{derived.pv}</span>
                        </p>
                        <p className="roll-summary-derived-detail">
                          ({characteristics.CON} + {characteristics.TAM}) / 10, redondeado hacia abajo
                        </p>
                      </div>
                      <div className="roll-summary-derived-item">
                        <p className="roll-summary-derived-label">PM</p>
                        <p className="roll-summary-derived-value">
                          <span className="roll-summary-value-badge roll-summary-value-badge--derived">{derived.pmInicial}</span>
                        </p>
                        <p className="roll-summary-derived-detail">
                          {characteristics.POD} / 5, redondeado hacia abajo
                        </p>
                      </div>
                      <div className="roll-summary-derived-item">
                        <p className="roll-summary-derived-label">MOV</p>
                        <p className="roll-summary-derived-value">
                          <span className="roll-summary-value-badge roll-summary-value-badge--derived">{derived.mov}</span>
                        </p>
                        <p className="roll-summary-derived-detail">
                          Base {movBase} - penalizador edad {movPenalty} = {derived.mov}
                        </p>
                      </div>
                      <div className="roll-summary-derived-item">
                        <p className="roll-summary-derived-label">BD</p>
                        <p className="roll-summary-derived-value">
                          <span className="roll-summary-value-badge roll-summary-value-badge--derived">{derived.damageBonus}</span>
                        </p>
                        <p className="roll-summary-derived-detail">
                          Se toma de la tabla usando FUE + TAM = {sumFueTam}
                        </p>
                      </div>
                      <div className="roll-summary-derived-item">
                        <p className="roll-summary-derived-label">Corpulencia</p>
                        <p className="roll-summary-derived-value">
                          <span className="roll-summary-value-badge roll-summary-value-badge--derived">{derived.build}</span>
                        </p>
                        <p className="roll-summary-derived-detail">
                          Se toma de la tabla usando FUE + TAM = {sumFueTam}
                        </p>
                      </div>
                    </div>
                  );
                })()}
                <div className="roll-summary-interest-card">
                  <p className="roll-summary-derived-label">Puntos de interés base (INT x2)</p>
                  <p className="roll-summary-derived-value">
                    <span className="roll-summary-value-badge roll-summary-value-badge--derived">{personalPoints}</span>
                  </p>
                  <p className="roll-summary-derived-detail">INT ({draft.characteristics.INT}) x 2</p>
                </div>
              </div>
            ) : (
              <div className="card roll-summary-derived">
                <p className="kpi">Cálculos automáticos</p>
                <p className="small">Completa las tiradas restantes para ver PV, PM, MOV, BD y Corpulencia.</p>
              </div>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="grid">
            {activeOccupation && (
              <div
                className="card occupation-carousel"
                onTouchStart={handleOccupationTouchStart}
                onTouchMove={handleOccupationTouchMove}
                onTouchEnd={handleOccupationTouchEnd}
              >
                <div className="occupation-carousel-head">
                  <p className="kpi">Ocupacion {occupationSlideIndex + 1} / {allOccupations.length}</p>
                  {draft.occupation?.name === activeOccupation.name && <span className="occupation-selected-badge">Seleccionada</span>}
                </div>

                <div className="occupation-carousel-nav">
                  <button type="button" className="ghost" onClick={goToPreviousOccupation} aria-label="Ocupacion anterior">
                    Anterior
                  </button>
                  <h3>{activeOccupation.name}</h3>
                  <button type="button" className="ghost" onClick={goToNextOccupation} aria-label="Ocupacion siguiente">
                    Siguiente
                  </button>
                </div>

                <div className="occupation-layout">
                  <div className="occupation-media">
                    <div className={`occupation-visual ${activeOccupationImageOrientation === "portrait" ? "portrait" : "landscape"}`}>
                      {!activeOccupationImageUnavailable && activeOccupationImage ? (
                        <>
                          <Image
                            key={activeOccupation.name}
                            src={activeOccupationImage}
                            alt={`Retrato de ${activeOccupation.name}`}
                            className="occupation-image"
                            fill
                            sizes="(max-width: 768px) 100vw, 50vw"
                            quality={72}
                            loading="lazy"
                            onLoad={(event) => {
                              const image = event.currentTarget as HTMLImageElement;
                              const orientation = image.naturalHeight > image.naturalWidth ? "portrait" : "landscape";
                              setOccupationImageOrientation((current) => ({
                                ...current,
                                [activeOccupation.name]: orientation,
                              }));
                              setOccupationImageLoaded((current) => ({
                                ...current,
                                [activeOccupation.name]: true,
                              }));
                            }}
                            onError={() =>
                              setOccupationImageErrors((current) => ({
                                ...current,
                                [activeOccupation.name]: true,
                              }))
                            }
                          />
                          {activeOccupationImageLoading && (
                            <div className="occupation-image-loader" role="status" aria-label="Cargando retrato">
                              <span className="occupation-image-spinner" aria-hidden="true" />
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="occupation-image-fallback">
                          <div className="arcane-seal" aria-hidden="true">
                            <div className="arcane-seal-core" />
                          </div>
                          <p className="occupation-fallback-title">Sello arcano</p>
                          <p>{activeOccupation.name}</p>
                          <p className="small">Retrato no disponible. Agrega un archivo en /public/ocupaciones.</p>
                        </div>
                      )}
                    </div>

                  </div>

                  <div className="occupation-details">
                    <div className="occupation-meta-grid">
                      <div className="card">
                        <p className="kpi">Credito recomendado</p>
                        <p>{activeOccupation.credit_range}</p>
                      </div>
                      <div className="card">
                        <p className="kpi">Formula de puntos</p>
                        <p>{activeOccupation.occupation_points_formula}</p>
                      </div>
                    </div>

                    <div className="occupation-columns">
                      <div className="card">
                        <p className="kpi">Habilidades basicas por defecto</p>
                        <ul className="occupation-list">
                          {activeOccupation.skills.map((skill) => (
                            <li key={skill}>{skill}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="card">
                        <p className="kpi">Opciones de ocupacion</p>
                        {activeOccupation.choice_groups.length === 0 ? (
                          <p className="small">No tiene grupos opcionales.</p>
                        ) : (
                          <ul className="occupation-list">
                            {activeOccupation.choice_groups.map((group, index) => (
                              <li key={`${group.label}-${index}`}>
                                Elegir {group.count} de ({group.from.join(", ")}) [{group.label}]
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>

                    <div className="occupation-carousel-actions">
                      <button type="button" className="primary" onClick={() => applyOccupationBySlide(occupationSlideIndex)}>
                        Elegir {activeOccupation.name}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

        {step === 5 && (
          <div className="grid">
            {draft.occupation && occupation && (
              <div className="grid two">
                {occupation.choice_groups.length > 0 && (
                  <div className="card" style={{ gridColumn: "1 / -1" }}>
                    <p className="kpi">Seleccion de opciones de ocupacion</p>
                    <div className="occupation-choice-layout">
                      <div className="occupation-choice-main">
                        {occupation.choice_groups.map((group, index) => {
                          const key = getChoiceKey(index, group.label);
                          const options = getChoiceGroupSkillOptions(index, occupation.name);
                          const selectedValues = draft.occupation?.selectedChoices?.[key] ?? [];
                          const hasForbiddenOption = options.some((option) => isForbiddenInitialCreationSkill(option));
                          return (
                            <div key={key} className="occupation-choice-group">
                              <label>
                                {group.label} (elige {group.count})
                              </label>
                              <div className="occupation-choice-options">
                                {options.map((option) => {
                                  const isSelected = selectedValues.includes(option);
                                  const canSelectMore = selectedValues.length < group.count;
                                  const isForbidden = isForbiddenInitialCreationSkill(option);
                                  const isDisabled = isForbidden || (!isSelected && !canSelectMore);
                                  const optionHelp = getSkillHelp(option);
                                  const optionBaseLabel = formatSkillBaseLabel(optionHelp.base);
                                  return (
                                    <div key={option} className="occupation-choice-option-row">
                                      <button
                                        type="button"
                                        className={`occupation-choice-option ${isSelected ? "is-selected" : ""}`}
                                        disabled={isDisabled}
                                        onClick={() => {
                                          if (isForbidden) return;
                                          const nextValues = isSelected
                                            ? selectedValues.filter((value) => value !== option)
                                            : [...selectedValues, option];
                                          setChoiceGroupSkills(index, group.label, nextValues, group.count);
                                        }}
                                        title={isForbidden ? "De momento no tienes suficientes conocimientos arcanos." : undefined}
                                      >
                                        <span className="occupation-choice-option-main">
                                          <span
                                            className={`occupation-check occupation-choice-check ${isSelected ? "is-visible" : "is-hidden"}`}
                                            aria-hidden="true"
                                          >
                                            ✓
                                          </span>
                                          <span className="occupation-choice-option-label">{option}</span>
                                        </span>
                                        <span className="occupation-choice-option-base" title={`Base ${optionHelp.base}`}>
                                          {optionBaseLabel}
                                        </span>
                                      </button>
                                      <button
                                        type="button"
                                        className="occupation-choice-help-trigger"
                                        onClick={() => setHelpSkillOpen(option)}
                                        aria-label={`Consultar habilidad ${option}`}
                                        title={`Informacion de ${option}`}
                                      >
                                        <svg viewBox="0 0 24 24" aria-hidden="true" className="occupation-info-icon">
                                          <circle cx="12" cy="12" r="9" />
                                          <line x1="12" y1="10.5" x2="12" y2="16" />
                                          <circle cx="12" cy="7.5" r="1" />
                                        </svg>
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                              {hasForbiddenOption && <p className="small">Mitos de Cthulhu: de momento no tienes suficientes conocimientos arcanos.</p>}
                              <p className="small">
                                Seleccionadas: {selectedValues.length} / {group.count}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                      <aside className="occupation-choice-summary">
                        <p className="kpi">Habilidades fijas de ocupacion</p>
                        <p className="small">Estas vienen definidas por la ocupacion y no se pueden modificar aqui.</p>
                        <div className="occupation-skill-badges">
                          {fixedOccupationSkills.length > 0 ? (
                            fixedOccupationSkills.map((skill) => (
                              <div key={`fixed-badge-${skill}`} className="occupation-skill-chip">
                                <span className="occupation-skill-badge is-selected">
                                  <span className="occupation-check" aria-hidden="true">✓</span>
                                  {skill}
                                </span>
                                <button
                                  type="button"
                                  className="occupation-skill-help-trigger"
                                  onClick={() => setHelpSkillOpen(skill)}
                                  aria-label={`Consultar habilidad ${skill}`}
                                  title={`Informacion de ${skill}`}
                                >
                                  <svg viewBox="0 0 24 24" aria-hidden="true" className="occupation-info-icon">
                                    <circle cx="12" cy="12" r="9" />
                                    <line x1="12" y1="10.5" x2="12" y2="16" />
                                    <circle cx="12" cy="7.5" r="1" />
                                  </svg>
                                </button>
                              </div>
                            ))
                          ) : (
                            <span className="occupation-skill-badge is-available">Sin habilidades fijas</span>
                          )}
                        </div>
                        <p className="kpi">Especialidades elegidas</p>
                        {occupation.choice_groups.map((group, index) => {
                          const key = getChoiceKey(index, group.label);
                          const selectedValues = draft.occupation?.selectedChoices?.[key] ?? [];
                          return (
                            <div key={`summary-${key}`} className="occupation-choice-summary-group">
                              <p className="small">
                                {group.label} ({selectedValues.length}/{group.count})
                              </p>
                              <div className="occupation-skill-badges">
                                {selectedValues.length > 0 ? (
                                  selectedValues.map((skill) => (
                                    <div key={`summary-badge-${key}-${skill}`} className="occupation-skill-chip">
                                      <span className="occupation-skill-badge is-selected">
                                        <span className="occupation-check" aria-hidden="true">✓</span>
                                        {skill}
                                      </span>
                                      <button
                                        type="button"
                                        className="occupation-skill-help-trigger"
                                        onClick={() => setHelpSkillOpen(skill)}
                                        aria-label={`Consultar habilidad ${skill}`}
                                        title={`Informacion de ${skill}`}
                                      >
                                        <svg viewBox="0 0 24 24" aria-hidden="true" className="occupation-info-icon">
                                          <circle cx="12" cy="12" r="9" />
                                          <line x1="12" y1="10.5" x2="12" y2="16" />
                                          <circle cx="12" cy="7.5" r="1" />
                                        </svg>
                                      </button>
                                    </div>
                                  ))
                                ) : (
                                  <span className="occupation-skill-badge is-available">Sin seleccionar</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </aside>
                    </div>
                  </div>
                )}
                {occupationFormulaChoices.length > 0 && (
                  <div className="card" style={{ gridColumn: "1 / -1" }}>
                    <p className="kpi">Eleccion de formula de puntos</p>
                    <p className="small">
                      Selecciona la rama exacta que aplica al investigador. No se calcula automaticamente por valor maximo.
                    </p>
                    {occupationFormulaChoices.map((choice) => (
                      <div key={choice.key} className="formula-choice-block">
                        <label>{choice.options.map((option) => formatFormulaOption(option)).join(" o ")}</label>
                        <select
                          value={draft.occupation?.formulaChoices?.[choice.key] ?? choice.options[0]}
                          onChange={(event) => setOccupationFormulaChoice(choice.key, event.target.value)}
                        >
                          {choice.options.map((option) => (
                            <option value={option} key={option}>
                              {formatFormulaOption(option)}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                    <p className="kpi">
                      Puntos de ocupacion resultantes:{" "}
                      {draft.characteristics.INT ? occupationPoints : "completa caracteristicas en paso 2 para calcular"}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {step === 6 && (
          <div className="skills-layout">
            <aside className="points-sidebar">
              <div className="card points-card">
                <p className="kpi">Puntos de ocupacion</p>
                <p>Total: {occupationPoints}</p>
                <p>Credito: {occupationCreditAssigned}</p>
                <p>Habilidades: {occupationSkillAssigned}</p>
                <p>Asignados: {occupationAssigned}</p>
                <p className={`points-state ${pointsStateClass(occupationRemaining)}`}>Restantes: {occupationRemaining}</p>
              </div>
              <div className="card points-card">
                <p className="kpi">Puntos de interes</p>
                <p>Total: {personalPoints}</p>
                <p>Asignados: {personalAssigned}</p>
                <p className={`points-state ${pointsStateClass(personalRemaining)}`}>Restantes: {personalRemaining}</p>
              </div>
            </aside>

            <div className="grid">
              <div className="card" style={{ gridColumn: "1 / -1" }}>
                <p className="kpi">Agregar habilidad o especialidad</p>
                <div className="grid two">
                  <div>
                    <label>Familia base</label>
                    <select value={customSkillBase} onChange={(event) => setCustomSkillBase(event.target.value)}>
                      {customSkillBaseOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label>Bolsa inicial</label>
                    <select
                      value={customSkillBucket}
                      onChange={(event) => setCustomSkillBucket(event.target.value as "occupation" | "personal")}
                    >
                      <option value="personal">Interes</option>
                      <option value="occupation">Ocupacion</option>
                    </select>
                  </div>
                </div>
                <div className="grid two">
                  <div>
                    <label>Especialidad (opcional)</label>
                    <input
                      type="text"
                      value={customSkillDetail}
                      placeholder="Ej: Subfusil, Quimica, Espanol, Helicoptero..."
                      onChange={(event) => setCustomSkillDetail(event.target.value)}
                    />
                  </div>
                  <div style={{ alignSelf: "end" }}>
                    <button type="button" className="primary" onClick={handleAddCustomSkill}>
                      Agregar
                    </button>
                  </div>
                </div>
                <p className="small">
                  Resultado: <strong>{buildCustomSkillName(customSkillBase, customSkillDetail)}</strong>
                </p>
                {customSkillMessage && <p className="small">{customSkillMessage}</p>}
              </div>

              {groupedSkills.occupationFirst.length > 0 && (
                <div className="card" style={{ gridColumn: "1 / -1" }}>
                  <p className="kpi">Habilidades de ocupacion</p>
                </div>
              )}
              {groupedSkills.occupationFirst.map((skill) => (
                (() => {
                  const skillComputed = computedSkills[skill];
                  const skillBase = skillComputed?.base ?? 0;
                  const skillOccupation = skillComputed?.occupation ?? 0;
                  const skillPersonal = skillComputed?.personal ?? 0;
                  const skillTotal = skillComputed?.total ?? 0;
                  const canAssignOccupation = isAllowedOccupationSkill(draft.occupation, skill);
                  const occupationMin = 0;
                  const occupationMax = canAssignOccupation ? getSkillMax("occupation", skill) : 0;
                  const occupationValue = draft.skills.occupation[skill] ?? 0;
                  const personalMin = 0;
                  const personalMax = getSkillMax("personal", skill);
                  const personalValue = draft.skills.personal[skill] ?? 0;

                  return (
                    <div className="card" key={skill}>
                      <div className="skill-header">
                        <p>{skill}</p>
                        <button
                          type="button"
                          className="skill-help-trigger"
                          onClick={() => setHelpSkillOpen(skill)}
                          aria-label={`Abrir ayuda de ${skill}`}
                        >
                          ?
                        </button>
                      </div>
                      <div className="skill-total-badge">
                        <p className="skill-total-label">Total final</p>
                        <strong>{skillTotal}</strong>
                        <p className="skill-total-breakdown">Base {skillBase} + Ocupacion {skillOccupation} + Interes {skillPersonal}</p>
                      </div>
                      <div className="grid three">
                        <div>
                          <label>Base</label>
                          <input type="number" value={skillBase} readOnly disabled />
                        </div>
                        <div>
                          <label>Ocupacion</label>
                          <div className="number-stepper">
                            <button
                              type="button"
                              className="stepper-btn"
                              aria-label={`Restar 1 punto a ocupacion en ${skill}`}
                              onClick={() => handleSkillChange("occupation", skill, occupationValue - 1)}
                              disabled={!canAssignOccupation || occupationValue <= occupationMin}
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min={occupationMin}
                              max={occupationMax}
                              value={occupationValue}
                              onChange={(e) => handleSkillChange("occupation", skill, Number(e.target.value))}
                              disabled={!canAssignOccupation}
                            />
                            <button
                              type="button"
                              className="stepper-btn"
                              aria-label={`Sumar 1 punto a ocupacion en ${skill}`}
                              onClick={() => handleSkillChange("occupation", skill, occupationValue + 1)}
                              disabled={!canAssignOccupation || occupationValue >= occupationMax}
                            >
                              +
                            </button>
                          </div>
                          {!canAssignOccupation && <p className="small">No permitida por tu ocupacion.</p>}
                        </div>
                        <div>
                          <label>Interes</label>
                          <div className="number-stepper">
                            <button
                              type="button"
                              className="stepper-btn"
                              aria-label={`Restar 1 punto a interes en ${skill}`}
                              onClick={() => handleSkillChange("personal", skill, personalValue - 1)}
                              disabled={personalValue <= personalMin}
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min={personalMin}
                              max={personalMax}
                              value={personalValue}
                              onChange={(e) => handleSkillChange("personal", skill, Number(e.target.value))}
                            />
                            <button
                              type="button"
                              className="stepper-btn"
                              aria-label={`Sumar 1 punto a interes en ${skill}`}
                              onClick={() => handleSkillChange("personal", skill, personalValue + 1)}
                              disabled={personalValue >= personalMax}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                      <p className="small">
                        Dificil {skillComputed?.hard ?? 0} | Extrema {skillComputed?.extreme ?? 0}
                      </p>
                    </div>
                  );
                })()
              ))}
              {groupedSkills.personalOnly.length > 0 && (
                <div className="card" style={{ gridColumn: "1 / -1" }}>
                  <p className="kpi">Habilidades de interes</p>
                </div>
              )}
              {groupedSkills.personalOnly.map((skill) => (
                (() => {
                  const skillComputed = computedSkills[skill];
                  const skillBase = skillComputed?.base ?? 0;
                  const skillOccupation = skillComputed?.occupation ?? 0;
                  const skillPersonal = skillComputed?.personal ?? 0;
                  const skillTotal = skillComputed?.total ?? 0;
                  const canAssignOccupation = isAllowedOccupationSkill(draft.occupation, skill);
                  const occupationMin = 0;
                  const occupationMax = canAssignOccupation ? getSkillMax("occupation", skill) : 0;
                  const occupationValue = draft.skills.occupation[skill] ?? 0;
                  const personalMin = 0;
                  const personalMax = getSkillMax("personal", skill);
                  const personalValue = draft.skills.personal[skill] ?? 0;

                  return (
                    <div className="card" key={skill}>
                      <div className="skill-header">
                        <p>{skill}</p>
                        <button
                          type="button"
                          className="skill-help-trigger"
                          onClick={() => setHelpSkillOpen(skill)}
                          aria-label={`Abrir ayuda de ${skill}`}
                        >
                          ?
                        </button>
                      </div>
                      <div className="skill-total-badge">
                        <p className="skill-total-label">Total final</p>
                        <strong>{skillTotal}</strong>
                        <p className="skill-total-breakdown">Base {skillBase} + Ocupacion {skillOccupation} + Interes {skillPersonal}</p>
                      </div>
                      <div className="grid three">
                        <div>
                          <label>Base</label>
                          <input type="number" value={skillBase} readOnly disabled />
                        </div>
                        <div>
                          <label>Ocupacion</label>
                          <div className="number-stepper">
                            <button
                              type="button"
                              className="stepper-btn"
                              aria-label={`Restar 1 punto a ocupacion en ${skill}`}
                              onClick={() => handleSkillChange("occupation", skill, occupationValue - 1)}
                              disabled={!canAssignOccupation || occupationValue <= occupationMin}
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min={occupationMin}
                              max={occupationMax}
                              value={occupationValue}
                              onChange={(e) => handleSkillChange("occupation", skill, Number(e.target.value))}
                              disabled={!canAssignOccupation}
                            />
                            <button
                              type="button"
                              className="stepper-btn"
                              aria-label={`Sumar 1 punto a ocupacion en ${skill}`}
                              onClick={() => handleSkillChange("occupation", skill, occupationValue + 1)}
                              disabled={!canAssignOccupation || occupationValue >= occupationMax}
                            >
                              +
                            </button>
                          </div>
                          {!canAssignOccupation && <p className="small">No permitida por tu ocupacion.</p>}
                        </div>
                        <div>
                          <label>Interes</label>
                          <div className="number-stepper">
                            <button
                              type="button"
                              className="stepper-btn"
                              aria-label={`Restar 1 punto a interes en ${skill}`}
                              onClick={() => handleSkillChange("personal", skill, personalValue - 1)}
                              disabled={personalValue <= personalMin}
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min={personalMin}
                              max={personalMax}
                              value={personalValue}
                              onChange={(e) => handleSkillChange("personal", skill, Number(e.target.value))}
                            />
                            <button
                              type="button"
                              className="stepper-btn"
                              aria-label={`Sumar 1 punto a interes en ${skill}`}
                              onClick={() => handleSkillChange("personal", skill, personalValue + 1)}
                              disabled={personalValue >= personalMax}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                      <p className="small">
                        Dificil {skillComputed?.hard ?? 0} | Extrema {skillComputed?.extreme ?? 0}
                      </p>
                    </div>
                  );
                })()
              ))}
            </div>

            <div className="mobile-points-bar">
              <button type="button" className={`chip ${pointsStateClass(occupationRemaining)}`} onClick={() => setMobilePointsOpen(true)}>
                Ocupacion: {occupationRemaining}
              </button>
              <button type="button" className={`chip ${pointsStateClass(personalRemaining)}`} onClick={() => setMobilePointsOpen(true)}>
                Interes: {personalRemaining}
              </button>
            </div>

            {mobilePointsOpen && (
              <div className="mobile-points-modal" role="dialog" aria-modal="true" aria-label="Detalle de puntos">
                <div className="mobile-points-overlay" onClick={() => setMobilePointsOpen(false)} />
                <div className="mobile-points-sheet">
                  <button type="button" className="skill-help-close mobile-points-close" onClick={() => setMobilePointsOpen(false)} aria-label="Cerrar detalle de puntos">
                    x
                  </button>
                  <div className="card points-card">
                    <p className="kpi">Puntos de ocupacion</p>
                    <p>Total: {occupationPoints}</p>
                    <p>Credito: {occupationCreditAssigned}</p>
                    <p>Habilidades: {occupationSkillAssigned}</p>
                    <p>Asignados: {occupationAssigned}</p>
                    <p className={`points-state ${pointsStateClass(occupationRemaining)}`}>Restantes: {occupationRemaining}</p>
                  </div>
                  <div className="card points-card">
                    <p className="kpi">Puntos de interes</p>
                    <p>Total: {personalPoints}</p>
                    <p>Asignados: {personalAssigned}</p>
                    <p className={`points-state ${pointsStateClass(personalRemaining)}`}>Restantes: {personalRemaining}</p>
                  </div>
                  <button type="button" className="primary" onClick={() => setMobilePointsOpen(false)}>
                    Cerrar
                  </button>
                </div>
              </div>
            )}

          </div>
        )}

        {step === 7 && (
          <div className="grid">
            <div className="card" style={{ gridColumn: "1 / -1" }}>
              <p className="skill-detail-eyebrow">Antes de Credito</p>
              <h3>Resumen final de habilidades</h3>
              <p className="small">Revisa los totales por habilidad y usa "Atras" para volver a editar las que quieras ajustar.</p>
            </div>
            <div className="card skill-points-summary-card" style={{ gridColumn: "1 / -1" }}>
              {finalSkillTotals.length === 0 ? (
                <p className="small">Aun no hay habilidades con puntos asignados.</p>
              ) : (
                <div className="skill-points-summary-list">
                  {finalSkillTotals.map((entry) => (
                    <div key={entry.skill} className="skill-points-summary-row">
                      <p>{entry.skill}</p>
                      <p>
                        <strong>{entry.total}%</strong> (Base {entry.base}% + Ocupacion {entry.occupation}% + Interes {entry.personal}%)
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {step === 8 && (
          <div className="grid">
            {draft.occupation && occupation && (
              <div className="grid two">
                <div className="card">
                  <label>Credito ({occupation.credit_range})</label>
                  <input
                    type="number"
                    value={draft.occupation.creditRating}
                    min={occupationCreditRange?.min ?? 0}
                    max={occupationCreditRange?.max ?? 99}
                    onChange={(e) =>
                      setOccupation({
                        ...draft.occupation!,
                        creditRating: Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="card">
                  <p className="kpi">Resumen de puntos de ocupacion</p>
                  <p>Total: {occupationPoints}</p>
                  <p>Credito: {occupationCreditAssigned}</p>
                  <p>Habilidades: {occupationSkillAssigned}</p>
                  <p>Asignados: {occupationAssigned}</p>
                  <p className={`points-state ${pointsStateClass(occupationRemaining)}`}>Restantes: {occupationRemaining}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 9 && (
          <div className="grid two">
            <div className="card" style={{ gridColumn: "1 / -1" }}>
              <p className="kpi">Trasfondo</p>
              <p className="small">
                Completa las 6 categorias principales con al menos una frase: descripcion personal, ideologia/creencias,
                allegados, lugares significativos, posesiones preciadas y rasgos.
              </p>
            </div>
            <div className="card">
              <label>Nombre del investigador</label>
              <input value={draft.identity.nombre} onChange={(e) => setIdentityField("nombre", e.target.value)} />
            </div>
            <div className="card">
              <label>Genero</label>
              <input value={draft.identity.genero} onChange={(e) => setIdentityField("genero", e.target.value)} />
            </div>
            <div className="card">
              <label>Lugar de residencia actual</label>
              <input value={draft.identity.residenciaActual} onChange={(e) => setIdentityField("residenciaActual", e.target.value)} />
            </div>
            <div className="card">
              <label>Lugar de nacimiento</label>
              <input value={draft.identity.lugarNacimiento} onChange={(e) => setIdentityField("lugarNacimiento", e.target.value)} />
            </div>
            <div className="card" style={{ gridColumn: "1 / -1" }}>
              <label>URL de retrato (opcional)</label>
              <input value={draft.identity.retratoUrl ?? ""} onChange={(e) => setIdentityField("retratoUrl", e.target.value)} />
            </div>

            <div className="card">
              <label>Descripcion personal</label>
              <textarea
                value={draft.background.descripcionPersonal ?? ""}
                onChange={(e) => setBackgroundField("descripcionPersonal", e.target.value)}
              />
            </div>
            <div className="card">
              <label>Ideologia / creencias</label>
              <textarea
                value={draft.background.ideologiaCreencias ?? ""}
                onChange={(e) => setBackgroundField("ideologiaCreencias", e.target.value)}
              />
            </div>
            <div className="card">
              <label>Allegados</label>
              <textarea value={draft.background.allegados ?? ""} onChange={(e) => setBackgroundField("allegados", e.target.value)} />
            </div>
            <div className="card">
              <label>Lugares significativos</label>
              <textarea
                value={draft.background.lugaresSignificativos ?? ""}
                onChange={(e) => setBackgroundField("lugaresSignificativos", e.target.value)}
              />
            </div>
            <div className="card">
              <label>Posesiones preciadas</label>
              <textarea
                value={draft.background.posesionesPreciadas ?? ""}
                onChange={(e) => setBackgroundField("posesionesPreciadas", e.target.value)}
              />
            </div>
            <div className="card">
              <label>Rasgos</label>
              <textarea value={draft.background.rasgos ?? ""} onChange={(e) => setBackgroundField("rasgos", e.target.value)} />
            </div>
            <div className="card" style={{ gridColumn: "1 / -1" }}>
              <label>Vinculo fundamental (obligatorio)</label>
              <input
                value={draft.background.vinculoPrincipal ?? ""}
                onChange={(e) => setBackgroundField("vinculoPrincipal", e.target.value)}
              />
            </div>

            <div className="card" style={{ gridColumn: "1 / -1" }}>
              <p className="kpi">Companeros investigadores</p>
              {draft.companions.map((companion, index) => (
                <div key={`${companion.personaje}-${index}`} className="grid three" style={{ marginBottom: 10 }}>
                  <input
                    placeholder="Personaje"
                    value={companion.personaje}
                    onChange={(e) =>
                      setCompanion(index, {
                        ...companion,
                        personaje: e.target.value,
                      })
                    }
                  />
                  <input
                    placeholder="Jugador"
                    value={companion.jugador}
                    onChange={(e) =>
                      setCompanion(index, {
                        ...companion,
                        jugador: e.target.value,
                      })
                    }
                  />
                  <input
                    placeholder="Resumen"
                    value={companion.resumen}
                    onChange={(e) =>
                      setCompanion(index, {
                        ...companion,
                        resumen: e.target.value,
                      })
                    }
                  />
                  <button type="button" className="ghost" onClick={() => removeCompanion(index)}>
                    Quitar
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="ghost"
                onClick={() => setCompanion(draft.companions.length, { personaje: "", jugador: "", resumen: "" })}
              >
                Anadir companero
              </button>
            </div>
          </div>
        )}

        {step === 10 && (
          <div className="grid">
            <div className="card">
              <p className="kpi">Finanzas (segun Credito)</p>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setEquipmentField("spendingLevel", financeSnapshot.spendingLevel);
                }}
              >
                Autocompletar nivel de vida
              </button>
              <label>Nivel de gasto</label>
              <input
                value={draft.equipment.spendingLevel ?? ""}
                onChange={(e) => setEquipmentField("spendingLevel", e.target.value)}
                placeholder={financeSnapshot.spendingLevel}
              />
              <label>Dinero en efectivo</label>
              <input
                value={draft.equipment.cash ?? ""}
                onChange={(e) => setEquipmentField("cash", e.target.value)}
                placeholder="Consulta Tabla II del manual"
              />
              <label>Propiedades / bienes</label>
              <input
                value={draft.equipment.assets ?? ""}
                onChange={(e) => setEquipmentField("assets", e.target.value)}
                placeholder="Consulta Tabla II del manual"
              />
            </div>
            <div className="card">
              <label>Armas/equipo/objetos importantes</label>
              <textarea value={draft.equipment.notes} onChange={(e) => setEquipmentNotes(e.target.value)} />
            </div>
            <div className="card">
              <p className="kpi">Al finalizar se calcula hoja completa y exportaciones.</p>
            </div>
          </div>
        )}

        {activeSkillHelp && (
          <div className="skill-detail-modal" role="dialog" aria-modal="true" aria-label={`Ayuda de ${activeSkillHelp.skill}`}>
            <div className="skill-detail-overlay" onClick={() => setHelpSkillOpen(null)} />
            <div className="skill-detail-sheet">
              <div className="skill-detail-title-row">
                <p className="skill-detail-eyebrow">Detalle de habilidad</p>
                <h3>{activeSkillHelp.skill}</h3>
                <button type="button" className="skill-detail-close" onClick={() => setHelpSkillOpen(null)} aria-label="Cerrar ayuda">
                  ×
                </button>
              </div>
              <div className="skill-detail-base-row">
                <span className="skill-detail-base-chip">
                  <span className="skill-detail-base-label">Base sugerida</span>
                  <span className="skill-detail-base-badge">{activeSkillHelp.base}</span>
                </span>
              </div>
              <p className="skill-detail-summary">{activeSkillHelp.summary}</p>
              <div className="skill-detail-section">
                <p className="kpi">Ejemplo de uso</p>
                <p>{activeSkillHelp.example}</p>
              </div>
              <div className="skill-detail-section">
                <p className="kpi">Consejo</p>
                <p>{activeSkillHelp.complement}</p>
              </div>
            </div>
          </div>
        )}

        {!isSummaryRerollFlow && (
          <div className="actions">
            <button className="ghost" type="button" onClick={goBack}>
              Atras
            </button>
            <button className="primary" type="button" onClick={goNext} disabled={!canContinue}>
              {step >= 10 ? "Ir al resumen" : "Siguiente"}
            </button>
            <button
              className="ghost"
              type="button"
              onClick={() => setShowResetModal(true)}
            >
              Reiniciar
            </button>
          </div>
        )}
      </section>
      <ResetProgressModal
        open={showResetModal}
        onCancel={() => setShowResetModal(false)}
        onConfirm={handleConfirmReset}
        showArcaneEye
      />
      <ResetProgressModal
        open={showResetRollsModal}
        onCancel={() => setShowResetRollsModal(false)}
        onConfirm={handleConfirmResetCharacteristicRolls}
        title="Reiniciar tiradas"
        message="¿Estás seguro de reiniciar tiradas? Las tiradas anteriores se perderán."
        confirmLabel="Sí, reiniciar tiradas"
        ariaLabel="Confirmar reinicio de tiradas"
        showArcaneEye
      />
      <ResetProgressModal
        open={showGuardianPermissionModal}
        onCancel={() => {
          setShowGuardianPermissionModal(false);
          setPendingRerollCharacteristic(null);
        }}
        onConfirm={handleConfirmGuardianReroll}
        title="Permiso del guardian"
        message={`Para volver a relanzar${pendingRerollCharacteristic ? ` ${pendingRerollCharacteristic}` : " esta caracteristica"} debes tener el permiso del guardian.`}
        secondaryMessage={guardianCosmicWarning}
        confirmLabel="Tengo el permiso"
        cancelLabel="Cancelar"
        ariaLabel="Confirmar permiso del guardian para relanzar caracteristica"
        showArcaneEye
      />
    </main>
  );
}

export function Summary() {
  const router = useRouter();
  const { draft, reset } = useCharacterStore();
  const [showResetModal, setShowResetModal] = useState(false);

  let json = "";
  let error = "";
  try {
    json = toCharacterJson(finalizeCharacter(draft));
  } catch (err) {
    error = err instanceof Error ? err.message : "No se pudo finalizar";
  }

  function handleConfirmReset() {
    reset();
    clearClientData();
    setShowResetModal(false);
    router.push("/");
  }

  return (
    <main>
      <section className="app-shell">
        <h1 className="title">Resumen final</h1>
        <p className="subtitle">Valida y exporta tu investigador.</p>

        {error ? (
          <div className="alert">{error}</div>
        ) : (
          <>
            <div className="actions">
              <button
                className="primary"
                onClick={() => {
                  const blob = new Blob([json], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "investigador-coc7.json";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                type="button"
              >
                Exportar JSON
              </button>
              <button
                type="button"
                onClick={async () => {
                  const response = await fetch("/api/export/pdf", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: json,
                  });
                  if (!response.ok) {
                    alert("Error al generar PDF");
                    return;
                  }
                  const blob = await response.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "investigador-coc7.pdf";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Exportar PDF
              </button>
            </div>
            <pre className="json">{json}</pre>
          </>
        )}

        <div className="actions">
          <button className="ghost" type="button" onClick={() => router.push("/crear/10")}>
            Volver a editar
          </button>
          <button
            className="ghost"
            type="button"
            onClick={() => setShowResetModal(true)}
          >
            Nuevo personaje
          </button>
        </div>
      </section>
      <ResetProgressModal
        open={showResetModal}
        onCancel={() => setShowResetModal(false)}
        onConfirm={handleConfirmReset}
        showArcaneEye
      />
    </main>
  );
}
