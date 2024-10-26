import { createSharedWrapper } from "./sharedWrapper";

const TEXTEDITOR_ENRICH_HTML = "TextEditor.enrichHTML";

const textEditorWrappers = {
    [TEXTEDITOR_ENRICH_HTML]: createSharedWrapper(TEXTEDITOR_ENRICH_HTML, textEditorEnrichHTML),
};

async function textEditorEnrichHTML(
    this: TextEditor,
    wrapperError: (error: Error) => void,
    listeners: ((enriched: string) => string)[],
    wrapped: libWrapper.RegisterCallback,
    content: string,
    options?: EnrichmentOptions
): Promise<string> {
    let enriched = (await wrapped(content, options)) as string;

    try {
        for (const listener of listeners) {
            enriched = listener.call(this, enriched);
        }
    } catch (error) {
        wrapperError(error);
    }

    return enriched;
}

export { TEXTEDITOR_ENRICH_HTML, textEditorWrappers };
