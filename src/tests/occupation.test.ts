import { describe, expect, it } from "vitest";
import { buildDefaultChoiceSelections, expandSkillEntry, isAllowedOccupationSkill, normalizeSkillName } from "@/domain/occupation";
import { professionCatalog } from "@/rules-data/catalog";
import type { OccupationSelection } from "@/domain/types";

describe("occupation helpers", () => {
  it("expands generic Combatir into specialized options", () => {
    const options = expandSkillEntry("Combatir");
    expect(options).toContain("Combatir (Pelea)");
    expect(options).not.toContain("Combatir");
  });

  it("expands generic Armas de fuego into specialized options", () => {
    const options = expandSkillEntry("Armas de fuego");
    expect(options).toContain("Armas de fuego (Arma corta)");
    expect(options).toContain("Armas de fuego (Fusil/Escopeta)");
    expect(options).not.toContain("Armas de fuego");
  });

  it("allows occupation allocation to selected firearm specializations", () => {
    const selection: OccupationSelection = {
      name: "Agente de policia",
      creditRating: 20,
      selectedSkills: [],
      selectedChoices: {
        "0:interpersonal": ["Persuasion"],
        "1:especialidad personal": ["Conducir automovil"],
      },
    };

    expect(isAllowedOccupationSkill(selection, "Armas de fuego (Arma corta)")).toBe(true);
    expect(isAllowedOccupationSkill(selection, "Armas de fuego (Fusil/Escopeta)")).toBe(true);
  });

  it("never preselects Mitos de Cthulhu in default occupation choices", () => {
    const allDefaultSelections = professionCatalog.occupations.flatMap((occupation) =>
      Object.values(buildDefaultChoiceSelections(occupation.name)).flat(),
    );
    expect(allDefaultSelections.some((skill) => normalizeSkillName(skill) === "mitos de cthulhu")).toBe(false);
  });
});
