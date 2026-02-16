"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
  AgePenaltyAllocation,
  CharacterCompanion,
  CharacterDraft,
  CharacteristicKey,
  Characteristics,
  CharacterIdentity,
  OccupationSelection,
} from "@/domain/types";
import { applyAgeModifiers, rollCharacteristics } from "@/domain/rules";

const defaultAgePenaltyAllocation: AgePenaltyAllocation = {
  youthFuePenalty: 2,
  youthTamPenalty: 3,
  matureFuePenalty: 1,
  matureConPenalty: 1,
  matureDesPenalty: 3,
};
const characteristicKeys: CharacteristicKey[] = ["FUE", "CON", "TAM", "DES", "APA", "INT", "POD", "EDU", "SUERTE"];

function normalizeCharacteristicValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function normalizeEra(era: string | undefined): string {
  if (era === "clasica" || era === "actual") return era;
  return "clasica";
}

const emptyDraft: CharacterDraft = {
  mode: "random",
  age: 25,
  lastRolledAge: undefined,
  guardianRerollRequests: 0,
  era: "clasica",
  agePenaltyAllocation: defaultAgePenaltyAllocation,
  characteristics: {},
  occupation: undefined,
  skills: {
    occupation: {},
    personal: {},
  },
  background: {
    descripcionPersonal: "",
    ideologiaCreencias: "",
    allegados: "",
    lugaresSignificativos: "",
    posesionesPreciadas: "",
    rasgos: "",
    vinculoPrincipal: "",
  },
  identity: {
    nombre: "",
    genero: "",
    residenciaActual: "",
    lugarNacimiento: "",
    retratoUrl: "",
  },
  companions: [],
  equipment: {
    spendingLevel: "",
    cash: "",
    assets: "",
    items: [],
    notes: "",
  },
};

interface CharacterStore {
  draft: CharacterDraft;
  setAge: (age: number) => void;
  setEra: (era: string) => void;
  setAgePenaltyAllocation: (allocation: Partial<AgePenaltyAllocation>) => void;
  rollAllCharacteristics: () => void;
  setLastRolledAge: (age: number | undefined) => void;
  incrementGuardianRerollRequests: () => void;
  resetGuardianRerollRequests: () => void;
  clearCharacteristics: () => void;
  setCharacteristics: (characteristics: Partial<Characteristics>) => void;
  setCharacteristic: (key: CharacteristicKey, value: number) => void;
  setOccupation: (occupation: OccupationSelection) => void;
  setSkill: (bucket: "occupation" | "personal", skill: string, points: number) => void;
  setBackgroundField: (field: keyof CharacterDraft["background"], value: string) => void;
  setIdentityField: (field: keyof CharacterIdentity, value: string) => void;
  setCompanion: (index: number, companion: CharacterCompanion) => void;
  removeCompanion: (index: number) => void;
  setEquipmentField: (field: "spendingLevel" | "cash" | "assets", value: string) => void;
  setEquipmentNotes: (notes: string) => void;
  reset: () => void;
}

