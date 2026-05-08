/* Singleton rich-text editor toolbar shared by all TextComponent instances */

let _toolbar: HTMLElement | null = null;
let _activeSpan: HTMLElement | null = null;
let _savedRange: Range | null = null;

/* ── Selection helpers ────────────────────────────────────────────────────── */

function saveRange(): void {
  const sel = window.getSelection();
  _savedRange =
    sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
}

function restoreRange(): void {
  if (!_savedRange || !_activeSpan) return;
  _activeSpan.focus();
  const sel = window.getSelection();
  if (sel) {
    sel.removeAllRanges();
    sel.addRange(_savedRange);
  }
}

function exec(cmd: string, arg?: string): void {
  restoreRange();
  document.execCommand(cmd, false, arg);
  saveRange();
  updateStates();
}

/* ── DOM builder helpers ──────────────────────────────────────────────────── */

function makeBtn(cmd: string, html: string, title: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'rte-btn';
  b.innerHTML = html;
  b.title = title;
  b.dataset.cmd = cmd;

  b.addEventListener('mousedown', e => {
    e.preventDefault();

    if (cmd === '__link') {
      restoreRange();
      const url = prompt('Enter URL:', 'https://');
      if (url) {
        document.execCommand('createLink', false, url);
        _activeSpan?.querySelectorAll('a').forEach(a => {
          (a as HTMLAnchorElement).target = '_blank';
          (a as HTMLAnchorElement).rel = 'noopener noreferrer';
        });
        saveRange();
        updateStates();
      }
    } else {
      exec(cmd);
    }
  });

  return b;
}

function makeSep(): HTMLElement {
  const s = document.createElement('span');
  s.className = 'rte-sep';
  return s;
}

function makeSelect(
  id: string,
  options: { v: string; label: string }[],
  title: string,
  extraCls = ''
): HTMLSelectElement {
  const sel = document.createElement('select');
  sel.id = id;
  sel.className = ('rte-select ' + extraCls).trim();
  sel.title = title;
  options.forEach(({ v, label }) => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = label;
    sel.appendChild(opt);
  });
  return sel;
}

function makeColorBtn(
  cmd: string,
  label: string,
  title: string,
  defaultColor: string
): HTMLElement {
  const wrap = document.createElement('label');
  wrap.className = 'rte-color-wrap';
  wrap.title = title;

  const text = document.createElement('span');
  text.className = 'rte-color-label';
  text.textContent = label;

  const swatch = document.createElement('span');
  swatch.className = 'rte-color-swatch';
  swatch.style.backgroundColor = defaultColor;

  const inp = document.createElement('input');
  inp.type = 'color';
  inp.value = defaultColor;
  inp.className = 'rte-color-input';

  wrap.addEventListener('mousedown', e => {
    e.preventDefault();
    saveRange();
    setTimeout(() => inp.click(), 0);
  });

  const apply = () => {
    restoreRange();
    document.execCommand(cmd, false, inp.value);
    swatch.style.backgroundColor = inp.value;
    saveRange();
  };

  inp.addEventListener('input', apply);
  inp.addEventListener('change', apply);

  wrap.appendChild(text);
  wrap.appendChild(swatch);
  wrap.appendChild(inp);
  return wrap;
}

/* ── Build the toolbar DOM ────────────────────────────────────────────────── */

