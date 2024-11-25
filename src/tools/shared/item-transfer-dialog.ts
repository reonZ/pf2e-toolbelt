import { htmlQuery, ItemTransferDialog, refreshApplicationHeight } from "module-helpers";

function updateItemTransferDialog(
    app: ItemTransferDialog,
    $html: JQuery,
    subtitle: string,
    message: string
) {
    const html = $html[0];

    const titleElement = htmlQuery(html, ":scope > header h4");
    if (titleElement) {
        titleElement.innerText = game.i18n.localize(subtitle);
    }

    const buttonElement = htmlQuery(html, "form button");
    if (buttonElement) {
        buttonElement.innerText = game.i18n.localize(subtitle);
    }

    const questionElement = htmlQuery(html, "form > label");
    if (questionElement) {
        questionElement.innerText = game.i18n.localize(message);
    }

    htmlQuery(html, "[name='newStack']")?.parentElement?.remove();

    refreshApplicationHeight(app);
}

export { updateItemTransferDialog };
