import { getWorldTime, localize, R, z, zDocumentId } from "foundry-helpers";

const zTrackedResourceData = z.object({
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
});

const zTrackedResource = zTrackedResourceData.transform((resource) => {
    resource.max = Math.max(resource.max, resource.min + 2);
    resource.value = Math.clamp(resource.value, resource.min, resource.max);

    Object.defineProperties(resource, {
        decrease: {
            get() {
                return this.tooltip("decrease");
            },
        },
        increase: {
            get() {
                return this.tooltip("increase");
            },
        },
        isTimeout: {
            get() {
                return this.timeout > 0 && this.value > this.min;
            },
        },
        label: {
            get() {
                return this.name || this.id;
            },
        },
        localize: {
            value: localize.sub("resourceTracker.resource"),
        },
        ratio: {
            get() {
                return (this.value - this.min) / (this.max - this.min);
            },
        },
        tooltip: {
            value(direction: "increase" | "decrease") {
                const steps = R.pipe(
                    ["step1", ...(["step2", "step3"] as const).filter((step) => this[step] !== this.step1)] as const,
                    R.map((step) => {
                        const value = this[step];
                        const click = this.localize("steps", step);
                        return this.localize(direction, { click, value });
                    }),
                );

                steps.unshift(this.localize("edit"));

                return steps.join("<br>");
            },
        },
    });

    return resource as TrackedResource;
});

type TrackedResource = TrackedResourceData & {
    get decrease(): string;
    get increase(): string;
    get isTimeout(): boolean;
    get label(): string;
    get ratio(): number;
};

type TrackedResourceSource = z.input<typeof zTrackedResourceData>;
type TrackedResourceData = z.output<typeof zTrackedResourceData>;

export { zTrackedResource };
export type { TrackedResourceSource, TrackedResource };
