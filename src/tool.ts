import {
    MODULE,
    R,
    RegisterSettingOptions,
    deleteInMemory,
    flagPath,
    getFlag,
    getFlagProperty,
    getInMemory,
    getInMemoryAndSetIfNot,
    getSetting,
    htmlElement,
    libWrapper,
    registerUpstreamHook,
    registerWrapper,
    render,
    setFlag,
    setFlagProperty,
    setInMemory,
    socketEmit,
    socketOff,
    socketOn,
    subLocalize,
    templatePath,
    unregisterWrapper,
    unsetFlag,
    updateSourceFlag,
} from "pf2e-api";
import { characterSheetWrappers } from "./tools/shared/characterSheet";
import { prepareDocumentWrappers } from "./tools/shared/prepareDocument";
import { textEditorWrappers } from "./tools/shared/textEditor";
import { chatMessageWrappers } from "./tools/shared/chatMessage";

const sharedWrappers = {
    ...characterSheetWrappers,
    ...prepareDocumentWrappers,
    ...textEditorWrappers,
    ...chatMessageWrappers,
};

function createTool<TConfig extends ToolConfig>(config: TConfig) {
    const settings = R.pipe(
        config.settings,
        R.reduce((acc, setting) => {
            Object.defineProperty(acc, setting.key, {
                get() {
                    return getSetting(setting.key);
                },
            });
            return acc;
        }, {})
    );

    const toolName = config.name;
    const toolHooks = createToolHooks(config);
    const [hook, hooks] =
        toolHooks && "activateAll" in toolHooks
            ? [undefined, toolHooks]
            : toolHooks
            ? [toolHooks, undefined]
            : [undefined, undefined];

    const toolWrappers = createToolWrappers(config);
    const [wrapper, wrappers] =
        toolWrappers && "activateAll" in toolWrappers
            ? [undefined, toolWrappers]
            : toolWrappers
            ? [toolWrappers, undefined]
            : [undefined, undefined];

    const localize = subLocalize(toolName);

    const waitDialog = async (
        template: string,
        dialogOptions: ToolWaitDialogOptions,
        applicationOptions: ApplicationRenderOptions = {}
    ) => {
        const translate = localize.sub(template);

        const data = dialogOptions.data ?? {};
        data.i18n ??= translate.i18n;

        return Dialog.wait(
            {
                title: dialogOptions.title ?? translate("title"),
                content: dialogOptions.content ?? (await render(`${toolName}/${template}`, data)),
                buttons: {
                    yes: {
                        label: translate("yes"),
                        icon: `<i class="${dialogOptions.yes ?? "fa-solid fa-check"}"></i>`,
                        callback: htmlElement,
                    },
                    no: {
                        label: translate("no"),
                        icon: `<i class="${dialogOptions.no ?? "fa-solid fa-xmark"}"></i>`,
                        callback: () => null,
                    },
                },
                render: ($html) => {
                    const html = htmlElement($html);
                    dialogOptions.onRender?.(html);
                },
                close: () => null,
            },
            {
                ...applicationOptions,
                id: translate("dialog"),
            }
        );
    };

    return {
        config,
        settings,
        hook,
        hooks,
        wrapper,
        wrappers,
        waitDialog,
        flagPath: (...path: string[]) => flagPath(toolName, ...path),
        getFlag: (doc: FoundryDocument, ...path: string[]) => getFlag(doc, toolName, ...path),
        setFlag: (doc: FoundryDocument, ...args: [...string[], unknown]) =>
            setFlag(doc, toolName, ...args),
        unsetFlag: (doc: FoundryDocument, ...path: string[]) => unsetFlag(doc, toolName, ...path),
        updateSourceFlag: (doc: FoundryDocument, ...args: [...string[], any]) =>
            updateSourceFlag(doc, toolName, ...args),
        getFlagProperty: (obj: object, ...path: string[]) =>
            getFlagProperty(obj, toolName, ...path),
        setFlagProperty: (obj: object, ...args: [...string[], any]) =>
            setFlagProperty(obj, toolName, ...args),
        getInMemory: (obj: object, ...path: string[]) => getInMemory(obj, toolName, ...path),
        setInMemory: (obj: object, ...args: [...string[], unknown]) =>
            setInMemory(obj, toolName, ...args),
        getInMemoryAndSetIfNot: (obj: object, ...args: [...string[], () => unknown | unknown]) =>
            getInMemoryAndSetIfNot(obj, toolName, ...args),
        deleteInMemory: (obj: object, ...path: string[]) => deleteInMemory(obj, toolName, ...path),
        render: (...args: Parameters<typeof render>) => {
            const data = args.at(-1) as Record<string, any>;
            data.i18n = localize.sub(args[0]).i18n;
            return render(toolName, ...args);
        },
        localize,
        templatePath: (...path: string[]) => templatePath(toolName, ...path),
        socket: createToolSocket(config),
    } as unknown as ToolObject<TConfig>;
}

