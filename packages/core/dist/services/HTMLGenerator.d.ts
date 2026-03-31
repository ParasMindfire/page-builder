import { Canvas } from '../canvas/Canvas';
export declare class HTMLGenerator {
  private canvas;
  private readonly styleElement;
  constructor(canvas: Canvas);
  generateHTML(): string;
  generateCSS(): string;
  applyCSS(css: string): void;
  private collectHeadStyles;
  private stampLayoutDimensions;
  private stampCanvasChild;
  /**
   * Stamps layout + visual props on a descendant element.
   *
   * IMPORTANT — we do NOT stamp width on text-content elements (Typography,
   * spans, labels). Stamping a pixel width on text forces it to wrap at
   * exactly that width even if the parent container is wider in the export.
   * We only stamp width on structural/block containers (divs, sections etc.)
   * that have a non-inline display.
   *
   * MUI text nodes (Typography = <p>, legend = <legend>, body2 = <p>) must
   * receive white-space:nowrap or keep their natural flow width — not a
   * pixel-locked width — so the text doesn't wrap.
   */
  private stampDescendant;
  private stampTableInternal;
  private restoreStamps;
  private stampSVGDimensions;
  private restoreSVGStamps;
  /**
   * MUI Rating DOM structure (critical to understand before stripping):
   *
   *   <span class="MuiRating-root">
   *     <span class="MuiRating-label">        ← DO NOT remove — contains the star SVG
   *       <input type="radio" />              ← REMOVE — form control, visible in export
   *       <span class="MuiRating-icon">
   *         <svg>...</svg>                    ← KEEP — this is the actual star icon
   *       </span>
   *       "2 Stars"                           ← REMOVE — text node, visible in export
   *     </span>
   *   </span>
   *
   * Previous bug: we removed the entire MuiRating-label span which took
   * the star SVG with it. The fix is surgical:
   *   1. Remove only the <input type="radio"> inside rating labels
   *   2. Remove only the text nodes inside rating labels (not child elements)
   *   3. Keep the span itself and its SVG children intact
   */
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
