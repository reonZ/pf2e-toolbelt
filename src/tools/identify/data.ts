import { z } from "foundry-helpers";

export const zIdentifiedItem = z.object({
    itemName: z.string().nonempty().nullish(),
    itemSlug: z.string().nonempty(),
    partialSlug: z.string().nonempty().nullish(),
});

export type IdentifiedItemSource = z.input<typeof zIdentifiedItem>;
export type IdentifiedItem = z.output<typeof zIdentifiedItem>;