function buildToolbar(): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'rte-toolbar';
  bar.contentEditable = 'false';

  /* ── Format Block ── */
  const blockSel = makeSelect(
    'rte-block',
    [
      { v: 'p', label: 'Paragraph' },
      { v: 'h1', label: 'Heading 1' },
      { v: 'h2', label: 'Heading 2' },
      { v: 'h3', label: 'Heading 3' },
      { v: 'h4', label: 'Heading 4' },
      { v: 'blockquote', label: 'Quote' },
      { v: 'pre', label: 'Code' },
    ],
    'Format block',
    'rte-block-sel'
  );
  blockSel.addEventListener('mousedown', () => saveRange());
  blockSel.addEventListener('change', () =>
    exec('formatBlock', blockSel.value)
  );
  bar.appendChild(blockSel);

  /* ── Font Size ── */
  const sizeSel = makeSelect(
    'rte-size',
    [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72].map(n => ({
      v: String(n),
      label: n + 'px',
    })),
    'Font size',
    'rte-size-sel'
  );
  sizeSel.value = '14';
  sizeSel.addEventListener('mousedown', () => saveRange());
  sizeSel.addEventListener('change', () => {
    restoreRange();
    /* execCommand fontSize only supports 1-7; we apply px via span replacement */
    document.execCommand('fontSize', false, '7');
    _activeSpan?.querySelectorAll('font[size="7"]').forEach(el => {
      const span = document.createElement('span');
      span.style.fontSize = sizeSel.value + 'px';
      span.innerHTML = (el as HTMLElement).innerHTML;
      el.replaceWith(span);
    });
    saveRange();
  });
  bar.appendChild(sizeSel);

  bar.appendChild(makeSep());

  /* ── Inline formatting ── */
  bar.appendChild(makeBtn('bold', '<b>B</b>', 'Bold'));
  bar.appendChild(makeBtn('italic', '<i>I</i>', 'Italic'));
  bar.appendChild(makeBtn('underline', '<u>U</u>', 'Underline'));
  bar.appendChild(makeBtn('strikeThrough', '<s>S</s>', 'Strikethrough'));
  bar.appendChild(makeBtn('superscript', 'x<sup>²</sup>', 'Superscript'));
  bar.appendChild(makeBtn('subscript', 'x<sub>₂</sub>', 'Subscript'));

  bar.appendChild(makeSep());

  /* ── Colors ── */
  bar.appendChild(makeColorBtn('foreColor', 'A', 'Text Color', '#000000'));
  bar.appendChild(makeColorBtn('hiliteColor', '▌', 'Highlight', '#ffff00'));

  bar.appendChild(makeSep());

  /* ── Alignment ── */
  bar.appendChild(
    makeBtn(
      'justifyLeft',
      `<svg width="14" height="14" viewBox="0 0 14 14"><line x1="1" y1="3" x2="13" y2="3" stroke="currentColor" stroke-width="1.5"/><line x1="1" y1="6" x2="9" y2="6" stroke="currentColor" stroke-width="1.5"/><line x1="1" y1="9" x2="13" y2="9" stroke="currentColor" stroke-width="1.5"/><line x1="1" y1="12" x2="7" y2="12" stroke="currentColor" stroke-width="1.5"/></svg>`,
      'Align Left'
    )
  );
  bar.appendChild(
    makeBtn(
      'justifyCenter',
      `<svg width="14" height="14" viewBox="0 0 14 14"><line x1="1" y1="3" x2="13" y2="3" stroke="currentColor" stroke-width="1.5"/><line x1="3" y1="6" x2="11" y2="6" stroke="currentColor" stroke-width="1.5"/><line x1="1" y1="9" x2="13" y2="9" stroke="currentColor" stroke-width="1.5"/><line x1="4" y1="12" x2="10" y2="12" stroke="currentColor" stroke-width="1.5"/></svg>`,
      'Align Center'
    )
  );
  bar.appendChild(
    makeBtn(
      'justifyRight',
      `<svg width="14" height="14" viewBox="0 0 14 14"><line x1="1" y1="3" x2="13" y2="3" stroke="currentColor" stroke-width="1.5"/><line x1="5" y1="6" x2="13" y2="6" stroke="currentColor" stroke-width="1.5"/><line x1="1" y1="9" x2="13" y2="9" stroke="currentColor" stroke-width="1.5"/><line x1="7" y1="12" x2="13" y2="12" stroke="currentColor" stroke-width="1.5"/></svg>`,
      'Align Right'
    )
  );
  bar.appendChild(
    makeBtn(
      'justifyFull',
      `<svg width="14" height="14" viewBox="0 0 14 14"><line x1="1" y1="3" x2="13" y2="3" stroke="currentColor" stroke-width="1.5"/><line x1="1" y1="6" x2="13" y2="6" stroke="currentColor" stroke-width="1.5"/><line x1="1" y1="9" x2="13" y2="9" stroke="currentColor" stroke-width="1.5"/><line x1="1" y1="12" x2="13" y2="12" stroke="currentColor" stroke-width="1.5"/></svg>`,
      'Justify'
    )
  );

  bar.appendChild(makeSep());

  /* ── Lists & indent ── */
  bar.appendChild(
    makeBtn(
      'insertUnorderedList',
      `<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="2" cy="4" r="1.2" fill="currentColor"/><line x1="5" y1="4" x2="13" y2="4" stroke="currentColor" stroke-width="1.5"/><circle cx="2" cy="8" r="1.2" fill="currentColor"/><line x1="5" y1="8" x2="13" y2="8" stroke="currentColor" stroke-width="1.5"/><circle cx="2" cy="12" r="1.2" fill="currentColor"/><line x1="5" y1="12" x2="13" y2="12" stroke="currentColor" stroke-width="1.5"/></svg>`,
      'Bullet List'
    )
  );
  bar.appendChild(
    makeBtn(
      'insertOrderedList',
      `<svg width="14" height="14" viewBox="0 0 14 14"><text x="0" y="5" font-size="5" fill="currentColor">1.</text><line x1="5" y1="4" x2="13" y2="4" stroke="currentColor" stroke-width="1.5"/><text x="0" y="9.5" font-size="5" fill="currentColor">2.</text><line x1="5" y1="8" x2="13" y2="8" stroke="currentColor" stroke-width="1.5"/><text x="0" y="14" font-size="5" fill="currentColor">3.</text><line x1="5" y1="12" x2="13" y2="12" stroke="currentColor" stroke-width="1.5"/></svg>`,
      'Numbered List'
    )
  );
  bar.appendChild(makeBtn('outdent', '⇤', 'Decrease Indent'));
  bar.appendChild(makeBtn('indent', '⇥', 'Increase Indent'));

  bar.appendChild(makeSep());

  /* ── Link ── */
  bar.appendChild(
    makeBtn(
      '__link',
      `<svg width="14" height="14" viewBox="0 0 14 14"><path d="M5.5 8.5a3.5 3.5 0 0 0 4.95 0l1.5-1.5a3.5 3.5 0 0 0-4.95-4.95l-.86.85" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/><path d="M8.5 5.5a3.5 3.5 0 0 0-4.95 0L2.05 7a3.5 3.5 0 0 0 4.95 4.95l.85-.86" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>`,
      'Insert Link'
    )
  );
  bar.appendChild(makeBtn('unlink', '🔗×', 'Remove Link'));

  bar.appendChild(makeSep());

  /* ── Clear formatting ── */
  bar.appendChild(makeBtn('removeFormat', 'T×', 'Clear Formatting'));

  return bar;
}

