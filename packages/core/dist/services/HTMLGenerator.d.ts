import { Canvas } from '../canvas/Canvas';
export declare class HTMLGenerator {
  private canvas;
  private readonly styleElement;
  constructor(canvas: Canvas);
  /**
   * Captures the live canvas and returns a self-contained HTML string.
   *
   * Phase order:
   *   1. Stamp position:relative on canvas (makes it the containing block).
   *   2. Stamp pixel-accurate top/left/width/height on each canvas child
   *      using offsetTop/offsetLeft — canvas-relative, scroll-invariant.
   *   3. Stamp width/height/display on table internals.
   *   4. Stamp explicit dimensions on every SVG.
   *   5. Deep-clone (all stamps travel with the clone).
   *   6. Strip editor chrome from clone.
   *   7. Restore live DOM exactly as it was.
   *   8. Wrap clone content in self-contained HTML shell.
   */
  generateHTML(): string;
  generateCSS(): string;
  applyCSS(css: string): void;
  /**
   * WHY offsetTop/offsetLeft instead of getBoundingClientRect() or computed style:
   *
   *   getBoundingClientRect() → viewport-relative coordinates.
   *   If the page has scrolled, or the canvas is not at the very top of the
   *   viewport, these values are offset by scroll amount and will be wrong.
   *
   *   computed.getPropertyValue('top') → the CSS cascade value.
   *   Returns 'auto' when top was not explicitly set, even if the element
   *   renders at a specific pixel position. Useless for stamping.
   *
   *   el.offsetTop / el.offsetLeft → offset relative to el.offsetParent.
   *   Because we stamp `position: relative` on the canvas FIRST, every
   *   direct canvas child's offsetParent becomes the canvas itself.
   *   Result: pixel-perfect canvas-relative coordinates, scroll-invariant,
   *   viewport-position-invariant. This is the correct coordinate system
   *   for the exported HTML where #canvas is also position:relative.
   */
  private stampLayoutDimensions;
  /**
   * Stamps a top-level canvas child with all properties needed for accurate
   * self-contained rendering:
   *   - position (absolute/relative/fixed)
   *   - top, left  ← from offsetTop/offsetLeft (canvas-relative, correct)
   *   - right, bottom ← from computed style only when explicitly non-auto
   *   - width, height ← from getBoundingClientRect (size is viewport-invariant)
   *   - display
   *   - z-index
   */
  private stampCanvasChild;
  /**
   * Stamps size + display onto table internals.
   * These elements are not position:absolute — they use grid/flex sizing
   * from main.css. We preserve rendered dimensions so they don't collapse
   * in the exported page where main.css is absent.
   * We do NOT stamp top/left here — table rows/cells are in normal flow.
   */
  private stampTableInternal;
  private restoreStamps;
  private stampSVGDimensions;
  private restoreSVGStamps;
  private stripEditorChrome;
  private stripNodeRecursive;
  private buildHTMLShell;
  private buildBaseCSS;
  private buildSVGChildCSS;
  private collectSVGProps;
  private buildSVGSelector;
  /** Kept for external callers. Not used internally. */
  private buildUniqueSelector;
}
