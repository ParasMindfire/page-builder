import { Canvas } from '../canvas/Canvas';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StampRecord {
  el: HTMLElement;
  prevStyle: string;
}

interface SVGRecord {
  el: SVGElement;
  prevWidth: string | null;
  prevHeight: string | null;
  prevViewBox: string | null;
  addedViewBox: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EDITOR_CLASSES_TO_REMOVE = [
  'component-controls',
  'delete-icon',
  'component-label',
  'column-label',
  'resizers',
  'resizer',
  'upload-btn',
  'component-resizer',
  'drop-preview',
  'edit-link-form',
  'edit-link',
] as const;

const EDITOR_NODES_SELECTOR = [
  '.component-controls',
  '.delete-icon',
  '.component-label',
  '.column-label',
  '.resizers',
  '.resizer',
  '.drop-preview',
  '.upload-btn',
  '.edit-link',
  '.edit-link-form',
  'input',
  '.cell-controls',
  '.add-row-button',
  '.add-multiple-rows-button',
  '.table-btn-container',
  '.drop-preview.visible',
].join(', ');

const EDITOR_ATTRS_TO_STRIP = ['contenteditable', 'draggable'] as const;

const TABLE_SELECTORS =
  '.table-component, .table-row, .table-cell, .table-wrapper';

const SVG_CSS_PROPS = [
  'fill',
  'stroke',
  'stroke-width',
  'opacity',
  'fill-opacity',
  'stroke-opacity',
] as const;

// ─── HTMLGenerator ────────────────────────────────────────────────────────────

export class HTMLGenerator {
  private canvas: Canvas;
  private readonly styleElement: HTMLStyleElement;

