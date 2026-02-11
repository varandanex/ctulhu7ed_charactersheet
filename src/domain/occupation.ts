import type { CharacteristicKey, OccupationSelection } from "@/domain/types";
import { investigatorSkillsCatalog, professionCatalog } from "@/rules-data/catalog";

function normalizeText(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeAnySkillOption(raw: string): boolean {
  const normalized = normalizeText(raw);
  return normalized.includes("cualquiera") || normalized.includes("especialidades");
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
      acc[key] = options.slice(0, group.count);
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
    const inGroup = selected.filter((value) => allowed.has(normalizeText(value)));

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
  const allowed = collectAllowedOccupationSkills(selection).map((entry) => normalizeText(entry));
  return allowed.includes(normalizeText(skill));
}

export function normalizeSkillName(skill: string): string {
  return normalizeText(skill);
}

export function isCharacteristicToken(token: string): token is CharacteristicKey {
  return ["FUE", "CON", "TAM", "DES", "APA", "INT", "POD", "EDU", "SUERTE"].includes(token);
}
