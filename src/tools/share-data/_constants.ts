const BASE_SHARE_DATA = ["timeEvents"] as const;

const CHARACTER_MASTER_SHARE_DATA = ["armorRunes"] as const;

const CHARACTER_SHARE_DATA = ["skills", "spellcasting", "weaponRunes"] as const;

const ALL_SHARE_DATA = [
    ...BASE_SHARE_DATA,
    ...CHARACTER_MASTER_SHARE_DATA,
    ...CHARACTER_SHARE_DATA,
] as const;

const AUTO_SHARE = [
    { name: "health", character: false },
    { name: "heroPoints", character: "both" },
] as const;

type AutoDataType = (typeof AUTO_SHARE)[number]["name"];
type ShareDataType = (typeof ALL_SHARE_DATA)[number];

export {
    ALL_SHARE_DATA,
    AUTO_SHARE,
    BASE_SHARE_DATA,
    CHARACTER_SHARE_DATA,
    CHARACTER_MASTER_SHARE_DATA,
};
export type { AutoDataType, ShareDataType };
