"use client";

import { useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import { useRouter } from "next/navigation";
import { investigatorSkillsCatalog, professionCatalog, stepsCatalog } from "@/rules-data/catalog";
import { getOccupationHelp } from "@/rules-data/occupation-help";
import { getSkillHelp } from "@/rules-data/skill-help";
import {
  buildDefaultChoiceSelections,
  collectAllowedOccupationSkills,
  getChoiceGroupSkillOptions,
} from "@/domain/occupation";
import {
  computeDerivedStats,
  evaluateOccupationPointsFormula,
  finalizeCharacter,
  validateStep,
} from "@/domain/rules";
import { getFinanceByCredit } from "@/domain/finance";
import type { CharacteristicKey, ValidationIssue } from "@/domain/types";
import { useCharacterStore } from "@/state/character-store";
import { toCharacterJson } from "@/services/export";

const characteristicKeys: CharacteristicKey[] = ["FUE", "CON", "TAM", "DES", "APA", "INT", "POD", "EDU", "SUERTE"];

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

function isCreditSkill(skill: string): boolean {
  return normalizeSkillName(skill) === "credito";
}

function getChoiceKey(index: number, label: string): string {
  return `${index}:${label}`;
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
  const [occupationSlideIndex, setOccupationSlideIndex] = useState(0);
  const occupationTouchStartX = useRef<number | null>(null);
  const occupationTouchStartY = useRef<number | null>(null);
  const occupationTouchCurrentX = useRef<number | null>(null);
  const occupationTouchCurrentY = useRef<number | null>(null);
  const {
    draft,
    setMode,
    setAge,
    setEra,
    rollAllCharacteristics,
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
  const allOccupations = useMemo(
    () =>
      professionCatalog.occupations.filter((item) => {
        if (draft.era === "actual") return true;
        return !item.tags.includes("actual");
      }),
    [draft.era],
  );
  const activeOccupation = allOccupations[occupationSlideIndex] ?? null;
  const activeOccupationHelp = activeOccupation ? getOccupationHelp(activeOccupation.name) : null;
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
    return evaluateOccupationPointsFormula(occupation.occupation_points_formula, draft.characteristics as any);
  }, [occupation, draft.characteristics]);

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

  const canContinue = issues.every((issue) => issue.severity !== "error");

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

  function goNext() {
    if (!canContinue) return;
    if (step >= 5) {
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
    if (step !== 2) return;

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
    if (step !== 2 || !draft.occupation?.name) return;
    const selectedIndex = allOccupations.findIndex((item) => item.name === draft.occupation?.name);
    if (selectedIndex >= 0) {
      setOccupationSlideIndex(selectedIndex);
    }
  }, [allOccupations, draft.occupation?.name, step]);

  useEffect(() => {
    if (step !== 2 || !draft.occupation) return;
    if (Object.keys(draft.occupation.selectedChoices ?? {}).length > 0) return;
    const selectedChoices = buildDefaultChoiceSelections(draft.occupation.name);
    const selectedSkills = collectAllowedOccupationSkills({
      ...draft.occupation,
      selectedChoices,
    });
    setOccupation({
      ...draft.occupation,
      selectedChoices,
      selectedSkills,
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
            className={`step-pill ${step === 6 ? "active" : ""}`}
            onClick={() => router.push("/crear/resumen")}
          >
            6. Resumen
          </button>
        </div>

        <Issues issues={issues} />

        {step === 1 && (
          <div className="grid two">
            <div className="card">
              <label>Modo</label>
              <select value={draft.mode} onChange={(e) => setMode(e.target.value as "random" | "manual")}>
                <option value="random">Tirada aleatoria</option>
                <option value="manual">Entrada manual</option>
              </select>
            </div>
            <div className="card">
              <label>Edad (15-90)</label>
              <input type="number" min={15} max={90} value={draft.age} onChange={(e) => setAge(Number(e.target.value))} />
            </div>
            <div className="card">
              <label>Ambientacion</label>
              <select value={draft.era ?? "clasica"} onChange={(e) => setEra(e.target.value)}>
                <option value="clasica">Lovecraft clasica</option>
                <option value="actual">Actual</option>
              </select>
            </div>
            <div className="card">
              <button className="primary" type="button" onClick={rollAllCharacteristics}>
                Tirar todo
              </button>
              <p className="small">Si usas modo manual, puedes editar cada valor abajo.</p>
            </div>
            {characteristicKeys.map((key) => (
              <div className="card" key={key}>
                <label>{key}</label>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={draft.characteristics[key] ?? ""}
                  onChange={(e) => setCharacteristic(key, Number(e.target.value))}
                />
              </div>
            ))}
            {characteristicKeys.every((key) => typeof draft.characteristics[key] === "number") && (
              <div className="card" style={{ gridColumn: "1 / -1" }}>
                <p className="kpi">Derivados previos:</p>
                {(() => {
                  const derived = computeDerivedStats(draft.characteristics as any, draft.age);
                  return (
                    <p>
                      PV {derived.pv} | PM {derived.pmInicial} | MOV {derived.mov} | DB {derived.damageBonus} | Build {derived.build}
                    </p>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="grid">
            {activeOccupation && activeOccupationHelp && (
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

                <div className="occupation-dots" aria-label="Navegacion de ocupaciones">
                  {allOccupations.map((item, index) => {
                    const isActive = index === occupationSlideIndex;
                    return (
                      <button
                        key={item.name}
                        type="button"
                        className={`occupation-dot ${isActive ? "active" : ""}`}
                        onClick={() => setOccupationSlideIndex(index)}
                        aria-label={`Ir a ${item.name}`}
                        aria-current={isActive ? "true" : undefined}
                      />
                    );
                  })}
                </div>

                <p>{activeOccupationHelp.overview}</p>
                <p className="small">{activeOccupationHelp.style}</p>
                <p className="small">{activeOccupationHelp.recommendedFor}</p>
                <p className="small">Fuente: {professionCatalog.source}</p>

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
              </div>
            )}
          </div>
        )}

        {step === 3 && (
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

        {step === 4 && (
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
              <label>Vinculo fundamental (opcional)</label>
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

        {step === 5 && (
          <div className="grid">
            <div className="card">
              <p className="kpi">Finanzas (segun Credito)</p>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setEquipmentField("spendingLevel", financeSnapshot.spendingLevel);
                  setEquipmentField("cash", financeSnapshot.cash);
                  setEquipmentField("assets", financeSnapshot.assets);
                }}
              >
                Autocompletar desde Credito
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
                placeholder={financeSnapshot.cash}
              />
              <label>Propiedades / bienes</label>
              <input
                value={draft.equipment.assets ?? ""}
                onChange={(e) => setEquipmentField("assets", e.target.value)}
                placeholder={financeSnapshot.assets}
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
            {step >= 5 ? "Ir al resumen" : "Siguiente"}
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
          <button className="ghost" type="button" onClick={() => router.push("/crear/5")}>
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
