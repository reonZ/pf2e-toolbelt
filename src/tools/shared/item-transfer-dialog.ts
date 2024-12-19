import { htmlQuery, ItemTransferDialog, refreshApplicationHeight } from "module-helpers";

function updateItemTransferDialog(
    app: ItemTransferDialog,
    $html: JQuery,
    title: string,
    prompt: string,
    noStack?: boolean
) {
    const html = $html[0];

    const titleElement = htmlQuery(html, ":scope > header h4");
    if (titleElement) {
        titleElement.innerText = game.i18n.localize(title);
    }

    const buttonElement = htmlQuery(html, "form button");
    if (buttonElement) {
        buttonElement.innerText = game.i18n.localize(title);
    }

    const questionElement = htmlQuery(html, "form > label");
    if (questionElement) {
        questionElement.innerText = game.i18n.localize(prompt);
    }

    if (noStack) {
        const input = htmlQuery(html, "[name='newStack']");

        if (input) {
            input.previousElementSibling?.remove();
            input.remove();
        }
    }

    refreshApplicationHeight(app);
}

export { updateItemTransferDialog };
