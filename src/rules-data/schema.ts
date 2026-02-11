import { z } from "zod";

export const choiceGroupSchema = z.object({
  count: z.number(),
  from: z.array(z.string()),
  label: z.string(),
});

export const occupationSchema = z.object({
  name: z.string(),
  tags: z.array(z.string()),
  credit_range: z.string(),
  occupation_points_formula: z.string(),
  skills: z.array(z.string()),
  choice_groups: z.array(choiceGroupSchema),
});

export const professionCatalogSchema = z.object({
  version: z.string(),
  source: z.string(),
  interpersonal_skill_options: z.array(z.string()),
  occupations: z.array(occupationSchema),
});

export const stepsCatalogSchema = z.object({
  version: z.string(),
  steps: z.array(
    z.object({
      id: z.number(),
      key: z.string(),
      title: z.string(),
      description: z.string(),
    }),
  ),
});

export const rulesCatalogSchema = z.object({
  version: z.string(),
  characteristics_generation: z.record(z.string()),
  age_rules: z.array(
    z.object({
      range: z.string(),
      effects: z.array(z.string()),
      edu_improvement_rolls: z.number(),
    }),
  ),
  edu_improvement_rule: z.string(),
  derived_stats: z.object({
    COR_inicial: z.string(),
    PM_inicial: z.string(),
    PV: z.string(),
    MOV: z.object({
      base: z.array(
        z.object({
          condition: z.string(),
          value: z.number(),
        }),
      ),
      age_penalty_by_decade: z.record(z.number()),
    }),
    build_and_damage_bonus: z.object({
      by_sum_FUE_TAM: z.array(
        z.object({
          min: z.number(),
          max: z.number(),
          damage_bonus: z.string(),
          build: z.number(),
        }),
      ),
      overflow_rule: z.string(),
    }),
  }),
  skill_point_rules: z.object({
    occupation_points: z.string(),
    personal_interest_points: z.string(),
    cannot_allocate_to: z.array(z.string()),
  }),
  computed_fractions: z.object({
    hard: z.string(),
    extreme: z.string(),
  }),
});

export const backgroundOptionsSchema = z.object({
  version: z.string(),
  categories: z.array(z.string()),
  notes: z.array(z.string()),
});

export const investigatorSkillsCatalogSchema = z.object({
  version: z.string(),
  source: z.string(),
  skills: z.array(z.string()),
});

export type RulesCatalog = z.infer<typeof rulesCatalogSchema>;
export type StepsCatalog = z.infer<typeof stepsCatalogSchema>;
export type ProfessionCatalog = z.infer<typeof professionCatalogSchema>;
export type BackgroundOptionsCatalog = z.infer<typeof backgroundOptionsSchema>;
export type InvestigatorSkillsCatalog = z.infer<typeof investigatorSkillsCatalogSchema>;
