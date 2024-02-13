import { getFlag, updateSourceFlag } from "module-api";

export function bindOnPreCreateSpellDamageChatMessage(originalMessage) {
	const messageId = originalMessage.id;
	const save = getFlag(originalMessage, "target.save");
	if (!save) return;

	Hooks.once("preCreateChatMessage", (message) => {
		updateSourceFlag(message, "target.messageId", messageId);
		updateSourceFlag(message, "target.save", save);
	});
}
