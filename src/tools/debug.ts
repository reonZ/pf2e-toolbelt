import { addListener } from "module-helpers";
import { createTool } from "../tool";

const { config, settings, hooks } = createTool({
    name: "debug",
    settings: [
        {
            key: "enabled",
            type: Boolean,
            default: false,
            config: false,
            scope: "client",
            onChange: (value) => {
                hooks.toggleAll(value);
            },
        },
    ],
    hooks: [
        {
            event: "renderApplication",
            listener: onRender,
        },
        {
            event: "renderActorSheet",
            listener: onRender,
        },
        {
            event: "renderItemSheet",
            listener: onRender,
        },
    ],
    init: () => {
        hooks.toggleAll(settings.enabled);
    },
} as const);

function onRender(app: FormApplication<ClientDocument & { type: string }>, $html: JQuery) {
    const html = $html[0];

    addListener(html, ".document-id-link", (event) => {
        if (!event.shiftKey) return;

        const obj = app.object;
        if (!obj) return;

        event.preventDefault();
        event.stopPropagation();

        const type = obj.type ?? obj.documentName.toLowerCase();

        let i = 2;
        let variable = type;

        // @ts-ignore
        while (window[variable]) {
            variable = `${type}${i++}`;
        }

        // @ts-ignore
        window[variable] = obj;
        console.log(variable, obj);
    });
}

export { config as debugTool };
