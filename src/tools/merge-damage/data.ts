import { ChatMessageSourcePF2e, z } from "foundry-helpers";
import { DEGREE_OF_SUCCESS_STRINGS } from "foundry-helpers/dist";

const zMergeData = z.object({
    modifiers: z.string().default(""),
    name: z.string().trim().min(1).default("unknown"),
    notes: z.array(z.string()).default(() => []),
    options: z.array(z.string()).default(() => []),
    outcome: z.enum(DEGREE_OF_SUCCESS_STRINGS).nullish(),
    source: z.looseObject({}),
    tags: z.string().default(""),
});

type MergeDataSource = Omit<z.input<typeof zMergeData>, "source"> & {
    source?: DeepPartial<ChatMessageSourcePF2e>;
};
type MergeData = Omit<z.output<typeof zMergeData>, "source"> & {
    source: DeepPartial<ChatMessageSourcePF2e>;
};

export { zMergeData };
export type { MergeData, MergeDataSource };