  constructor(canvas: Canvas) {
    this.canvas = canvas;
    this.styleElement = document.createElement('style');
    document.head.appendChild(this.styleElement);
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

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
  generateHTML(): string {
    const canvasElement = document.getElementById('canvas');
    if (!canvasElement) {
      console.warn(
        '[HTMLGenerator] Canvas element not found — returning shell.'
      );
      return this.buildHTMLShell('');
    }

    const stampRecords = this.stampLayoutDimensions(canvasElement);
    const svgRecords = this.stampSVGDimensions(canvasElement);

    const clone = canvasElement.cloneNode(true) as HTMLElement;

    this.stripEditorChrome(clone);

    this.restoreStamps(stampRecords);
    this.restoreSVGStamps(svgRecords);

    return this.buildHTMLShell(clone.innerHTML);
  }

  generateCSS(): string {
    const canvasElement = document.getElementById('canvas');
    if (!canvasElement) return '';

    const bgColor = window
      .getComputedStyle(canvasElement)
      .getPropertyValue('background-color');

    return [
      this.buildBaseCSS(bgColor),
      this.buildSVGChildCSS(canvasElement),
    ].join('\n');
  }

  applyCSS(css: string): void {
    this.styleElement.textContent = css;
  }

  // ─── Phase 1 — stamp layout dimensions ──────────────────────────────────────

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
  private stampLayoutDimensions(canvas: HTMLElement): StampRecord[] {
    const records: StampRecord[] = [];

    // ── Step 1: stamp position:relative on canvas ────────────────────────────
    // MUST happen before reading offsetTop/offsetLeft on children, because
    // offsetParent is resolved lazily — if canvas is not positioned, children's
    // offsetParent will be a higher ancestor and their offsets will be wrong.
    {
      const prevStyle = canvas.getAttribute('style') ?? '';
      if (!canvas.style.position) {
        const base = prevStyle
          ? prevStyle.trimEnd().replace(/;?\s*$/, ';') + ' '
          : '';
        canvas.setAttribute('style', base + 'position: relative;');
        records.push({ el: canvas, prevStyle });
      }
    }

    // ── Step 2: stamp canvas children ────────────────────────────────────────
    Array.from(canvas.children).forEach(child => {
      this.stampCanvasChild(child as HTMLElement, records);
    });

    // ── Step 3: stamp table internals ────────────────────────────────────────
    canvas.querySelectorAll<HTMLElement>(TABLE_SELECTORS).forEach(el => {
      this.stampTableInternal(el, records);
    });

    return records;
  }

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
  private stampCanvasChild(el: HTMLElement, records: StampRecord[]): void {
    const computed = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const prevStyle = el.getAttribute('style') ?? '';
    const extras: string[] = [];

    // Size — getBoundingClientRect is fine for dimensions (not coordinates)
    if (!el.style.width && rect.width > 0) {
      extras.push(`width: ${Math.round(rect.width)}px`);
    }
    if (!el.style.height && rect.height > 0) {
      extras.push(`height: ${Math.round(rect.height)}px`);
    }

    // Display
    if (!el.style.display) {
      const disp = computed.getPropertyValue('display');
      if (disp && disp !== 'inline') extras.push(`display: ${disp}`);
    }

    // Position type
    const position = computed.getPropertyValue('position');
    const effectivePosition = el.style.position || position;

    if (!el.style.position && position && position !== 'static') {
      extras.push(`position: ${position}`);
    }

    // Coordinates — only for positioned elements
    if (effectivePosition && effectivePosition !== 'static') {
      // offsetTop/offsetLeft: relative to offsetParent = canvas (after stamp above)
      // This is the scroll-invariant, canvas-relative truth.
      if (!el.style.top) {
        extras.push(`top: ${el.offsetTop}px`);
      }
      if (!el.style.left) {
        extras.push(`left: ${el.offsetLeft}px`);
      }

      // right/bottom: only stamp when explicitly non-auto in the cascade
      const cr = computed.getPropertyValue('right');
      if (!el.style.right && cr && cr !== 'auto') {
        extras.push(`right: ${cr}`);
      }
      const cb = computed.getPropertyValue('bottom');
      if (!el.style.bottom && cb && cb !== 'auto') {
        extras.push(`bottom: ${cb}`);
      }

      // z-index
      const zi = computed.getPropertyValue('z-index');
      if (!el.style.zIndex && zi && zi !== 'auto') {
        extras.push(`z-index: ${zi}`);
      }
    }

    if (extras.length === 0) return;

    const base = prevStyle
      ? prevStyle.trimEnd().replace(/;?\s*$/, ';') + ' '
      : '';
    el.setAttribute('style', base + extras.join('; ') + ';');
    records.push({ el, prevStyle });
  }

  /**
   * Stamps size + display onto table internals.
   * These elements are not position:absolute — they use grid/flex sizing
   * from main.css. We preserve rendered dimensions so they don't collapse
   * in the exported page where main.css is absent.
   * We do NOT stamp top/left here — table rows/cells are in normal flow.
   */
  private stampTableInternal(el: HTMLElement, records: StampRecord[]): void {
    const computed = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const prevStyle = el.getAttribute('style') ?? '';
    const extras: string[] = [];

    if (!el.style.width && rect.width > 0) {
      extras.push(`width: ${Math.round(rect.width)}px`);
    }
    if (!el.style.height && rect.height > 0) {
      extras.push(`height: ${Math.round(rect.height)}px`);
    }
    if (!el.style.display) {
      const disp = computed.getPropertyValue('display');
      if (disp && disp !== 'inline') extras.push(`display: ${disp}`);
    }

    if (extras.length === 0) return;

    const base = prevStyle
      ? prevStyle.trimEnd().replace(/;?\s*$/, ';') + ' '
      : '';
    el.setAttribute('style', base + extras.join('; ') + ';');
    records.push({ el, prevStyle });
  }

  private restoreStamps(records: StampRecord[]): void {
    records.forEach(({ el, prevStyle }) => {
      if (prevStyle) {
        el.setAttribute('style', prevStyle);
      } else {
        el.removeAttribute('style');
      }
    });
  }

  // ─── Phase 2 — stamp SVG dimensions ─────────────────────────────────────────

  private stampSVGDimensions(canvas: HTMLElement): SVGRecord[] {
    const records: SVGRecord[] = [];

    canvas.querySelectorAll<SVGElement>('svg').forEach(svg => {
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0) return;

      const w = Math.round(rect.width);
      const h = Math.round(rect.height);

      const prevWidth = svg.getAttribute('width');
      const prevHeight = svg.getAttribute('height');
      const prevViewBox = svg.getAttribute('viewBox');
      const addedViewBox = !prevViewBox && w > 0 && h > 0;

      svg.setAttribute('width', String(w));
      svg.setAttribute('height', String(h));
      if (addedViewBox) {
        svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      }

      records.push({
        el: svg,
        prevWidth,
        prevHeight,
        prevViewBox,
        addedViewBox,
      });
    });

    return records;
  }

  private restoreSVGStamps(records: SVGRecord[]): void {
    records.forEach(
      ({ el, prevWidth, prevHeight, prevViewBox, addedViewBox }) => {
        prevWidth !== null
          ? el.setAttribute('width', prevWidth)
          : el.removeAttribute('width');
        prevHeight !== null
          ? el.setAttribute('height', prevHeight)
          : el.removeAttribute('height');
        if (addedViewBox) {
          el.removeAttribute('viewBox');
        } else if (prevViewBox !== null) {
          el.setAttribute('viewBox', prevViewBox);
        }
      }
    );
  }

  // ─── Phase 3 — strip editor chrome ──────────────────────────────────────────

  private stripEditorChrome(root: HTMLElement): void {
    this.stripNodeRecursive(root);
  }

  private stripNodeRecursive(el: HTMLElement): void {
    EDITOR_ATTRS_TO_STRIP.forEach(attr => el.removeAttribute(attr));
    EDITOR_CLASSES_TO_REMOVE.forEach(cls => el.classList.remove(cls));
    el.querySelectorAll(EDITOR_NODES_SELECTOR).forEach(node => node.remove());
    Array.from(el.children).forEach(child => {
      this.stripNodeRecursive(child as HTMLElement);
    });
  }

