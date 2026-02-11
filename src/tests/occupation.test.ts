import { describe, expect, it } from "vitest";
import { expandSkillEntry, isAllowedOccupationSkill } from "@/domain/occupation";
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
});
