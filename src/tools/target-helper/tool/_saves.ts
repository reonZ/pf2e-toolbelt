import { RerollType } from "..";

const REROLLS: Record<RerollType, RerollDetails> = {
    hero: {
        icon: "fa-solid fa-hospital-symbol",
        reroll: "PF2E.RerollMenu.HeroPoint",
        rerolled: "PF2E.RerollMenu.MessageHeroPoints",
    },
    mythic: {
        icon: "fa-solid fa-circle-m",
        reroll: "PF2E.RerollMenu.MythicPoint",
        rerolled: "PF2E.RerollMenu.MessageMythicPoints",
    },
    new: {
        icon: "fa-solid fa-dice",
        reroll: "PF2E.RerollMenu.KeepNew",
        rerolled: "PF2E.RerollMenu.MessageKeep.new",
    },
    lower: {
        icon: "fa-solid fa-dice-one",
        reroll: "PF2E.RerollMenu.KeepLower",
        rerolled: "PF2E.RerollMenu.MessageKeep.lower",
    },
    higher: {
        icon: "fa-solid fa-dice-six",
        reroll: "PF2E.RerollMenu.KeepHigher",
        rerolled: "PF2E.RerollMenu.MessageKeep.higher",
    },
};

type RerollDetails = {
    icon: string;
    reroll: string;
    rerolled: string;
};

export { REROLLS };
export type { RerollDetails };
