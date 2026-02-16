"use client";

import { useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import { useRouter } from "next/navigation";
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

function getTargetState(current: number, expected: number): "ok" | "warn" | "over" {
  if (current === expected) return "ok";
  if (current < expected) return "warn";
  return "over";
}

function formatRollFormula(formula: string): string {
  return formula.replace(/x/gi, " x ");
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
  const [mobilePointsOpen, setMobilePointsOpen] = useState(false);
  const [helpSkillOpen, setHelpSkillOpen] = useState<string | null>(null);
  const [rollingCharacteristic, setRollingCharacteristic] = useState<CharacteristicKey | null>(null);
  const [characteristicRollDetails, setCharacteristicRollDetails] = useState<Partial<Record<CharacteristicKey, string[]>>>({});
  const [occupationSlideIndex, setOccupationSlideIndex] = useState(0);
  const [occupationImageErrors, setOccupationImageErrors] = useState<Record<string, boolean>>({});
  const [occupationImageLoaded, setOccupationImageLoaded] = useState<Record<string, boolean>>({});
  const [occupationImageOrientation, setOccupationImageOrientation] = useState<Record<string, "portrait" | "landscape">>({});
  const rollTimeoutRef = useRef<number | null>(null);
  const occupationTouchStartX = useRef<number | null>(null);
  const occupationTouchStartY = useRef<number | null>(null);
  const occupationTouchCurrentX = useRef<number | null>(null);
  const occupationTouchCurrentY = useRef<number | null>(null);
  const {
    draft,
    setAge,
    setAgePenaltyAllocation,
    setLastRolledAge,
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
  const allCharacteristicsRolled = completedCharacteristicCount === characteristicKeys.length;
  const visibleCharacteristicKeys = useMemo(() => {
    if (rollingCharacteristic) return [rollingCharacteristic];
    if (nextCharacteristicToRoll) return [nextCharacteristicToRoll];
    const lastRolled = [...characteristicKeys].reverse().find((key) => typeof draft.characteristics[key] === "number");
    return lastRolled ? [lastRolled] : [characteristicKeys[0]];
  }, [draft.characteristics, rollingCharacteristic, nextCharacteristicToRoll]);
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

  const canContinue = issues.every((issue) => issue.severity !== "error");

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

  function handleRollNextCharacteristic() {
    if (!nextCharacteristicToRoll || rollingCharacteristic) return;
    const characteristicToRoll = nextCharacteristicToRoll;
    if (typeof draft.lastRolledAge !== "number" || completedCharacteristicCount === 0) {
      setLastRolledAge(draft.age);
    }

    setRollingCharacteristic(characteristicToRoll);
    if (rollTimeoutRef.current !== null) {
      window.clearTimeout(rollTimeoutRef.current);
    }
    rollTimeoutRef.current = window.setTimeout(() => {
      const detail = rollCharacteristicWithAgeModifiersDetailed(characteristicToRoll, draft.age, agePenaltyAllocation);
      setCharacteristic(characteristicToRoll, detail.finalValue);
      setCharacteristicRollDetails((current) => ({
        ...current,
        [characteristicToRoll]: detail.steps,
      }));
      setRollingCharacteristic(null);
      rollTimeoutRef.current = null;
    }, 1000);
  }

  function handleResetCharacteristicRolls() {
    if (rollTimeoutRef.current !== null) {
      window.clearTimeout(rollTimeoutRef.current);
      rollTimeoutRef.current = null;
    }
    setRollingCharacteristic(null);
    setCharacteristicRollDetails({});
    clearCharacteristics();
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
    if (step >= 6) {
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
      if (rollTimeoutRef.current !== null) {
        window.clearTimeout(rollTimeoutRef.current);
      }
    };
  }, []);

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
    if (step !== 3) return;

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
    if (step !== 3 || !draft.occupation?.name) return;
    const selectedIndex = allOccupations.findIndex((item) => item.name === draft.occupation?.name);
    if (selectedIndex >= 0) {
      setOccupationSlideIndex(selectedIndex);
    }
  }, [allOccupations, draft.occupation?.name, step]);

  useEffect(() => {
    if (step !== 3 || !draft.occupation) return;
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

  return (
    <main>
      <section className="app-shell">
        <h1 className="title">Creador de Investigadores</h1>
        <p className="subtitle">{title}</p>

        <div className="step-nav" aria-label="Pasos">
          {stepsCatalog.steps.map((item) => (
            <button
              type="button"
              key={item.id}
              className={`step-pill ${item.id === step ? "active" : ""}`}
              onClick={() => router.push(`/crear/${item.id}`)}
            >
              {item.id}. {item.title}
            </button>
          ))}
          <button
            type="button"
            className={`step-pill ${step === stepsCatalog.steps.length + 1 ? "active" : ""}`}
            onClick={() => router.push("/crear/resumen")}
          >
            {stepsCatalog.steps.length + 1}. Resumen
          </button>
        </div>
        <p className="small step-nav-hint">Desliza la barra de pasos para ver todos los pasos.</p>

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
              <ul className="age-guidance-list">
                {ageGuidance.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
            <div className="card" style={{ gridColumn: "1 / -1" }}>
              <p className="kpi">Reglas activas por edad ({draft.age})</p>
              <div className="age-rule-grid">
                <p>
                  Mejoras de EDU: <strong>{eduImprovementRolls}</strong>
                </p>
                <p>
                  Penalizador MOV por edad: <strong>-{draft.age >= 40 ? Math.min(5, Math.floor(draft.age / 10) - 3) : 0}</strong>
                </p>
                {draft.age >= 40 && (
                  <p>
                    Penalizador APA: <strong>-{draft.age >= 80 ? 25 : draft.age >= 70 ? 20 : draft.age >= 60 ? 15 : draft.age >= 50 ? 10 : 5}</strong>
                  </p>
                )}
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
              <p className="kpi">Subpaso 2.1: Tiradas de caracteristicas</p>
              <p className="roll-progress">
                {completedCharacteristicCount} / {characteristicKeys.length} completadas
              </p>
              <p className="roll-next-step">
                {rollingCharacteristic
                  ? `Lanzando ${rollingCharacteristic}...`
                  : nextCharacteristicToRoll
                    ? `Siguiente tirada: ${nextCharacteristicToRoll}`
                    : "Tiradas completadas"}
              </p>
              {(rollingCharacteristic || nextCharacteristicToRoll) && (
                <p className="roll-source">
                  Tirada:{` `}
                  {getCharacteristicRollSource((rollingCharacteristic ?? nextCharacteristicToRoll) as CharacteristicKey)}
                </p>
              )}
              {rollingCharacteristic && (
                <p className="roll-breakdown">Preparando detalle de la tirada...</p>
              )}
              <div className={`dice-roll-indicator ${rollingCharacteristic ? "active" : ""}`} aria-live="polite">
                <span className="dice-icon" aria-hidden="true" />
                <span>{rollingCharacteristic ? "Tirada en curso" : "Listo para lanzar"}</span>
              </div>
              <div className="roll-substeps-actions">
                <button
                  className={`primary ${rollingCharacteristic ? "rolling" : ""}`}
                  type="button"
                  onClick={handleRollNextCharacteristic}
                  disabled={!nextCharacteristicToRoll || Boolean(rollingCharacteristic)}
                >
                  {rollingCharacteristic ? "Lanzando..." : `Lanzar ${nextCharacteristicToRoll ?? ""}`}
                </button>
                <button className="ghost" type="button" onClick={handleResetCharacteristicRolls}>
                  Reiniciar tiradas
                </button>
              </div>
              <p className="small">Ve lanzando una por una y observa como van quedando los valores.</p>
            </div>
            {visibleCharacteristicKeys.map((key) => (
              <div
                className={`card characteristic-card ${nextCharacteristicToRoll === key ? "current" : ""} ${
                  rollingCharacteristic === key ? "rolling" : ""
                } ${
                  typeof draft.characteristics[key] === "number" ? "done" : ""
                }`}
                key={key}
              >
                <p className="characteristic-label">{key}</p>
                <p className="characteristic-value">{rollingCharacteristic === key ? "..." : (draft.characteristics[key] ?? "--")}</p>
                <p className="characteristic-roll-source">{getCharacteristicRollSource(key)}</p>
                {(characteristicRollDetails[key] ?? []).length > 0 && (
                  <div className="characteristic-roll-detail">
                    {(characteristicRollDetails[key] ?? []).map((line, index) => (
                      <p key={`${key}-detail-${index}`}>{line}</p>
                    ))}
                  </div>
                )}
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={draft.characteristics[key] ?? ""}
                  onChange={(e) => setCharacteristic(key, Number(e.target.value))}
                  disabled
                />
              </div>
            ))}
            {allCharacteristicsRolled && (
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

        {step === 4 && (
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

        {step === 5 && (
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

        {step === 6 && (
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

        <div className="actions">
          <button className="ghost" type="button" onClick={goBack}>
            Atras
          </button>
          <button className="primary" type="button" onClick={goNext} disabled={!canContinue}>
            {step >= 6 ? "Ir al resumen" : "Siguiente"}
          </button>
          <button
            className="ghost"
            type="button"
            onClick={() => {
              reset();
              router.push("/crear/1");
            }}
          >
            Reiniciar
          </button>
        </div>
      </section>
    </main>
  );
}

export function Summary() {
  const router = useRouter();
  const { draft, reset } = useCharacterStore();

  let json = "";
  let error = "";
  try {
    json = toCharacterJson(finalizeCharacter(draft));
  } catch (err) {
    error = err instanceof Error ? err.message : "No se pudo finalizar";
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
          <button className="ghost" type="button" onClick={() => router.push("/crear/6")}>
            Volver a editar
          </button>
          <button
            className="ghost"
            type="button"
            onClick={() => {
              reset();
              router.push("/crear/1");
            }}
          >
            Nuevo personaje
          </button>
        </div>
      </section>
    </main>
  );
}
