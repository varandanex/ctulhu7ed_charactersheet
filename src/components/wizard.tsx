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
} from "@/domain/occupation";
import {
  computeSkillBreakdown,
  computeDerivedStats,
  evaluateOccupationPointsFormula,
  extractOccupationFormulaChoiceGroups,
  finalizeCharacter,
  rollCharacteristicWithAgeModifiersDetailed,
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
  const personalSkills = useMemo(() => {
    const unique = new Set([...investigatorSkillsCatalog.skills, ...occupationSkills]);
    return [...unique];
  }, [occupationSkills]);
  const groupedSkills = useMemo(() => {
    const fallback = ["Mitos de Cthulhu", "Psicologia", "Descubrir", "Buscar libros"];
    const allSkills = personalSkills.length > 0 ? personalSkills : fallback;
    const occupationSet = new Set(occupationSkills);
    const occupationFirst = allSkills.filter((skill) => occupationSet.has(skill) || isCreditSkill(skill));
    const personalOnly = allSkills.filter((skill) => !occupationSet.has(skill) && !isCreditSkill(skill));
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
    Number.isFinite(rerollReturnStep) && rerollReturnStep >= 1 && rerollReturnStep <= 7 ? rerollReturnStep : 3;

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
    if (bucket === "occupation") {
      const current = draft.skills.occupation[skill] ?? 0;
      return Math.max(occupationRemainingBudget + current, 0);
    }
    const current = draft.skills.personal[skill] ?? 0;
    return Math.max(personalRemainingBudget + current, 0);
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

  function setChoiceGroupSkills(groupIndex: number, groupLabel: string, selectedValues: string[], count: number) {
    if (!draft.occupation) return;
    const bounded = selectedValues.slice(0, count);
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
    if (step >= 7) {
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
    const selectedChoices = buildDefaultChoiceSelections(selected.name);
    const formulaChoices = extractOccupationFormulaChoiceGroups(selected.occupation_points_formula).reduce(
      (acc, group) => {
        acc[group.key] = group.options[0];
        return acc;
      },
      {} as Record<string, string>,
    );
    const selectedSkills = collectAllowedOccupationSkills({
      name: selected.name,
      creditRating: Number(selected.credit_range.split("-")[0]),
      selectedSkills: [],
      selectedChoices,
    });
    setOccupation({
      name: selected.name,
      creditRating: Number(selected.credit_range.split("-")[0]),
      selectedChoices,
      selectedSkills,
      formulaChoices,
    });
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
      ? "Cthulhu ya se va a cabrear de verdad: una relanzada mas y te pone a tirar cordura en directo."
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
                    <input
                      type="number"
                      min={0}
                      max={5}
                      value={agePenaltyAllocation.youthFuePenalty}
                      onChange={(e) => setAgePenaltyAllocation({ youthFuePenalty: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label>TAM</label>
                    <input
                      type="number"
                      min={0}
                      max={5}
                      value={agePenaltyAllocation.youthTamPenalty}
                      onChange={(e) => setAgePenaltyAllocation({ youthTamPenalty: Number(e.target.value) })}
                    />
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
                    <input
                      type="number"
                      min={0}
                      value={agePenaltyAllocation.matureFuePenalty}
                      onChange={(e) => setAgePenaltyAllocation({ matureFuePenalty: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label>CON</label>
                    <input
                      type="number"
                      min={0}
                      value={agePenaltyAllocation.matureConPenalty}
                      onChange={(e) => setAgePenaltyAllocation({ matureConPenalty: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label>DES</label>
                    <input
                      type="number"
                      min={0}
                      value={agePenaltyAllocation.matureDesPenalty}
                      onChange={(e) => setAgePenaltyAllocation({ matureDesPenalty: Number(e.target.value) })}
                    />
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
            {allCharacteristicsRolled && !isSummaryRerollFlow && (
              <div className="card" style={{ gridColumn: "1 / -1" }}>
                <p className="kpi">Derivados previos:</p>
                {(() => {
                  const derived = computeDerivedStats(draft.characteristics as any, draft.age);
                  return (
                    <p>
                      PV {derived.pv} | PM {derived.pmInicial} | MOV {derived.mov} | BD {derived.damageBonus} | Corpulencia{" "}
                      {derived.build}
                    </p>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="roll-summary-layout">
            <div className="card roll-summary-hero">
              <p className="kpi">Resultado de tiradas hasta ahora</p>
              <p className="small">Revisa atributos, formula aplicada y derivados antes de pasar a ocupacion.</p>
              <div className="roll-summary-hero-metrics">
                <span className="roll-summary-meta">Edad: {draft.age}</span>
                <span className="roll-summary-meta">Atributos listos: {completedCharacteristicCount}/9</span>
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
                <p className="kpi">Calculos derivados</p>
                {(() => {
                  const derived = computeDerivedStats(draft.characteristics as any, draft.age);
                  return (
                    <div className="roll-summary-derived-grid">
                      <div className="roll-summary-derived-item">
                        <p className="roll-summary-derived-label">PV</p>
                        <p className="roll-summary-derived-value">
                          <span className="roll-summary-value-badge roll-summary-value-badge--derived">{derived.pv}</span>
                        </p>
                      </div>
                      <div className="roll-summary-derived-item">
                        <p className="roll-summary-derived-label">PM</p>
                        <p className="roll-summary-derived-value">
                          <span className="roll-summary-value-badge roll-summary-value-badge--derived">{derived.pmInicial}</span>
                        </p>
                      </div>
                      <div className="roll-summary-derived-item">
                        <p className="roll-summary-derived-label">MOV</p>
                        <p className="roll-summary-derived-value">
                          <span className="roll-summary-value-badge roll-summary-value-badge--derived">{derived.mov}</span>
                        </p>
                      </div>
                      <div className="roll-summary-derived-item">
                        <p className="roll-summary-derived-label">BD</p>
                        <p className="roll-summary-derived-value">
                          <span className="roll-summary-value-badge roll-summary-value-badge--derived">{derived.damageBonus}</span>
                        </p>
                      </div>
                      <div className="roll-summary-derived-item">
                        <p className="roll-summary-derived-label">Corpulencia</p>
                        <p className="roll-summary-derived-value">
                          <span className="roll-summary-value-badge roll-summary-value-badge--derived">{derived.build}</span>
                        </p>
                      </div>
                    </div>
                  );
                })()}
                <div className="roll-summary-interest-card">
                  <p className="roll-summary-derived-label">Puntos de interes base (INT x2)</p>
                  <p className="roll-summary-derived-value">
                    <span className="roll-summary-value-badge roll-summary-value-badge--derived">{personalPoints}</span>
                  </p>
                </div>
              </div>
            ) : (
              <div className="card roll-summary-derived">
                <p className="kpi">Calculos derivados</p>
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
                      <div className="card">
                        <p className="kpi">Etiqueta</p>
                        <p>{activeOccupation.tags.length > 0 ? activeOccupation.tags.join(", ") : "General"}</p>
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

                    {draft.occupation?.name === activeOccupation.name && activeOccupation.choice_groups.length > 0 && (
                      <div className="card">
                        <p className="kpi">Seleccion de opciones de ocupacion</p>
                        {activeOccupation.choice_groups.map((group, index) => {
                          const key = getChoiceKey(index, group.label);
                          const options = getChoiceGroupSkillOptions(index, activeOccupation.name);
                          const selectedValues = draft.occupation?.selectedChoices?.[key] ?? [];
                          return (
                            <div key={key} style={{ marginBottom: 12 }}>
                              <label>
                                {group.label} (elige {group.count})
                              </label>
                              <select
                                multiple
                                size={Math.min(8, Math.max(4, options.length))}
                                value={selectedValues}
                                onChange={(event) => {
                                  const values = Array.from(event.currentTarget.selectedOptions).map((option) => option.value);
                                  setChoiceGroupSkills(index, group.label, values, group.count);
                                }}
                              >
                                {options.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                              <p className="small">
                                Seleccionadas: {selectedValues.length} / {group.count}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="occupation-carousel-actions">
                      <button type="button" className="primary" onClick={() => applyOccupationBySlide(occupationSlideIndex)}>
                        Elegir {activeOccupation.name}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

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
                  <p className="kpi">Habilidades disponibles de ocupacion seleccionada</p>
                  <p>{occupationSkills.join(", ") || "Sin listado"}</p>
                </div>
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

        {step === 5 && (
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
              {groupedSkills.occupationFirst.length > 0 && (
                <div className="card" style={{ gridColumn: "1 / -1" }}>
                  <p className="kpi">Habilidades de ocupacion</p>
                </div>
              )}
              {groupedSkills.occupationFirst.map((skill) => (
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
                  <div className="grid two">
                    <div>
                      <label>Ocupacion</label>
                      <input
                        type="number"
                        min={isCreditSkill(skill) ? (occupationCreditRange?.min ?? 0) : 0}
                        max={isCreditSkill(skill) ? (occupationCreditRange?.max ?? 99) : getSkillMax("occupation", skill)}
                        value={isCreditSkill(skill) ? occupationCreditAssigned : (draft.skills.occupation[skill] ?? 0)}
                        onChange={(e) => handleSkillChange("occupation", skill, Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <label>Interes</label>
                      <input
                        type="number"
                        min={0}
                        max={isCreditSkill(skill) ? 0 : getSkillMax("personal", skill)}
                        value={isCreditSkill(skill) ? 0 : (draft.skills.personal[skill] ?? 0)}
                        onChange={(e) => handleSkillChange("personal", skill, Number(e.target.value))}
                        disabled={isCreditSkill(skill)}
                      />
                    </div>
                  </div>
                  <p className="small">
                    Total {computedSkills[skill]?.total ?? 0} | Dificil {computedSkills[skill]?.hard ?? 0} | Extrema{" "}
                    {computedSkills[skill]?.extreme ?? 0}
                  </p>
                </div>
              ))}
              {groupedSkills.personalOnly.length > 0 && (
                <div className="card" style={{ gridColumn: "1 / -1" }}>
                  <p className="kpi">Habilidades de interes</p>
                </div>
              )}
              {groupedSkills.personalOnly.map((skill) => (
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
                  <div>
                    <label>Interes</label>
                    <input
                      type="number"
                      min={0}
                      max={getSkillMax("personal", skill)}
                      value={draft.skills.personal[skill] ?? 0}
                      onChange={(e) => handleSkillChange("personal", skill, Number(e.target.value))}
                    />
                  </div>
                  <p className="small">
                    Total {computedSkills[skill]?.total ?? 0} | Dificil {computedSkills[skill]?.hard ?? 0} | Extrema{" "}
                    {computedSkills[skill]?.extreme ?? 0}
                  </p>
                </div>
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

            {activeSkillHelp && (
              <div className="skill-help-modal" role="dialog" aria-modal="true" aria-label={`Ayuda de ${activeSkillHelp.skill}`}>
                <div className="skill-help-overlay" onClick={() => setHelpSkillOpen(null)} />
                <div className="skill-help-sheet">
                  <div className="skill-help-title-row">
                    <h3>{activeSkillHelp.skill}</h3>
                    <button type="button" className="skill-help-close" onClick={() => setHelpSkillOpen(null)} aria-label="Cerrar ayuda">
                      x
                    </button>
                  </div>
                  <p className="kpi">Base sugerida: {activeSkillHelp.base}</p>
                  <p>{activeSkillHelp.summary}</p>
                  <p className="kpi">Ejemplo de uso</p>
                  <p>{activeSkillHelp.example}</p>
                  <p className="kpi">Consejo</p>
                  <p>{activeSkillHelp.complement}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 6 && (
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

        {step === 7 && (
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

        {!isSummaryRerollFlow && (
          <div className="actions">
            <button className="ghost" type="button" onClick={goBack}>
              Atras
            </button>
            <button className="primary" type="button" onClick={goNext} disabled={!canContinue}>
              {step >= 7 ? "Ir al resumen" : "Siguiente"}
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
          <button className="ghost" type="button" onClick={() => router.push("/crear/7")}>
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