function createToolWrappers(config: ToolConfig) {
    if (!Array.isArray(config.wrappers) || config.wrappers.length === 0) return;

    const wrappers: [string | undefined, ToolActivable][] = [];

    for (const { key, type, path, callback } of config.wrappers) {
        let wrapper: ToolActivable;

        if (path in sharedWrappers) {
            const wrapperId = foundry.utils.randomID();

            wrapper = {
                activate() {
                    //@ts-ignore
                    sharedWrappers[path].activate(wrapperId, callback);
                },
                disable() {
                    //@ts-ignore
                    sharedWrappers[path].disable(wrapperId);
                },
                toggle(enabled: boolean) {
                    //@ts-ignore
                    sharedWrappers[path].toggle(wrapperId, callback, enabled);
                },
            };
        } else {
            let wrapperId: number | null = null;

            const wrapped = function (this: any, ...args: any[]) {
                try {
                    return callback.call(this, ...args);
                } catch (error) {
                    MODULE.error(
                        `an error occured in the tool '${config.name}'\nwrapper: ${path}`,
                        error
                    );

                    if (type !== "OVERRIDE") {
                        const wrapFn = args.splice(0)[0] as Function;
                        return wrapFn(...args);
                    }
                }
            };

            wrapper = {
                activate() {
                    if (wrapperId === null) {
                        // @ts-ignore
                        wrapperId = registerWrapper(path, wrapped, type ?? "WRAPPER");
                    }
                },
                disable() {
                    if (wrapperId !== null) {
                        unregisterWrapper(wrapperId);
                        wrapperId = null;
                    }
                },
                toggle(enabled: boolean) {
                    if (enabled) this.activate();
                    else this.disable();
                },
            };
        }

        wrappers.push([key, wrapper]);
    }

    if (wrappers.length === 1) {
        return wrappers[0][1];
    }

    const wrappersMap = wrappers.map(([key, hook]) => hook);
    const wrappersObj = wrappers.every(
        (wrapper): wrapper is [string, ToolActivable] => !!wrapper[0]
    )
        ? R.fromPairs(wrappers)
        : {};

    return {
        ...wrappersObj,
        activateAll() {
            for (const wrapper of wrappersMap) {
                wrapper.activate();
            }
        },
        disableAll() {
            for (const wrapper of wrappersMap) {
                wrapper.disable();
            }
        },
        toggleAll(enabled: boolean) {
            for (const wrapper of wrappersMap) {
                wrapper.toggle(enabled);
            }
        },
    };
}

function createToolHooks(config: ToolConfig) {
    if (!Array.isArray(config.hooks) || config.hooks.length === 0) return;

    const hooks: [string, ToolActivable][] = [];

    for (const { event, listener, isUpstream } of config.hooks) {
        let hookId: number | null = null;

        const hook = {
            activate() {
                if (hookId !== null) return;
                hookId = isUpstream
                    ? registerUpstreamHook(event, listener)
                    : Hooks.on(event, listener);
            },
            disable() {
                if (hookId === null) return;
                Hooks.off(event, hookId);
                hookId = null;
            },
            toggle(enabled: boolean) {
                if (enabled) this.activate();
                else this.disable();
            },
        };

        hooks.push([event, hook]);
    }

    if (hooks.length === 1) return hooks[0][1];

    const hooksMap = hooks.map(([event, hook]) => hook);

    return {
        ...R.fromPairs(hooks),
        activateAll() {
            for (const hook of hooksMap) {
                hook.activate();
            }
        },
        disableAll() {
            for (const hook of hooksMap) {
                hook.disable();
            }
        },
        toggleAll(enabled: boolean) {
            for (const hook of hooksMap) {
                hook.toggle(enabled);
            }
        },
    };
}

function createToolSocket(config: ToolConfig) {
    if (typeof config.onSocket !== "function") return;

    let socketEnabled = false;

    const onSocket = (packet: { __tool__?: string }, userId: string) => {
        if (packet.__tool__ !== config.name) return;

        delete packet.__tool__;
        config.onSocket!(packet, userId);
    };

    return {
        emit(packet: object) {
            socketEmit({
                ...packet,
                __tool__: config.name,
            });
        },
        activate() {
            if (socketEnabled) return;
            socketEnabled = true;
            socketOn(onSocket);
        },
        disable() {
            if (!socketEnabled) return;
            socketEnabled = false;
            socketOff(onSocket);
        },
        toggle(enabled?: boolean) {
            if (enabled) this.activate();
            else this.disable();
        },
    };
}

