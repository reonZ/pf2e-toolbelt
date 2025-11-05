const BASE_SHARE_DATA = ["health", "languages", "timeEvents"] as const;

const CHARACTER_MASTER_SHARE_DATA = ["armorRunes"] as const;

const CHARACTER_SHARE_DATA = ["heroPoints", "skills", "spellcasting", "weaponRunes"] as const;

const ALL_SHARE_DATA = [
    ...BASE_SHARE_DATA,
    ...CHARACTER_MASTER_SHARE_DATA,
    ...CHARACTER_SHARE_DATA,
] as const;

type ShareDataType = (typeof ALL_SHARE_DATA)[number];

export { ALL_SHARE_DATA, BASE_SHARE_DATA, CHARACTER_SHARE_DATA, CHARACTER_MASTER_SHARE_DATA };
export type { ShareDataType };
