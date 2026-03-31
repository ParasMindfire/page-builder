import { Canvas } from '../canvas/Canvas.js';
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
];
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
  '.cell-controls',
  '.add-row-button',
  '.add-multiple-rows-button',
  '.table-btn-container',
  '.drop-preview.visible',
  // General inputs except radio (radio handled separately in MUI strip)
  'input:not([type="radio"])',
].join(', ');
const SVG_ACCESSIBILITY_SELECTOR = 'svg title, svg desc';
const EDITOR_ATTRS_TO_STRIP = ['contenteditable', 'draggable'];
const TABLE_SELECTORS =
  '.table-component, .table-row, .table-cell, .table-wrapper';
const SVG_CSS_PROPS = [
  'fill',
  'stroke',
  'stroke-width',
  'opacity',
  'fill-opacity',
  'stroke-opacity',
];
const DESCENDANT_LAYOUT_PROPS = [
  'display',
  'flex-direction',
  'flex-wrap',
  'align-items',
  'justify-content',
  'gap',
  'flex',
  'flex-shrink',
  'flex-grow',
  'flex-basis',
  'grid-template-columns',
  'grid-template-rows',
  'grid-column',
  'grid-row',
];
const VISUAL_PROPS_TO_STAMP = [
  'color',
  'background-color',
  'border',
  'border-radius',
  'border-color',
  'border-width',
  'border-style',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'font-size',
  'font-weight',
  'font-family',
  'font-style',
  'line-height',
  'letter-spacing',
  'text-align',
  'text-decoration',
  'vertical-align',
  'cursor',
  'opacity',
  'overflow',
  'box-shadow',
  'outline',
  'visibility',
  'pointer-events',
  'white-space',
];
// ─── HTMLGenerator ────────────────────────────────────────────────────────────
export class HTMLGenerator {
  constructor(canvas) {
    this.canvas = canvas;
    this.styleElement = document.createElement('style');
    document.head.appendChild(this.styleElement);
  }
  // ─── Public API ─────────────────────────────────────────────────────────────
  generateHTML() {
    const canvasElement = document.getElementById('canvas');
    if (!canvasElement) {
      console.warn(
        '[HTMLGenerator] Canvas element not found — returning shell.'
      );
      return this.buildHTMLShell('', '');
    }
    const embeddedStyles = this.collectHeadStyles();
    const stampRecords = this.stampLayoutDimensions(canvasElement);
    const svgRecords = this.stampSVGDimensions(canvasElement);
    const clone = canvasElement.cloneNode(true);
    this.stripEditorChrome(clone);
    this.restoreStamps(stampRecords);
    this.restoreSVGStamps(svgRecords);
    return this.buildHTMLShell(clone.innerHTML, embeddedStyles);
  }
  generateCSS() {
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
  applyCSS(css) {
    this.styleElement.textContent = css;
  }
  // ─── Phase 1 — collect all head <style> sheets ───────────────────────────────
  collectHeadStyles() {
    const sheets = [];
    document.querySelectorAll('head style').forEach(styleEl => {
      var _a;
      if (styleEl === this.styleElement) return;
      const text =
        (_a = styleEl.textContent) !== null && _a !== void 0 ? _a : '';
      if (text.trim()) sheets.push(text);
    });
    return sheets.join('\n');
  }
  // ─── Phase 2-4 — stamp layout dimensions ─────────────────────────────────────
  stampLayoutDimensions(canvas) {
    var _a;
    const records = [];
    // Stamp canvas itself as position:relative FIRST — makes it the offsetParent
    // so offsetTop/offsetLeft on children are canvas-relative coordinates.
    {
      const prevStyle =
        (_a = canvas.getAttribute('style')) !== null && _a !== void 0 ? _a : '';
      if (!canvas.style.position) {
        const base = prevStyle
          ? prevStyle.trimEnd().replace(/;?\s*$/, ';') + ' '
          : '';
        canvas.setAttribute('style', base + 'position: relative;');
        records.push({ el: canvas, prevStyle });
      }
    }
    // Direct canvas children — full position + coordinates
    Array.from(canvas.children).forEach(child => {
      this.stampCanvasChild(child, records);
    });
    // All non-SVG descendants — layout + visual props
    canvas.querySelectorAll('*').forEach(el => {
      if (el.parentElement === canvas) return;
      if (el instanceof SVGElement) return;
      this.stampDescendant(el, records);
    });
    // Table internals — belt-and-suspenders
    canvas.querySelectorAll(TABLE_SELECTORS).forEach(el => {
      this.stampTableInternal(el, records);
    });
    return records;
  }
  stampCanvasChild(el, records) {
    var _a;
    const computed = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const prevStyle =
      (_a = el.getAttribute('style')) !== null && _a !== void 0 ? _a : '';
    const extras = [];
    if (!el.style.width && rect.width > 0)
      extras.push(`width: ${Math.round(rect.width)}px`);
    if (!el.style.height && rect.height > 0)
      extras.push(`height: ${Math.round(rect.height)}px`);
    if (!el.style.display) {
      const disp = computed.getPropertyValue('display');
      if (disp && disp !== 'inline') extras.push(`display: ${disp}`);
    }
    const position = computed.getPropertyValue('position');
    const effectivePosition = el.style.position || position;
    if (!el.style.position && position && position !== 'static') {
      extras.push(`position: ${position}`);
    }
    if (effectivePosition && effectivePosition !== 'static') {
      if (!el.style.top) extras.push(`top: ${el.offsetTop}px`);
      if (!el.style.left) extras.push(`left: ${el.offsetLeft}px`);
      const cr = computed.getPropertyValue('right');
      if (!el.style.right && cr && cr !== 'auto') extras.push(`right: ${cr}`);
      const cb = computed.getPropertyValue('bottom');
      if (!el.style.bottom && cb && cb !== 'auto') extras.push(`bottom: ${cb}`);
      const zi = computed.getPropertyValue('z-index');
      if (!el.style.zIndex && zi && zi !== 'auto')
        extras.push(`z-index: ${zi}`);
    }
    if (extras.length === 0) return;
    const base = prevStyle
      ? prevStyle.trimEnd().replace(/;?\s*$/, ';') + ' '
      : '';
    el.setAttribute('style', base + extras.join('; ') + ';');
    records.push({ el, prevStyle });
  }
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
  stampDescendant(el, records) {
    var _a;
    const computed = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const prevStyle =
      (_a = el.getAttribute('style')) !== null && _a !== void 0 ? _a : '';
    const extras = [];
    const tag = el.tagName.toLowerCase();
    const display = computed.getPropertyValue('display');
    // Stamp width only on structural block/flex/grid containers, NOT on
    // inline or text-content elements. Stamping width on <p>, <span>, <legend>
    // etc. causes text to wrap at the stamped pixel width.
    const isTextNode =
      [
        'p',
        'span',
        'legend',
        'label',
        'a',
        'li',
        'td',
        'th',
        'dt',
        'dd',
        'caption',
      ].includes(tag) ||
      display === 'inline' ||
      display === 'inline-block' ||
      display === 'inline-flex';
    if (!isTextNode && !el.style.width && rect.width > 0) {
      extras.push(`width: ${Math.round(rect.width)}px`);
    }
    if (!el.style.height && rect.height > 0) {
      // Never stamp height on text containers — let them size to content
      if (!isTextNode && display !== 'inline') {
        extras.push(`height: ${Math.round(rect.height)}px`);
      }
    }
    // Layout properties (flex/grid from main.css or emotion)
    DESCENDANT_LAYOUT_PROPS.forEach(prop => {
      const styleKey = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      if (el.style[styleKey]) return;
      const val = computed.getPropertyValue(prop);
      if (
        !val ||
        val === 'normal' ||
        val === 'auto' ||
        val === '0px' ||
        val === 'none'
      )
        return;
      if (prop === 'display' && (val === 'block' || val === 'inline')) return;
      extras.push(`${prop}: ${val}`);
    });
    // Visual properties (MUI emotion — class rules lost on innerHTML clone)
    VISUAL_PROPS_TO_STAMP.forEach(prop => {
      const styleKey = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      if (el.style[styleKey]) return;
      const val = computed.getPropertyValue(prop);
      if (!val || val === 'none' || val === 'normal' || val === 'auto') return;
      if (prop === 'color' && val === 'rgb(0, 0, 0)') return;
      if (
        prop === 'background-color' &&
        (val === 'rgba(0, 0, 0, 0)' || val === 'transparent')
      )
        return;
      if (prop === 'font-family' && val.toLowerCase().includes('times')) return;
      if (prop === 'cursor' && val === 'auto') return;
      if (prop === 'visibility' && val === 'visible') return;
      if (prop === 'pointer-events' && val === 'auto') return;
      // white-space:nowrap on text elements prevents wrapping — critical for MUI Typography
      extras.push(`${prop}: ${val}`);
    });
    if (extras.length === 0) return;
    const base = prevStyle
      ? prevStyle.trimEnd().replace(/;?\s*$/, ';') + ' '
      : '';
    el.setAttribute('style', base + extras.join('; ') + ';');
    records.push({ el, prevStyle });
  }
  stampTableInternal(el, records) {
    var _a;
    const computed = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const prevStyle =
      (_a = el.getAttribute('style')) !== null && _a !== void 0 ? _a : '';
    const extras = [];
    if (!el.style.width && rect.width > 0)
      extras.push(`width: ${Math.round(rect.width)}px`);
    if (!el.style.height && rect.height > 0)
      extras.push(`height: ${Math.round(rect.height)}px`);
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
  restoreStamps(records) {
    records.forEach(({ el, prevStyle }) => {
      if (prevStyle) el.setAttribute('style', prevStyle);
      else el.removeAttribute('style');
    });
  }
  // ─── Phase 5 — stamp SVG dimensions ─────────────────────────────────────────
  stampSVGDimensions(canvas) {
    const records = [];
    canvas.querySelectorAll('svg').forEach(svg => {
      var _a;
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0) return;
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      const prevWidth = svg.getAttribute('width');
      const prevHeight = svg.getAttribute('height');
      const prevViewBox = svg.getAttribute('viewBox');
      const prevStyle =
        (_a = svg.getAttribute('style')) !== null && _a !== void 0 ? _a : '';
      const addedViewBox = !prevViewBox && w > 0 && h > 0;
      svg.setAttribute('width', String(w));
      svg.setAttribute('height', String(h));
      if (addedViewBox) svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      const computed = window.getComputedStyle(svg);
      const disp = computed.getPropertyValue('display');
      const styleExtras = [`width: ${w}px`, `height: ${h}px`, `flex-shrink: 0`];
      if (disp && disp !== 'inline') styleExtras.push(`display: ${disp}`);
      const base = prevStyle
        ? prevStyle.trimEnd().replace(/;?\s*$/, ';') + ' '
        : '';
      svg.setAttribute('style', base + styleExtras.join('; ') + ';');
      records.push({
        el: svg,
        prevWidth,
        prevHeight,
        prevViewBox,
        prevStyle,
        addedViewBox,
      });
    });
    return records;
  }
  restoreSVGStamps(records) {
    records.forEach(
      ({ el, prevWidth, prevHeight, prevViewBox, prevStyle, addedViewBox }) => {
        prevWidth !== null
          ? el.setAttribute('width', prevWidth)
          : el.removeAttribute('width');
        prevHeight !== null
          ? el.setAttribute('height', prevHeight)
          : el.removeAttribute('height');
        if (addedViewBox) el.removeAttribute('viewBox');
        else if (prevViewBox !== null) el.setAttribute('viewBox', prevViewBox);
        if (prevStyle) el.setAttribute('style', prevStyle);
        else el.removeAttribute('style');
      }
    );
  }
  // ─── Phase 7 — strip editor chrome ──────────────────────────────────────────
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
  stripEditorChrome(root) {
    // 1. SVG accessibility text — renders as visible text in isolated HTML
    root
      .querySelectorAll(SVG_ACCESSIBILITY_SELECTOR)
      .forEach(el => el.remove());
    // 2. MUI Rating — surgical strip: remove inputs + bare text nodes only
    root.querySelectorAll('[class*="MuiRating-label"]').forEach(labelSpan => {
      // Remove the hidden radio input
      labelSpan
        .querySelectorAll('input[type="radio"]')
        .forEach(input => input.remove());
      // Remove bare text nodes (the "1 Star", "2 Stars" strings) but keep
      // child elements (the MuiRating-icon span + its SVG) untouched.
      Array.from(labelSpan.childNodes).forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) node.remove();
      });
    });
    // 3. MUI Rating visually-hidden text span (separate from label in some MUI versions)
    // These are spans with position:absolute + clip that contain "1 Star" etc.
    root
      .querySelectorAll('[class*="MuiRating-visuallyHidden"]')
      .forEach(el => el.remove());
    this.stripNodeRecursive(root);
  }
  stripNodeRecursive(el) {
    EDITOR_ATTRS_TO_STRIP.forEach(attr => el.removeAttribute(attr));
    EDITOR_CLASSES_TO_REMOVE.forEach(cls => el.classList.remove(cls));
    el.querySelectorAll(EDITOR_NODES_SELECTOR).forEach(node => node.remove());
    Array.from(el.children).forEach(child => {
      this.stripNodeRecursive(child);
    });
  }
  // ─── Phase 9 — HTML shell ────────────────────────────────────────────────────
  buildHTMLShell(bodyContent, embeddedStyles) {
    const layoutClass =
      Canvas.layoutMode === 'grid' ? 'grid-layout-active' : 'home';
    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Page Builder</title>
    <style>
${embeddedStyles}
    </style>
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
  buildBaseCSS(bgColor) {
    const isGrid = Canvas.layoutMode === 'grid';
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
  buildSVGChildCSS(canvas) {
    const rules = [];
    const seen = new Set();
    canvas
      .querySelectorAll('svg path, svg circle, svg rect, svg polygon')
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
  collectSVGProps(el) {
    const computed = window.getComputedStyle(el);
    return SVG_CSS_PROPS.map(prop => {
      const value = computed.getPropertyValue(prop);
      return value && value !== 'none' && value !== '' && value !== 'initial'
        ? `${prop}: ${value} !important;`
        : null;
    }).filter(Boolean);
  }
  buildSVGSelector(el, fallbackIndex) {
    var _a;
    const parentSVG = el.closest('svg');
    const container =
      parentSVG === null || parentSVG === void 0
        ? void 0
        : parentSVG.parentElement;
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
      const svgClass =
        (_a = parentSVG.className) === null || _a === void 0
          ? void 0
          : _a.baseVal;
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
  buildUniqueSelector(element) {
    var _a;
    if (element.id) return `#${element.id}`;
    const STRIP = new Set(EDITOR_CLASSES_TO_REMOVE);
    const path = [];
    let current = element;
    while (current && current.tagName.toLowerCase() !== 'body') {
      let sel = current.tagName.toLowerCase();
      const classes = Array.from(current.classList)
        .filter(cls => !STRIP.has(cls))
        .join('.');
      if (classes) sel += `.${classes}`;
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          c => c.tagName === current.tagName
        );
        if (siblings.length > 1) {
          sel += `:nth-of-type(${siblings.indexOf(current) + 1})`;
        }
      }
      path.unshift(sel);
      if (
        (_a = current.parentElement) === null || _a === void 0 ? void 0 : _a.id
      ) {
        path.unshift(`#${current.parentElement.id}`);
        break;
      }
      current = current.parentElement;
    }
    return `#canvas > ${path.join(' > ')}`;
  }
}