export const useCharacterStore = create<CharacterStore>()(
  persist(
    (set) => ({
      draft: emptyDraft,
      setAge: (age) => set((state) => ({ draft: { ...state.draft, age } })),
      setEra: (era) => set((state) => ({ draft: { ...state.draft, era: normalizeEra(era) } })),
      setAgePenaltyAllocation: (allocation) =>
        set((state) => ({
          draft: {
            ...state.draft,
            agePenaltyAllocation: {
              ...defaultAgePenaltyAllocation,
              ...state.draft.agePenaltyAllocation,
              ...allocation,
            },
          },
        })),
      rollAllCharacteristics: () =>
        set((state) => ({
          draft: {
            ...state.draft,
            lastRolledAge: state.draft.age,
            characteristics: applyAgeModifiers(
              rollCharacteristics(),
              state.draft.age,
              state.draft.agePenaltyAllocation,
            ),
          },
        })),
      setLastRolledAge: (age) =>
        set((state) => ({
          draft: {
            ...state.draft,
            lastRolledAge: age,
          },
        })),
      incrementGuardianRerollRequests: () =>
        set((state) => ({
          draft: {
            ...state.draft,
            guardianRerollRequests: (state.draft.guardianRerollRequests ?? 0) + 1,
          },
        })),
      resetGuardianRerollRequests: () =>
        set((state) => ({
          draft: {
            ...state.draft,
            guardianRerollRequests: 0,
          },
        })),
      clearCharacteristics: () =>
        set((state) => ({
          draft: {
            ...state.draft,
            lastRolledAge: undefined,
            guardianRerollRequests: 0,
            characteristics: {},
          },
        })),
      setCharacteristics: (characteristics) =>
        set((state) => ({
          draft: {
            ...state.draft,
            characteristics: {
              ...state.draft.characteristics,
              ...characteristics,
            },
          },
        })),
      setCharacteristic: (key, value) =>
        set((state) => ({
          draft: {
            ...state.draft,
            characteristics: {
              ...state.draft.characteristics,
              [key]: value,
            },
          },
        })),
      setOccupation: (occupation) => set((state) => ({ draft: { ...state.draft, occupation } })),
      setSkill: (bucket, skill, points) =>
        set((state) => ({
          draft: {
            ...state.draft,
            skills: {
              ...state.draft.skills,
              [bucket]: {
                ...state.draft.skills[bucket],
                [skill]: points,
              },
            },
          },
        })),
      setBackgroundField: (field, value) =>
        set((state) => ({ draft: { ...state.draft, background: { ...state.draft.background, [field]: value } } })),
      setIdentityField: (field, value) =>
        set((state) => ({ draft: { ...state.draft, identity: { ...state.draft.identity, [field]: value } } })),
      setCompanion: (index, companion) =>
        set((state) => {
          const companions = [...state.draft.companions];
          companions[index] = companion;
          return { draft: { ...state.draft, companions } };
        }),
      removeCompanion: (index) =>
        set((state) => ({
          draft: {
            ...state.draft,
            companions: state.draft.companions.filter((_, idx) => idx !== index),
          },
        })),
      setEquipmentField: (field, value) =>
        set((state) => ({ draft: { ...state.draft, equipment: { ...state.draft.equipment, [field]: value } } })),
      setEquipmentNotes: (notes) =>
        set((state) => ({ draft: { ...state.draft, equipment: { ...state.draft.equipment, notes } } })),
      reset: () => set({ draft: emptyDraft }),
    }),
    {
      name: "coc7-character-draft",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ draft: state.draft }),
      merge: (persistedState, currentState) => {
        const state = (persistedState as Partial<CharacterStore> | undefined) ?? {};
        const persistedDraft = state.draft;

        return {
          ...currentState,
          ...state,
          draft: {
            ...emptyDraft,
            ...persistedDraft,
            mode: "random",
            era: normalizeEra(persistedDraft?.era),
            agePenaltyAllocation: {
              ...defaultAgePenaltyAllocation,
              ...persistedDraft?.agePenaltyAllocation,
            },
            characteristics: {
              ...characteristicKeys.reduce(
                (acc, key) => {
                  const normalized = normalizeCharacteristicValue(persistedDraft?.characteristics?.[key]);
                  if (typeof normalized === "number") {
                    acc[key] = normalized;
                  }
                  return acc;
                },
                {} as CharacterDraft["characteristics"],
              ),
            },
            skills: {
              occupation: {
                ...emptyDraft.skills.occupation,
                ...persistedDraft?.skills?.occupation,
              },
              personal: {
                ...emptyDraft.skills.personal,
                ...persistedDraft?.skills?.personal,
              },
            },
            background: {
              ...emptyDraft.background,
              ...persistedDraft?.background,
            },
            identity: {
              ...emptyDraft.identity,
              ...persistedDraft?.identity,
            },
            companions: persistedDraft?.companions ?? emptyDraft.companions,
            equipment: {
              ...emptyDraft.equipment,
              ...persistedDraft?.equipment,
            },
          },
        };
      },
    },
  ),
);
