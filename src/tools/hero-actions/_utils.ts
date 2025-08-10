import { htmlClosest } from "module-helpers";

async function openDescriptionFromElement(el: HTMLElement) {
    const uuid = htmlClosest(el, ".action")?.dataset.uuid;
    if (!uuid) return;

    const entry = await fromUuid<JournalEntry | JournalEntryPage<JournalEntry>>(uuid);

    if (entry instanceof JournalEntryPage) {
        entry.parent.sheet?.render(true, { pageId: entry.id });
    } else {
        entry?.sheet?.render(true);
    }
}

export { openDescriptionFromElement };
