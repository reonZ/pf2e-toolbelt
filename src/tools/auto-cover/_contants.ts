const COVER_VALUES = {
    none: 0,
    lesser: 1,
    standard: 2,
    greater: 3,
    "greater-prone": 4,
} as const;

const SIZES = {
    tiny: 0,
    sm: 1,
    med: 2,
    lg: 3,
    huge: 4,
    grg: 5,
};

type CoverLevel = keyof typeof COVER_VALUES;

export { COVER_VALUES, SIZES };
export type { CoverLevel };
