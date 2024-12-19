import { createTool } from "./tool";

const { config, settings } = createTool({
    name: "global",
    settings: [
        {
            key: "withContent",
            type: Boolean,
            default: false,
            onChange: (value: boolean) => {},
        },
    ],
} as const);

export { config as GlobalTool, settings as globalSettings };
