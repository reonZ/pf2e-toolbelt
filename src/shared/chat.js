import { getFlag, updateSourceFlag } from "./flags";

export function getChatMessageClass() {
	return CONFIG.ChatMessage.documentClass;
}

export function* latestChatMessages(nb, fromMessage) {
	const chat = ui.chat?.element;
	if (!chat) return;

	const messages = game.messages.contents;
	const start =
		(fromMessage
			? messages.findLastIndex((m) => m === fromMessage)
			: messages.length) - 1;

	for (let i = start; i >= start - nb; i--) {
		const message = messages[i];
		if (!message) return;

		const html = chat.find(`[data-message-id=${message.id}]`);
		if (!html.length) continue;

		yield { message, html };
	}
}

export function chatUUID(uuid, label, fake = false) {
	if (fake) {
		return `<span style="background: #DDD; padding: 1px 4px; border: 1px solid var(--color-border-dark-tertiary);
border-radius: 2px; white-space: nowrap; word-break: break-all;">${label}</span>`;
	}

	if (label) return `@UUID[${uuid}]{${label}}`;

	return `@UUID[${uuid}]`;
}

export function bindOnPreCreateSpellDamageChatMessage(originalMessage) {
	const messageId = originalMessage.id;
	const save = getFlag(originalMessage, "target.save");
	if (!save) return;

	Hooks.once("preCreateChatMessage", (message) => {
		updateSourceFlag(message, "target.messageId", messageId);
		updateSourceFlag(message, "target.save", save);
	});
}

export function hasEmbeddedSpell(message) {
	return (
		message.getFlag("pf2e", "casting.embeddedSpell") ||
		message.item?.trickMagicEntry
	);
}
