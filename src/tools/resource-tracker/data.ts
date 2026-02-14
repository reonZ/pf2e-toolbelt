import { getWorldTime, z, zDocumentId } from "foundry-helpers";

const zTrackedResource = z
    .object({
        id: zDocumentId(),
        max: z.number().default(100),
        min: z.number().default(0),
        name: z.string().trim().default(""),
        shared: z.boolean().default(false),
        step1: z.number().min(1).default(1),
        step2: z.number().min(1).default(1),
        step3: z.number().min(1).default(1),
        time: z.number().default(getWorldTime),
        timeout: z.number().min(0).default(0),
        value: z.number().default(100),
    })
    .transform((resource) => {
        resource.max = Math.max(resource.max, resource.min + 2);
        resource.value = Math.clamp(resource.value, resource.min, resource.max);
        return resource;
    });

type TrackedResourceSource = z.input<typeof zTrackedResource>;
type TrackedResource = z.output<typeof zTrackedResource>;

export { zTrackedResource };
export type { TrackedResource, TrackedResourceSource };