type ToolConfig = {
    name: string;
    settings: RegisterSettingOptions[];
    onSocket?: SocketCallback;
    hooks?: ToolHook[];
    wrappers?: (
        | {
              key?: string;
              path: string;
              callback: libWrapper.RegisterCallback;
              type?: libWrapper.RegisterType;
          }
        | {
              key?: string;
              path: keyof typeof sharedWrappers;
              type?: never;
              callback: Parameters<
                  (typeof sharedWrappers)[keyof typeof sharedWrappers]["activate"]
              >[1];
          }
    )[];
    api?: Record<string, Function>;
    init?: (isGM: boolean) => void;
    ready?: (isGM: boolean) => void;
};

type ToolWaitDialogOptions = {
    onRender?: (html: HTMLElement) => void;
    yes?: string;
    no?: string;
    title?: string;
} & RequireOnlyOne<{
    data?: Record<string, any>;
    content?: string;
}>;

type ToolObject<TConfig extends ToolConfig> = {
    config: TConfig;
    localize: ReturnType<typeof subLocalize>;
    templatePath: typeof templatePath;
    render: typeof render;
    waitDialog: (
        template: string,
        options: ToolWaitDialogOptions,
        applicationOptions?: ApplicationRenderOptions
    ) => Promise<HTMLElement | null>;
    getFlag: typeof getFlag;
    setFlag: typeof setFlag;
    unsetFlag: typeof unsetFlag;
    flagPath: typeof flagPath;
    updateSourceFlag: typeof updateSourceFlag;
    getFlagProperty: typeof getFlagProperty;
    setFlagProperty: typeof setFlagProperty;
    getInMemory: typeof getInMemory;
    setInMemory: typeof setInMemory;
    getInMemoryAndSetIfNot: typeof getInMemoryAndSetIfNot;
    deleteInMemory: typeof deleteInMemory;
    settings: ToolSettings<TConfig>;
} & ToolSocket<TConfig> &
    ToolHooks<TConfig> &
    ToolWrappers<TConfig>;

type ToolSettings<TConfig extends ToolConfig> = TConfig["settings"] extends {
    key: infer K extends string;
}[]
    ? {
          [k in K]: Extract<TConfig["settings"][number], { key: k }> extends {
              choices: Array<infer C>;
          }
              ? Readonly<C>
              : Readonly<ReturnType<Extract<TConfig["settings"][number], { key: k }>["type"]>>;
      }
    : never;

type ToolHook = { event: string; listener: HookCallback; isUpstream?: boolean };

type ToolSocket<TConfig extends ToolConfig> = TConfig["onSocket"] extends (
    packet: infer P extends Record<string, any>,
    senderId: string
) => void
    ? {
          socket: {
              emit: (packet: P) => void;
              activate: () => void;
              disable: () => void;
              toggle: (enabled?: boolean) => void;
          };
      }
    : {};

type ToolHooks<TConfig extends ToolConfig> = TConfig["hooks"] extends [
    { event: infer E extends string }
]
    ? {
          hook: ToolActivable;
      }
    : TConfig["hooks"] extends never[]
    ? {}
    : TConfig["hooks"] extends {
          event: infer E extends string;
      }[]
    ? {
          hooks: ToolActivableAll & {
              [e in E]: ToolActivable;
          };
      }
    : {};

type ToolWrappers<TConfig extends ToolConfig> = TConfig["wrappers"] extends [{ path: string }]
    ? {
          wrapper: ToolActivable;
      }
    : TConfig["wrappers"] extends never[]
    ? {}
    : TConfig["wrappers"] extends { key: infer K extends string }[]
    ? {
          wrappers: ToolActivableAll & {
              [k in K]: ToolActivable;
          };
      }
    : TConfig["wrappers"] extends { path: string }[]
    ? {
          wrappers: ToolActivableAll;
      }
    : {};

type ToolActivable = {
    activate: () => void;
    disable: () => void;
    toggle: (enabled: boolean) => void;
};

type ToolActivableAll = {
    activateAll: () => void;
    disableAll: () => void;
    toggleAll: (enabled: boolean) => void;
};

export { createTool };
export type { ToolConfig };
