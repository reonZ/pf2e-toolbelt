import { Coins, z, zDocumentId, zDocumentUUID, zFilePath } from "foundry-helpers";

const COINS = ["pp", "gp", "sp", "cp", "credits", "upb"] as const;

const DEFAULT_SERVICE_ICON = "icons/commodities/currency/coins-plain-stack-gold.webp";

const zRawCoins = z.partialRecord(z.enum(COINS), z.number().min(0).multipleOf(1).default(0)).catch({});

const zCoins = z.codec(
    zRawCoins,
    z.custom<Coins>((value) => {
        return value instanceof game.pf2e.Coins;
    }),
    {
        decode: (raw) => {
            return new game.pf2e.Coins(raw);
        },
        encode: (coins) => {
            return coins.toObject() as any;
        },
    },
);

const zService = z.object({
    description: z.string().trim().default(""),
    enabled: z.boolean().default(true),
    id: zDocumentId(),
    img: zFilePath(["IMAGE"]).nullish().default(DEFAULT_SERVICE_ICON),
    level: z.number().min(0).multipleOf(1).default(0),
    macroUUID: zDocumentUUID("Macro").nullish().default(null),
    name: z.string().trim().default(""),
    price: zCoins.prefault({}),
    quantity: z.number().min(-1).multipleOf(1).default(-1),
    tags: z.array(z.string().trim().min(1)).default([]),
});

function exportService(service: ServiceData): Omit<ServiceSource, "id" | "enabled"> {
    const data = zService.encode(service);

    delete data.id;
    delete data.enabled;

    return data;
}

type ServiceSource = z.input<typeof zService>;
type ServiceData = z.output<typeof zService>;

export { exportService, zService, DEFAULT_SERVICE_ICON };
export type { ServiceData, ServiceSource };
