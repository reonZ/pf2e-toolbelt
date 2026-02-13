import { z, zDocumentUUID } from "foundry-helpers";

const zHeroAction = z.object({
    name: z.string().trim().min(1),
    uuid: zDocumentUUID(),
});

type HeroAction = z.output<typeof zHeroAction>;

export { zHeroAction };
export type { HeroAction };
