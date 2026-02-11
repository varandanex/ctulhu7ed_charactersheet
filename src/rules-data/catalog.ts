import stepsJson from "../../data/creacion-personaje/pasos.json";
import rulesJson from "../../data/creacion-personaje/reglas.json";
import professionsJson from "../../data/creacion-personaje/profesiones.json";
import backgroundJson from "../../data/creacion-personaje/opciones-trasfondo.json";
import investigatorSkillsJson from "../../data/creacion-personaje/habilidades-investigador.json";
import {
  backgroundOptionsSchema,
  investigatorSkillsCatalogSchema,
  professionCatalogSchema,
  rulesCatalogSchema,
  stepsCatalogSchema,
} from "@/rules-data/schema";

export const stepsCatalog = stepsCatalogSchema.parse(stepsJson);
export const rulesCatalog = rulesCatalogSchema.parse(rulesJson);
export const professionCatalog = professionCatalogSchema.parse(professionsJson);
export const backgroundOptionsCatalog = backgroundOptionsSchema.parse(backgroundJson);
export const investigatorSkillsCatalog = investigatorSkillsCatalogSchema.parse(investigatorSkillsJson);
