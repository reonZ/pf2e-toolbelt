import { TokenPF2e } from "foundry-helpers";
import { AutoCoverTool, CoverValue } from ".";

/**
 * reused version of
 * https://github.com/foundryvtt/pf2e/blob/a52286c2efdd55c2911bf704be1f61fa1ba698d3/src/module/canvas/token/flanking-highlight/renderer.ts
 */
class CoverHighlightRenderer {
    #layer: PIXI.Graphics | null = null;
    #token: TokenPF2e;
    #tool: AutoCoverTool;

    constructor(token: TokenPF2e, tool: AutoCoverTool) {
        this.#token = token;
        this.#tool = tool;
    }

    /** Get existing layer graphics object or create one if one does not exist */
    get layer(): PIXI.Graphics {
        return this.#layer ?? this.#addLayer();
    }

    /**
     * Whether the flank highlight should be rendered to the user:
     * Canvas must be ready with a scene in focus, the user must own or have selected this token,
     * and the token must not be a preview or animating.
     */
    get #shouldRender(): boolean {
        return canvas.ready && !!canvas.scene && this.#tokenIsEligible;
    }

    /** The token must be controlled or the user's assigned character, and it must not be a preview or animating. */
    get #tokenIsEligible(): boolean {
        return !!(
            ((this.#token.controlled && this.#token.isOwner) ||
                (this.#token.actor && this.#token.actor?.id === game.user.character?.id)) &&
            !(this.#token.isPreview || this.#token.isAnimating)
        );
    }

    getLineColor(value: CoverValue): number {
        return value !== "none" ? CONFIG.Canvas.dispositionColors.HOSTILE : CONFIG.Canvas.dispositionColors.PARTY;
    }

    draw(): void {
        this.clear();
        if (canvas.tokens.highlightObjects && game.user.targets.size && this.#shouldRender) {
            for (const target of game.user.targets) {
                const { value } = this.#tool.calculateCover(this.#token, target);
                this.drawLine(target, value);
                this.drawLabel(target, value);
            }
        }
    }

    drawLine(target: TokenPF2e, value: CoverValue): void {
        const thickness = CONFIG.Canvas.objectBorderThickness;
        const outerThickness = Math.round(thickness * 1.5);
        const radius = Math.round(thickness * 2);
        const lineColor = this.getLineColor(value);

        // Draw line
        this.layer
            .lineStyle(outerThickness, 0x000000, 0.5)
            .moveTo(this.#token.center.x, this.#token.center.y)
            .lineTo(target.center.x, target.center.y);
        this.layer
            .lineStyle(thickness, lineColor, 0.5)
            .moveTo(this.#token.center.x, this.#token.center.y)
            .lineTo(target.center.x, target.center.y);

        // Draw circles on tokens
        this.layer
            .beginFill(lineColor)
            .lineStyle(1, 0x000000)
            .drawCircle(this.#token.center.x, this.#token.center.y, radius);
        this.layer.beginFill(lineColor).lineStyle(1, 0x000000).drawCircle(target.center.x, target.center.y, radius);
    }

    drawLabel(target: TokenPF2e, value: CoverValue): void {
        // Midpoint coordinate between tokens
        const mid_x = Math.round((this.#token.center.x + target.center.x) / 2);
        const mid_y = Math.round((this.#token.center.y + target.center.y) / 2);

        // Vector between tokens
        const vect_x = target.center.x - this.#token.center.x;
        const vect_y = target.center.y - this.#token.center.y;

        // find the perpendicular vector "above" the line
        const perp_vect_x = vect_x <= -vect_x ? vect_y : -vect_y;
        const perp_vect_y = vect_x <= -vect_x ? -vect_x : vect_x;

        // Midpoint coordinate offset perpendicularly above line
        const offsetPixels = 20.0;
        const offsetScale = offsetPixels / Math.sqrt(perp_vect_x ** 2 + perp_vect_y ** 2);
        const perp_x = mid_x + Math.round(perp_vect_x * offsetScale);
        const perp_y = mid_y + Math.round(perp_vect_y * offsetScale);

        // Styling
        const style = CONFIG.canvasTextStyle.clone();
        const dimensions = canvas.dimensions;
        style.fontSize = dimensions.size >= 200 ? 28 : dimensions.size < 50 ? 20 : 24;
        style.fill = this.getLineColor(value);
        style.stroke = 0x000000;

        const labelText = this.#tool.localize(value);
        const text = new foundry.canvas.containers.PreciseText(labelText, style);
        text.anchor.set(0.5, 0.5);

        // Rotate text to match line, ensuring it is not upside-down
        let rotation = Math.atan2(vect_y, vect_x);
        if (rotation > Math.PI / 2) {
            rotation = rotation - Math.PI;
        } else if (rotation < -Math.PI / 2) {
            rotation = rotation + Math.PI;
        }
        text.rotation = rotation;

        text.position.set(perp_x, perp_y);
        this.layer.addChild(text);
    }

    /** Destroys and removes layer graphics, incuding any text children */
    clear(): void {
        this.#layer?.destroy({ children: true });
        this.#layer = null;
    }

    /** Alias of `clear` */
    destroy(): void {
        this.clear();
    }

    /** Creates layer graphics object */
    #addLayer(): PIXI.Graphics {
        this.#layer = new PIXI.Graphics();
        return this.#token.layer.addChild(this.#layer);
    }
}

export { CoverHighlightRenderer };