  // ─── Phase 4 — HTML shell ────────────────────────────────────────────────────

  private buildHTMLShell(bodyContent: string): string {
    const layoutClass =
      Canvas.layoutMode === 'grid' ? 'grid-layout-active' : 'home';

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Page Builder</title>
    <style>
${this.generateCSS()}
    </style>
  </head>
  <body>
    <div id="canvas" class="${layoutClass}">
${bodyContent}
    </div>
  </body>
</html>`;
  }

  // ─── CSS helpers ─────────────────────────────────────────────────────────────

  private buildBaseCSS(bgColor: string): string {
    const isGrid = Canvas.layoutMode === 'grid';

    // Shared rules across both layout modes
    const shared = `
*, *::before, *::after { box-sizing: border-box; }
body, html {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 3px; }
::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
.editable-component { border: none !important; box-shadow: none !important; }`;

    // position:relative is mandatory on #canvas in BOTH modes.
    // It makes #canvas the containing block for position:absolute children,
    // matching the coordinate system we used when reading offsetTop/offsetLeft.
    if (isGrid) {
      return `${shared}
body, html { display: flex; overflow: hidden; }
#canvas {
  position: relative;
  display: block;
  width: 100%;
  flex-grow: 1;
  min-width: 0;
  background-color: ${bgColor};
  margin: 0;
  overflow: auto;
  box-sizing: border-box;
}
.container-grid-active { display: block; }
.table-component { border-collapse: collapse; box-sizing: border-box; }`;
    }

    return `${shared}
#canvas {
  position: relative;
  display: block;
  width: 100%;
  min-height: 100vh;
  background-color: ${bgColor};
  margin: 0;
  overflow: visible;
}
table { border-collapse: collapse; }`;
  }

  private buildSVGChildCSS(canvas: HTMLElement): string {
    const rules: string[] = [];
    const seen = new Set<string>();

    canvas
      .querySelectorAll<SVGElement>(
        'svg path, svg circle, svg rect, svg polygon'
      )
      .forEach((el, idx) => {
        const props = this.collectSVGProps(el);
        if (props.length === 0) return;
        const selector = this.buildSVGSelector(el, idx);
        if (seen.has(selector)) return;
        seen.add(selector);
        rules.push(`${selector} {\n  ${props.join('\n  ')}\n}`);
      });

    return rules.join('\n');
  }

  private collectSVGProps(el: SVGElement): string[] {
    const computed = window.getComputedStyle(el);
    return SVG_CSS_PROPS.map(prop => {
      const value = computed.getPropertyValue(prop);
      return value && value !== 'none' && value !== '' && value !== 'initial'
        ? `${prop}: ${value} !important;`
        : null;
    }).filter(Boolean) as string[];
  }

  private buildSVGSelector(el: Element, fallbackIndex: number): string {
    const parentSVG = el.closest('svg');
    const container = parentSVG?.parentElement;
    let selector = '';

    if (container) {
      if (container.id) {
        selector += `#${container.id} `;
      } else if (container.className) {
        const cleanClasses = container.className
          .toString()
          .split(/\s+/)
          .filter(
            cls =>
              !cls.startsWith('component-') &&
              !cls.startsWith('delete-') &&
              cls !== 'resizer'
          )
          .join('.');
        if (cleanClasses) selector += `.${cleanClasses} `;
      }
    }

    if (parentSVG) {
      const svgClass = parentSVG.className?.baseVal;
      selector += svgClass ? `svg.${svgClass.split(/\s+/).join('.')} ` : 'svg ';
    }

    const parent = el.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        c => c.tagName === el.tagName
      );
      selector += `${el.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(el) + 1})`;
    } else {
      selector += el.tagName.toLowerCase();
    }

    return selector || `${el.tagName.toLowerCase()}-${fallbackIndex}`;
  }

  /** Kept for external callers. Not used internally. */
  private buildUniqueSelector(element: Element): string {
    if (element.id) return `#${element.id}`;

    const STRIP = new Set(EDITOR_CLASSES_TO_REMOVE as unknown as string[]);
    const path: string[] = [];
    let current: Element | null = element;

    while (current && current.tagName.toLowerCase() !== 'body') {
      let sel = current.tagName.toLowerCase();
      const classes = Array.from(current.classList)
        .filter(cls => !STRIP.has(cls))
        .join('.');
      if (classes) sel += `.${classes}`;

      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          c => c.tagName === current!.tagName
        );
        if (siblings.length > 1) {
          sel += `:nth-of-type(${siblings.indexOf(current) + 1})`;
        }
      }

      path.unshift(sel);

      if (current.parentElement?.id) {
        path.unshift(`#${current.parentElement.id}`);
        break;
      }

      current = current.parentElement;
    }

    return `#canvas > ${path.join(' > ')}`;
  }
}
