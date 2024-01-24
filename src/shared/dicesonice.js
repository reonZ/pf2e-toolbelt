export async function roll3dDice(
	roll,
	{ user = game.user, synchronize = true } = {},
) {
	if (!game.modules.get("dice-so-nice")?.active) return;
	return game.dice3d.showForRoll(roll, user, synchronize);
}
