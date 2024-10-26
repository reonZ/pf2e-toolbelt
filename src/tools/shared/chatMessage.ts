import { createSharedWrapper } from "./sharedWrapper";

const CHATMESSAGE_GET_HTML = "ChatMessage.prototype.getHTML";

const chatMessageWrappers = {
    [CHATMESSAGE_GET_HTML]: createSharedWrapper(CHATMESSAGE_GET_HTML, chatMessageGetHTML),
};

async function chatMessageGetHTML(
    this: ChatMessagePF2e,
    wrapperError: (error: Error) => void,
    listeners: ((html: HTMLElement) => Promisable<void>)[],
    wrapped: libWrapper.RegisterCallback
): Promise<JQuery> {
    const $html = await wrapped();

    const html = $html[0];

    try {
        for (const listener of listeners) {
            await listener.call(this, html);
        }
    } catch (error) {
        wrapperError(error);
    }

    return $html;
}

export { CHATMESSAGE_GET_HTML, chatMessageWrappers };
