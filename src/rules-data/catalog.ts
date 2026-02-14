import stepsJson from "../../data/creacion-personaje/pasos.json";
import rulesJson from "../../data/creacion-personaje/reglas.json";
import professionsJson from "../../data/creacion-personaje/profesiones.json";
import backgroundJson from "../../data/creacion-personaje/opciones-trasfondo.json";
import investigatorSkillsJson from "../../data/creacion-personaje/habilidades-investigador.json";
import {
  type BackgroundOptionsCatalog,
  type InvestigatorSkillsCatalog,
  type ProfessionCatalog,
  type RulesCatalog,
  type StepsCatalog,
} from "@/rules-data/catalog-types";

export const stepsCatalog = stepsJson as StepsCatalog;
export const rulesCatalog = rulesJson as RulesCatalog;
export const professionCatalog = professionsJson as ProfessionCatalog;
export const backgroundOptionsCatalog = backgroundJson as BackgroundOptionsCatalog;
export const investigatorSkillsCatalog = investigatorSkillsJson as InvestigatorSkillsCatalog;
