import { CreaturePF2e, z, zForeignDocument } from "foundry-helpers";
import { shareDataTool } from ".";

const BASE_SHARE_DATA = ["health", "languages", "timeEvents"] as const;
const CHARACTER_MASTER_SHARE_DATA = ["armorRunes"] as const;
const CHARACTER_SHARE_DATA = ["heroPoints", "skills", "spellcasting", "weaponRunes"] as const;
const ALL_SHARE_DATA = [...BASE_SHARE_DATA, ...CHARACTER_MASTER_SHARE_DATA, ...CHARACTER_SHARE_DATA] as const;

const isValidMaster = shareDataTool.isValidMaster.bind(shareDataTool);

const zShareMaster = zForeignDocument<"Actor", CreaturePF2e>("Actor", isValidMaster).catch(null);

const zShareData = z
    .object({
        armorRunes: z.boolean().catch(false),
        health: z.boolean().catch(false),
        heroPoints: z.boolean().catch(false),
        languages: z.boolean().catch(false),
        master: zShareMaster,
        skills: z.boolean().catch(false),
        spellcasting: z.boolean().catch(false),
        timeEvents: z.boolean().catch(false),
        weaponRunes: z.boolean().catch(false),
    })
    .transform((data) => {
        const disableOptions = (options: ReadonlyArray<ShareDataType>) => {
            for (const option of options) {
                data[option] = false;
            }
        };

        if (!data.master) {
            disableOptions(ALL_SHARE_DATA);
        } else if (data.master.isOfType("npc")) {
            disableOptions([...CHARACTER_SHARE_DATA, ...CHARACTER_MASTER_SHARE_DATA]);
        }

        return data;
    });

type ShareDataType = (typeof ALL_SHARE_DATA)[number];

type ShareDataSource = Partial<z.input<typeof zShareData>>;
type ShareData = z.output<typeof zShareData>;

export { ALL_SHARE_DATA, BASE_SHARE_DATA, CHARACTER_MASTER_SHARE_DATA, CHARACTER_SHARE_DATA, zShareData, zShareMaster };
export type { ShareData, ShareDataSource, ShareDataType };
