import { htmlElement, libWrapper } from "pf2e-api";
import { createSharedWrapper } from "./sharedWrapper";

const CHATMESSAGE_GET_HTML = "ChatMessage.prototype.getHTML";

const chatMessageWrappers = {
    [CHATMESSAGE_GET_HTML]: createSharedWrapper(CHATMESSAGE_GET_HTML, chatMessageGetHTML),
};

async function chatMessageGetHTML(
    this: ChatMessagePF2e,
    listeners: ((html: HTMLElement) => Promisable<void>)[],
    wrapped: libWrapper.RegisterCallback
): Promise<JQuery> {
    const $html = await wrapped();

    const html = htmlElement($html);

    for (const listener of listeners) {
        await listener.call(this, html);
    }

    return $html;
}

export { CHATMESSAGE_GET_HTML, chatMessageWrappers };
