import { libWrapper } from "pf2e-api";
import { createSharedWrapper } from "./sharedWrapper";

const TEXTEDITOR_ENRICH_HTML = "TextEditor.enrichHTML";

const textEditorWrappers = {
    [TEXTEDITOR_ENRICH_HTML]: createSharedWrapper(TEXTEDITOR_ENRICH_HTML, textEditorEnrichHTML),
};

function textEditorEnrichHTML(
    this: TextEditor,
    listeners: ((enriched: string) => string)[],
    wrapped: libWrapper.RegisterCallback,
    content: string,
    options?: EnrichmentOptions
): Promisable<string> {
    let enriched = wrapped(content, options) as string | Promise<string>;

    if (typeof enriched === "string") {
        for (const listener of listeners) {
            enriched = listener.call(this, enriched);
        }
        return enriched;
    }

    return Promise.resolve().then(async () => {
        enriched = await enriched;
        for (const listener of listeners) {
            enriched = listener.call(this, enriched);
        }
        return enriched;
    });
}

export { TEXTEDITOR_ENRICH_HTML, textEditorWrappers };
