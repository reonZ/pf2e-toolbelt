export function getTemplateTokens(
	measuredTemplate,
	{ collisionOrigin, collisionType = "move" } = {},
) {
	const template =
		measuredTemplate instanceof MeasuredTemplateDocument
			? measuredTemplate.object
			: measuredTemplate;

	if (!canvas.scene) return [];
	const { grid, dimensions } = canvas;
	if (!(grid && dimensions)) return [];

	if (!template?.highlightId) return [];

	const gridHighlight = grid.getHighlightLayer(template.highlightId);
	if (!gridHighlight || grid.type !== CONST.GRID_TYPES.SQUARE) return [];
	const origin = collisionOrigin ?? template.center;

	// Get all the tokens that are inside the highlight bounds
	const tokens = canvas.tokens.quadtree.getObjects(
		gridHighlight.getLocalBounds(undefined, true),
	);

	const gridSize = grid.size;

	const containedTokens = [];
	for (const token of tokens) {
		const tokenDoc = token.document;

		// Collect the position of all grid squares that this token occupies as "x.y"
		const tokenPositions = [];
		for (let h = 0; h < tokenDoc.height; h++) {
			const tokenX = Math.floor(token.x / gridSize) * gridSize;
			const tokenY = Math.floor(token.y / gridSize) * gridSize;

			const y = tokenY + h * gridSize;
			tokenPositions.push(`${tokenX}.${y}`);
			if (tokenDoc.width > 1) {
				for (let w = 1; w < tokenDoc.width; w++) {
					tokenPositions.push(`${tokenX + w * gridSize}.${y}`);
				}
			}
		}

		for (const position of tokenPositions) {
			// Check if a position exists within this GridHiglight
			if (!gridHighlight.positions.has(position)) {
				continue;
			}
			// Position of cell's top-left corner, in pixels
			const [gx, gy] = position.split(".").map((s) => Number(s));
			// Position of cell's center in pixels
			const destination = {
				x: gx + dimensions.size * 0.5,
				y: gy + dimensions.size * 0.5,
			};
			if (destination.x < 0 || destination.y < 0) continue;

			const hasCollision =
				canvas.ready &&
				collisionType &&
				CONFIG.Canvas.polygonBackends[collisionType].testCollision(
					origin,
					destination,
					{
						type: collisionType,
						mode: "any",
					},
				);

			if (!hasCollision) {
				containedTokens.push(token);
				break;
			}
		}
	}
	return containedTokens;
}
