import { z, zForeignDocument } from "foundry-helpers";
import { CreaturePF2e } from "foundry-pf2e";
import { shareDataTool } from ".";

export const BASE_SHARE_DATA = ["health", "languages", "timeEvents"] as const;
export const CHARACTER_MASTER_SHARE_DATA = ["armorRunes"] as const;
export const CHARACTER_SHARE_DATA = ["heroPoints", "skills", "spellcasting", "weaponRunes"] as const;
export const ALL_SHARE_DATA = [...BASE_SHARE_DATA, ...CHARACTER_MASTER_SHARE_DATA, ...CHARACTER_SHARE_DATA] as const;

const isValidMaster = shareDataTool.isValidMaster.bind(shareDataTool);

export const zShareMaster = zForeignDocument<"Actor", CreaturePF2e>("Actor", isValidMaster).catch(null);

export const zShareData = z
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

export type ShareDataType = (typeof ALL_SHARE_DATA)[number];

export type ShareDataSource = Partial<z.input<typeof zShareData>>;
export type ShareData = z.output<typeof zShareData>;
