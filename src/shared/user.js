export function isActiveGM() {
	return game.user === game.users.activeGM;
}

export function isUserGM() {
	const user = game.data.users.find((x) => x._id === game.data.userId);
	return user && user.role >= CONST.USER_ROLES.GAMEMASTER;
}

export function isGMOnline() {
	return game.users.some((user) => user.active && user.isGM);
}

export function getCharacterOwner(actor, connected = false) {
	if (connected)
		return game.users.find((x) => x.active && x.character === actor);
	return game.users.find((x) => x.character === actor);
}

export function getActiveOwner(doc) {
	const activeOwners = game.users.filter(
		(user) =>
			user.active && !user.isGM && doc.testUserPermission(user, "OWNER"),
	);
	activeOwners.sort((a, b) => (a.id > b.id ? 1 : -1));
	return activeOwners[0] || null;
}

export function isActiveOwner(doc) {
	return getActiveOwner(doc) === game.user;
}

export function getOwner(doc, connected = false) {
	if (connected)
		return game.users.find(
			(x) => x.active && doc.testUserPermission(x, "OWNER"),
		);
	return game.users.find((x) => doc.testUserPermission(x, "OWNER"));
}
