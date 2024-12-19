import { R, registerWrapper, unregisterWrapper, wrapperError } from "module-helpers";

function createSharedWrapper<TListener extends (...args: any[]) => any>(
    path: string,
    callback: (
        wrapperError: (error: Error) => void,
        listeners: TListener[],
        wrapped: libWrapper.RegisterCallback,
        ...args: any[]
    ) => any,
    type: Exclude<libWrapper.RegisterType, "OVERRIDE"> = "WRAPPER"
) {
    let wrapperId: number | null = null;
    const listeners: Record<string, { listener: TListener; priority: number }> = {};

    const wrapper = function (this: any, wrapped: libWrapper.RegisterCallback, ...args: any[]) {
        return callback.call(
            this,
            (error) => wrapperError(path, error),
            R.pipe(
                Object.values(listeners),
                R.sortBy([R.prop("priority"), "desc"]),
                R.map((x) => x.listener)
            ),
            wrapped,
            ...args
        );
    };

    return {
        activate(id: string, listener: TListener, priority: number = 0) {
            if (!(id in listeners)) {
                listeners[id] = { listener, priority };
            }
            if (wrapperId === null) {
                wrapperId = registerWrapper(path, wrapper, type);
            }
        },
        disable(id: string) {
            if (id in listeners) {
                delete listeners[id];
            }
            if (wrapperId !== null && foundry.utils.isEmpty(listeners)) {
                unregisterWrapper(wrapperId);
                wrapperId = null;
            }
        },
        toggle(id: string, listener: TListener, enabled: boolean, priority?: number) {
            if (enabled) this.activate(id, listener, priority);
            else this.disable(id);
        },
    };
}

export { createSharedWrapper };
