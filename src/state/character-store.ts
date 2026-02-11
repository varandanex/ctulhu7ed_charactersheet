"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
  CharacterCompanion,
  CharacterDraft,
  CharacteristicKey,
  CharacterIdentity,
  OccupationSelection,
} from "@/domain/types";
import { applyAgeModifiers, rollCharacteristics } from "@/domain/rules";

const emptyDraft: CharacterDraft = {
  mode: "random",
  age: 25,
  lastRolledAge: undefined,
  era: "clasica",
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
  setMode: (mode: CharacterDraft["mode"]) => void;
  setAge: (age: number) => void;
  setEra: (era: string) => void;
  rollAllCharacteristics: () => void;
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
      setMode: (mode) => set((state) => ({ draft: { ...state.draft, mode } })),
      setAge: (age) => set((state) => ({ draft: { ...state.draft, age } })),
      setEra: (era) => set((state) => ({ draft: { ...state.draft, era } })),
      rollAllCharacteristics: () =>
        set((state) => ({
          draft: {
            ...state.draft,
            lastRolledAge: state.draft.age,
            characteristics: applyAgeModifiers(rollCharacteristics(), state.draft.age),
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
    },
  ),
);