/* ── Active-state sync ────────────────────────────────────────────────────── */

const STATEFUL_CMDS = [
  'bold',
  'italic',
  'underline',
  'strikeThrough',
  'superscript',
  'subscript',
  'justifyLeft',
  'justifyCenter',
  'justifyRight',
  'justifyFull',
  'insertUnorderedList',
  'insertOrderedList',
];

function updateStates(): void {
  if (!_toolbar) return;

  _toolbar
    .querySelectorAll<HTMLButtonElement>('.rte-btn[data-cmd]')
    .forEach(b => {
      const cmd = b.dataset.cmd ?? '';
      if (STATEFUL_CMDS.includes(cmd)) {
        try {
          b.classList.toggle('rte-active', document.queryCommandState(cmd));
        } catch {
          /* ignore */
        }
      }
    });

  /* Sync format-block select */
  try {
    const blockSel = document.getElementById(
      'rte-block'
    ) as HTMLSelectElement | null;
    if (blockSel) {
      const val = document
        .queryCommandValue('formatBlock')
        .toLowerCase()
        .replace(/[<>]/g, '');
      blockSel.value = val || 'p';
    }
  } catch {
    /* ignore */
  }
}

/* ── Public API ───────────────────────────────────────────────────────────── */

export function attachToolbar(span: HTMLElement): void {
  _activeSpan = span;

  if (!_toolbar) {
    _toolbar = buildToolbar();
    document.body.appendChild(_toolbar);

    document.addEventListener('selectionchange', () => {
      if (_activeSpan) {
        saveRange();
        updateStates();
      }
    });
  }

  _positionToolbar(span);
  _toolbar.style.display = 'flex';
  updateStates();
}

export function detachToolbar(relatedTarget: EventTarget | null): void {
  /* Keep the toolbar visible if focus moved onto it (e.g. clicked a select) */
  if (_toolbar && _toolbar.contains(relatedTarget as Node)) return;
  if (_toolbar) _toolbar.style.display = 'none';
  _activeSpan = null;
}

export function repositionToolbar(span: HTMLElement): void {
  _positionToolbar(span);
}

function _positionToolbar(span: HTMLElement): void {
  if (!_toolbar) return;
  const anchor = (span.closest('.text-component') as HTMLElement) ?? span;
  const rect = anchor.getBoundingClientRect();
  const barH = _toolbar.offsetHeight || 38;
  let top = rect.top - barH - 6;
  let left = rect.left;

  /* If not enough room above, place below */
  if (top < 4) top = rect.bottom + 6;

  /* Clamp horizontally */
  const maxLeft = window.innerWidth - (_toolbar.offsetWidth || 500) - 8;
  left = Math.max(4, Math.min(left, maxLeft));

  _toolbar.style.top = top + 'px';
  _toolbar.style.left = left + 'px';
}
