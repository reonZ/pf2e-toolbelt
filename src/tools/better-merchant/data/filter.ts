import { z, zDocumentId, zEquipmentFilter } from "foundry-helpers";

function zDefaultFilter(defaultRatio: number = 1) {
    return z.object({
        enabled: z.boolean().default(true),
        ratio: z.number().min(0).max(10).multipleOf(0.01).default(defaultRatio),
    });
}

function zBaseFilter(defaultRatio: number = 1) {
    return zDefaultFilter(defaultRatio).extend({
        id: zDocumentId(),
        name: z.string().trim().default(""),
    });
}

const zServiceDefaultFilter = zDefaultFilter();

const zServiceFilter = zBaseFilter().extend({
    level: z.number().min(0).multipleOf(1).default(0),
    tag: z.string().trim().default(""),
});

const zBuyDefaultFilter = zDefaultFilter(0.5);
const zSellDefaultFilter = zDefaultFilter();

const zItemFilter = zBaseFilter().extend({
    filter: zEquipmentFilter().prefault({}),
});

type DefaultFilterSource = z.input<ReturnType<typeof zDefaultFilter>>;
type DefaultFilterData = z.output<ReturnType<typeof zDefaultFilter>>;

type BaseFilterSource = z.input<ReturnType<typeof zBaseFilter>>;
type BaseFilterData = z.output<ReturnType<typeof zBaseFilter>>;

type ServiceFilterSource = z.input<typeof zServiceFilter>;
type ServiceFilterData = z.output<typeof zServiceFilter>;

type ItemFilterSource = z.input<typeof zItemFilter>;
type ItemFilterData = z.output<typeof zItemFilter>;

export { zBuyDefaultFilter, zDefaultFilter, zItemFilter, zSellDefaultFilter, zServiceDefaultFilter, zServiceFilter };
export type {
    BaseFilterData,
    BaseFilterSource,
    DefaultFilterData,
    DefaultFilterSource,
    ItemFilterData,
    ItemFilterSource,
    ServiceFilterData,
    ServiceFilterSource,
};
