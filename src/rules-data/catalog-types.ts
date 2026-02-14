export interface ChoiceGroup {
  count: number;
  from: string[];
  label: string;
}

export interface Occupation {
  name: string;
  tags: string[];
  credit_range: string;
  occupation_points_formula: string;
  skills: string[];
  choice_groups: ChoiceGroup[];
}

export interface ProfessionCatalog {
  version: string;
  source: string;
  interpersonal_skill_options: string[];
  occupations: Occupation[];
}

export interface StepsCatalog {
  version: string;
  steps: Array<{
    id: number;
    key: string;
    title: string;
    description: string;
  }>;
}

export interface RulesCatalog {
  version: string;
  characteristics_generation: Record<string, string>;
  age_rules: Array<{
    range: string;
    effects: string[];
    edu_improvement_rolls: number;
  }>;
  edu_improvement_rule: string;
  derived_stats: {
    COR_inicial: string;
    PM_inicial: string;
    PV: string;
    MOV: {
      base: Array<{
        condition: string;
        value: number;
      }>;
      age_penalty_by_decade: Record<string, number>;
    };
    build_and_damage_bonus: {
      by_sum_FUE_TAM: Array<{
        min: number;
        max: number;
        damage_bonus: string;
        build: number;
      }>;
      overflow_rule: string;
    };
  };
  skill_point_rules: {
    occupation_points: string;
    personal_interest_points: string;
    cannot_allocate_to: string[];
  };
  computed_fractions: {
    hard: string;
    extreme: string;
  };
}

export interface BackgroundOptionsCatalog {
  version: string;
  categories: string[];
  notes: string[];
}

export interface InvestigatorSkillsCatalog {
  version: string;
  source: string;
  skills: string[];
}
