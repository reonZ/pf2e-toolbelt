import { z } from "foundry-helpers";

export const zIdentifiedItem = z.object({
    itemName: z.string().trim().min(1).nullish(),
    itemSlug: z.string().trim().min(1),
    partialSlug: z.string().trim().min(1).nullish(),
});

export type IdentifiedItemSource = z.input<typeof zIdentifiedItem>;
export type IdentifiedItem = z.output<typeof zIdentifiedItem>;
