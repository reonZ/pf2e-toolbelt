import { ModuleTool } from "tool";

class ArpTool extends ModuleTool<Settings> {
    get key(): "arp" {
        return "arp";
    }

    get settings() {
        return [
            {
                key: "enabled",
                type: Boolean,
                default: false,
                scope: "world",
                requiresReload: true,
            },
            {
                key: "force",
                type: Boolean,
                default: true,
                scope: "world",
                requiresReload: true,
            },
        ] as const;
    }
}

type Settings = {
    enabled: boolean;
    force: boolean;
};

export { ArpTool };
