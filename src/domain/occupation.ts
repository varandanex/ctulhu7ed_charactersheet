import type { CharacteristicKey, OccupationSelection } from "@/domain/types";
import { investigatorSkillsCatalog, professionCatalog, rulesCatalog } from "@/rules-data/catalog";

const SPECIALIZABLE_SKILL_FAMILIES = [
  "armas de fuego",
  "arte/artesania",
  "ciencia",
  "combatir",
  "lengua propia",
  "otras lenguas",
  "pilotar",
] as const;

function normalizeText(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isForbiddenInitialCreationSkill(skill: string): boolean {
  const normalizedSkill = normalizeText(skill);
  return rulesCatalog.skill_point_rules.cannot_allocate_to.some((entry) => {
    const normalizedEntry = normalizeText(entry).replace(/\(.*\)/g, "").trim();
    return normalizedEntry.length > 0 && normalizedSkill.includes(normalizedEntry);
  });
}

function getSkillFamily(normalizedSkill: string): string | null {
  for (const family of SPECIALIZABLE_SKILL_FAMILIES) {
    if (normalizedSkill === family || normalizedSkill.startsWith(`${family} (`) || normalizedSkill.startsWith(`${family}(`)) {
      return family;
    }
  }

  return null;
}

function isGenericFamilyEntry(raw: string, family: string): boolean {
  const normalized = normalizeText(raw);

  if (normalized === family) return true;
  if (normalized.includes(`${family} (cualquiera)`)) return true;

  return false;
}

function collectGenericFamilyAllowances(selection: OccupationSelection): Set<string> {
  const occupation = professionCatalog.occupations.find((occ) => occ.name === selection.name);
  if (!occupation) return new Set();

  const genericFamilies = new Set<string>();
  const selectedFromGroups = Object.values(selection.selectedChoices ?? {}).flatMap((skills) => skills);
  const rawEntries = [...occupation.skills, ...selectedFromGroups];

  for (const entry of rawEntries) {
    for (const family of SPECIALIZABLE_SKILL_FAMILIES) {
      if (isGenericFamilyEntry(entry, family)) {
        genericFamilies.add(family);
      }
    }
  }

  return genericFamilies;
}

function looksLikeAnySkillOption(raw: string): boolean {
  const normalized = normalizeText(raw);
  return normalized.includes("cualquiera") || normalized.includes("especialidades");
}

function selectionHasAnySkillAllowance(selection: OccupationSelection): boolean {
  const occupation = professionCatalog.occupations.find((occ) => occ.name === selection.name);
  if (!occupation) return false;

  if (occupation.skills.some((entry) => looksLikeAnySkillOption(entry))) return true;

  const hasAnyChoiceGroup = occupation.choice_groups.some((group, index) => {
    const key = getGroupKey(index, group.label);
    const selectedInGroup = selection.selectedChoices?.[key] ?? [];
    if (selectedInGroup.length === 0) return false;
    return group.from.some((entry) => looksLikeAnySkillOption(entry));
  });
  if (hasAnyChoiceGroup) return true;

  const selectedFromGroups = Object.values(selection.selectedChoices ?? {}).flatMap((skills) => skills);
  return selectedFromGroups.some((entry) => looksLikeAnySkillOption(entry));
}

function expandGenericSpecializedSkill(raw: string): string[] {
  const normalized = normalizeText(raw);

  if (normalized === "combatir" || normalized === "armas de fuego") {
    const specializedOptions = investigatorSkillsCatalog.skills.filter((skill) => {
      const normalizedSkill = normalizeText(skill);
      return normalizedSkill.startsWith(`${normalized} (`) || normalizedSkill.startsWith(`${normalized}(`);
    });
    if (specializedOptions.length > 0) {
      return specializedOptions;
    }
  }

  return [raw];
}

export function splitOrSkills(raw: string): string[] {
  if (looksLikeAnySkillOption(raw)) {
    return [...investigatorSkillsCatalog.skills];
  }

  const normalized = raw.replace(/\s+o\s+/gi, "||");
  const chunks = normalized.split("||").map((part) => part.trim());
  return chunks.filter((part) => part.length > 0);
}

export function expandSkillEntry(raw: string): string[] {
  const options = splitOrSkills(raw);
  const expandedOptions = options.flatMap((option) => expandGenericSpecializedSkill(option));
  const unique = new Set(expandedOptions);
  return [...unique];
}

function getGroupKey(index: number, label: string): string {
  return `${index}:${label}`;
}

export function getChoiceGroupSkillOptions(groupIndex: number, occupationName: string): string[] {
  const occupation = professionCatalog.occupations.find((occ) => occ.name === occupationName);
  if (!occupation) return [];
  const group = occupation.choice_groups[groupIndex];
  if (!group) return [];

  const options = group.from.flatMap((entry) => expandSkillEntry(entry));
  return [...new Set(options)];
}

export function buildDefaultChoiceSelections(occupationName: string): Record<string, string[]> {
  const occupation = professionCatalog.occupations.find((occ) => occ.name === occupationName);
  if (!occupation) return {};

  return occupation.choice_groups.reduce(
    (acc, group, index) => {
      const key = getGroupKey(index, group.label);
      const options = getChoiceGroupSkillOptions(index, occupationName);
      const selectableOptions = options.filter((skill) => !isForbiddenInitialCreationSkill(skill));
      acc[key] = selectableOptions.slice(0, group.count);
      return acc;
    },
    {} as Record<string, string[]>,
  );
}

export function collectAllowedOccupationSkills(selection: OccupationSelection): string[] {
  const occupation = professionCatalog.occupations.find((occ) => occ.name === selection.name);
  if (!occupation) return [];

  const base = occupation.skills.flatMap((skill) => expandSkillEntry(skill));
  const selectedFromGroups = Object.values(selection.selectedChoices ?? {}).flatMap((skills) => skills);
  return [...new Set([...base, ...selectedFromGroups])];
}

export function validateChoiceSelections(selection?: OccupationSelection): string[] {
  if (!selection) return ["Selecciona una ocupacion."];

  const occupation = professionCatalog.occupations.find((occ) => occ.name === selection.name);
  if (!occupation) return ["La ocupacion seleccionada no existe en el catalogo."];

  const errors: string[] = [];
  for (let index = 0; index < occupation.choice_groups.length; index += 1) {
    const group = occupation.choice_groups[index];
    const key = getGroupKey(index, group.label);
    const selected = (selection.selectedChoices?.[key] ?? []).filter((value) => value.trim().length > 0);
    const allowed = new Set(getChoiceGroupSkillOptions(index, selection.name).map((value) => normalizeText(value)));
    const inGroup = selected.filter((value) => allowed.has(normalizeText(value)) && !isForbiddenInitialCreationSkill(value));

    if (inGroup.length !== group.count) {
      errors.push(`Debes seleccionar ${group.count} habilidad(es) en "${group.label}".`);
      continue;
    }

    if (new Set(inGroup.map((value) => normalizeText(value))).size !== inGroup.length) {
      errors.push(`Hay habilidades repetidas en "${group.label}".`);
    }
  }

  return errors;
}

export function isAllowedOccupationSkill(selection: OccupationSelection | undefined, skill: string): boolean {
  if (!selection) return false;
  const normalizedSkill = normalizeText(skill);
  const allowed = collectAllowedOccupationSkills(selection).map((entry) => normalizeText(entry));
  if (allowed.includes(normalizedSkill)) return true;
  if (selectionHasAnySkillAllowance(selection)) return true;

  const family = getSkillFamily(normalizedSkill);
  if (!family) return false;

  const genericFamilyAllowances = collectGenericFamilyAllowances(selection);
  return genericFamilyAllowances.has(family);
}

export function normalizeSkillName(skill: string): string {
  return normalizeText(skill);
}

export function isCharacteristicToken(token: string): token is CharacteristicKey {
  return ["FUE", "CON", "TAM", "DES", "APA", "INT", "POD", "EDU", "SUERTE"].includes(token);
}
