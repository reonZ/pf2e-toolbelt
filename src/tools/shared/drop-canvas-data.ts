import { CanvasPF2e, R, registerUpstreamHook } from "module-helpers";

let hookId: number | null = null;

type ModuleName = (typeof MODULES)[number];
type DropCanvasDataListener = (canvas: CanvasPF2e, data: DropCanvasData) => boolean;

const MODULES = ["droppeth", "giveth"] as const;

const listeners: Record<ModuleName, { active: boolean; listener: DropCanvasDataListener | null }> =
    R.mapToObj(MODULES, (name) => [name, { listener: null, active: false }]);

const dropCanvasDataHook = {
    register(id: ModuleName, listener: DropCanvasDataListener) {
        listeners[id].listener = listener;
    },
    activate(id: ModuleName) {
        listeners[id].active = true;
        if (hookId !== null) return;
        hookId = registerUpstreamHook("dropCanvasData", onDropCanvasData);
    },
    disable(id: ModuleName) {
        listeners[id].active = false;
        if (hookId === null || R.values(listeners).some(({ active }) => active)) return;
        Hooks.off("dropCanvasData", hookId);
        hookId = null;
    },
    toggle(id: ModuleName, enabled: boolean) {
        if (enabled) this.activate(id);
        else this.disable(id);
    },
};

function onDropCanvasData(_canvas: CanvasPF2e, data: DropCanvasData) {
    if (data.type !== "Item") return true;

    for (const id of MODULES) {
        const listener = listeners[id].listener;
        if (listener && !listener(canvas, data)) {
            return false;
        }
    }

    return true;
}

export { dropCanvasDataHook };
