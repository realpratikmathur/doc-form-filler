// PDF filling helpers. Every value we write is a real, EDITABLE PDF form field:
//  - on fillable government PDFs (e.g. FMLA WH-380-E) we fill the form's own fields;
//  - on flat PDFs (e.g. MetroAccess Part B, DC DDS) we ADD new text fields / checkboxes on top
//    of the printed blanks, so the doctor can click into any box in Chrome's PDF viewer (or
//    Acrobat) and change it before printing or saving.
import { PDFDocument, StandardFonts, rgb, PDFName, PDFTextField } from 'pdf-lib';

const BLUE = rgb(0.05, 0.2, 0.6);
const MIN_FONT = 7;            // never shrink text below this; overflow goes to a continuation page
const MORE = ' … (see continuation page)';

export class Filler {
  static async open(templateBytes, formId) {
    const pdf = await PDFDocument.load(templateBytes);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    return new Filler(pdf, font, formId);
  }

  constructor(pdf, font, formId) {
    this.pdf = pdf; this.font = font; this.formId = formId;
    this.form = pdf.getForm();
    this.rows = [];        // what was filled, from where — shown to the doctor for review
    this.names = new Set();
    this.continued = [];   // [{label, text}] — text too long for its box, printed in full on an added page
    this.header = '';      // shown at the top of continuation pages (form + patient)
  }

  /** Record a value for the review list. source: 'chart' | 'ai' | 'settings' | 'doctor' */
  record(label, value, source, { optional = false } = {}) {
    const v = Array.isArray(value) ? value.filter(Boolean).join('; ') : value == null ? '' : String(value);
    // "missing" = blank and expected; optional = blank is fine (unused list slot, not applicable)
    this.rows.push({ label, value: v, source, missing: source !== 'doctor' && !optional && !v });
  }

  // ---------- fields that already exist in the PDF ----------
  setText(name, value, { label = name, source, overflowInto, optional } = {}) {
    const tf = this.form.getTextField(name);
    let text = value == null ? '' : String(value);
    const r = tf.acroField.getWidgets()[0].getRectangle();
    const W = r.width - 4, H = r.height;
    let size = 9;
    if (H >= 28) {
      tf.enableMultiline();
      const fit = this.#fitBox(text, label, W, H, 9);
      text = fit.text; size = fit.size;
    } else if (this.font.widthOfTextAtSize(text, size) > W) {
      if (overflowInto) {
        const words = text.split(' '); let head = '';
        while (words.length && this.font.widthOfTextAtSize(`${head} ${words[0]}`.trim(), size) <= W) head = `${head} ${words.shift()}`.trim();
        const rest = words.join(' ');
        const of = this.form.getTextField(overflowInto);
        const rr = of.acroField.getWidgets()[0].getRectangle();
        const fit = this.#fitLine(rest, label, rr.width - 4, 9);
        of.setText(fit.text); of.setFontSize(fit.size);
        text = head;
      } else {
        const fit = this.#fitLine(text, label, W, 9);
        text = fit.text; size = fit.size;
      }
    }
    tf.setText(text);
    tf.setFontSize(size);
    this.record(label, value, source, { optional });
  }

  /** Choose one option on a radio group OR a multi-widget checkbox (each widget has its own on-state). */
  choose(name, option, { label = name, source, optional } = {}) {
    const af = this.form.getField(name).acroField;
    let hit = false;
    for (const w of af.getWidgets()) {
      const on = w.getOnValue();
      const onName = on ? (on.decodeText ? on.decodeText() : String(on).replace(/^\//, '')) : '';
      const match = option != null && onName === option;
      w.setAppearanceState(match ? on : PDFName.of('Off'));
      if (match) { af.dict.set(PDFName.of('V'), on); hit = true; }
    }
    if (!hit) af.dict.set(PDFName.of('V'), PDFName.of('Off'));
    this.record(label, hit ? option : '', source, { optional });
  }

  /**
   * Some government PDFs put two questions' boxes in ONE field (e.g. WH-380-F "The patient" holds both
   * "has been / is expected to be" and "was / will be"). Tick one widget per question independently.
   * picks = [{ option, label, source, optional }]; an option of '' / null leaves that question unticked.
   */
  chooseEach(name, picks) {
    const af = this.form.getField(name).acroField;
    const wanted = new Set(picks.map(p => p.option).filter(Boolean));
    let first = null;
    for (const w of af.getWidgets()) {
      const on = w.getOnValue();
      const onName = on ? (on.decodeText ? on.decodeText() : String(on).replace(/^\//, '')) : '';
      const match = wanted.has(onName);
      w.setAppearanceState(match ? on : PDFName.of('Off'));
      if (match && !first) first = on;
    }
    af.dict.set(PDFName.of('V'), first || PDFName.of('Off'));
    for (const p of picks) this.record(p.label, p.option || '', p.source, { optional: p.optional });
  }

  check(name, on, { label = name, source } = {}) {
    const cb = this.form.getCheckBox(name);
    on ? cb.check() : cb.uncheck();
    this.record(label, on == null ? '' : on ? 'Yes' : 'No', source);
  }

  /** Find an existing field by regex on its full name (some government field names are very long). */
  fieldName(re) {
    const f = this.form.getFields().find(x => re.test(x.getName()));
    if (!f) throw new Error(`Field ${re} not found in template`);
    return f.getName();
  }

  // ---------- NEW editable fields placed on flat pages ----------
  /**
   * Add an editable text box. (x, y) is the bottom-left corner in PDF points (1/72 inch).
   * Single-line boxes shrink the font to fit; multiline boxes wrap and shrink.
   */
  addText(pageNo, x, y, width, height, value, { label, source, size = 9, multiline = height >= 20, optional, minSize = MIN_FONT } = {}) {
    const fit = multiline ? this.#fitBox(value == null ? '' : String(value), label, width - 4, height, size, minSize)
      : this.#fitLine(value == null ? '' : String(value), label, width - 4, size, minSize);
    const tf = this.form.createTextField(this.#uniqueName(label));
    tf.setText(fit.text);
    if (multiline) tf.enableMultiline();
    tf.addToPage(this.pdf.getPage(pageNo - 1), { x, y, width, height, font: this.font, textColor: BLUE, backgroundColor: undefined, borderColor: undefined, borderWidth: 0 });
    tf.setFontSize(fit.size);
    this.record(label, value, source, { optional });
  }

  /**
   * Text that should sit on a form's printed rule lines: one editable field per printed line.
   * baselines = y of each printed line (top to bottom). Text wraps across them; font shrinks to fit.
   */
  addLines(pageNo, x, baselines, width, value, { label, source, size = 9, optional } = {}) {
    const { lines, size: s } = this.#fitLines(value == null ? '' : String(value), label, width - 4, baselines.length, size);
    baselines.forEach((y, i) => {
      const tf = this.form.createTextField(this.#uniqueName(`${label} line ${i + 1}`));
      tf.setText(lines[i] || '');
      tf.addToPage(this.pdf.getPage(pageNo - 1), { x, y: y + 0.5, width, height: s + 4, font: this.font, textColor: BLUE, backgroundColor: undefined, borderColor: undefined, borderWidth: 0 });
      tf.setFontSize(s);
    });
    this.record(label, value, source, { optional });
  }

  /** Add an editable checkbox over a printed box/blank. (x, y) = bottom-left. */
  addCheck(pageNo, x, y, on, { label, source, size = 10, recordAs } = {}) {
    const cb = this.form.createCheckBox(this.#uniqueName(label));
    cb.addToPage(this.pdf.getPage(pageNo - 1), { x, y, width: size, height: size, textColor: BLUE, backgroundColor: undefined, borderColor: undefined, borderWidth: 0 });
    if (on) cb.check();
    if (recordAs !== false) this.record(label, recordAs ?? (on ? 'Yes' : 'No'), source);
  }

  async save() {
    if (this.continued.length) await this.#addContinuationPages();
    // Redraw only text boxes. The government PDFs' own checkboxes keep their original drawings: letting
    // pdf-lib regenerate them adds a default box slightly offset from the printed one (double edges).
    for (const f of this.form.getFields()) if (f instanceof PDFTextField) f.updateAppearances(this.font);
    return this.pdf.save({ updateFieldAppearances: false });   // NOT flattened: fields stay editable
  }

  // ---------- fitting text, with a continuation page instead of unreadable or lost text ----------
  /** Wrap into at most n lines, shrinking to MIN_FONT; beyond that, truncate and continue later. */
  #fitLines(text, label, width, n, size, min = MIN_FONT) {
    let s = size, lines = this.#wrap(text, s, width);
    while (lines.length > n && s > min) { s = Math.max(min, s - 0.25); lines = this.#wrap(text, s, width); }
    if (lines.length <= n) return { lines, size: s };
    this.continued.push({ label, text });
    const kept = lines.slice(0, n);
    let last = kept[n - 1];
    while (last && this.font.widthOfTextAtSize(last + MORE, s) > width) last = last.split(' ').slice(0, -1).join(' ');
    kept[n - 1] = (last || '') + MORE;
    return { lines: kept, size: s };
  }

  /** Multiline box of a given height: like #fitLines, with the line count derived from the height. */
  #fitBox(text, label, width, height, size, min = MIN_FONT) {
    let s = size;
    while (s > min && this.#lineCount(text, s, width) * s * 1.17 > height - 2) s = Math.max(min, s - 0.25);
    const n = Math.max(1, Math.floor((height - 2) / (s * 1.17)));
    const { lines, size: fs } = this.#fitLines(text, label, width, n, s, min);
    return { text: lines.join(' '), size: fs };
  }

  /** Single line: shrink to MIN_FONT, then truncate and continue later. */
  #fitLine(text, label, width, size, min = MIN_FONT) {
    let s = size;
    while (s > min && this.font.widthOfTextAtSize(text, s) > width) s = Math.max(min, s - 0.25);
    if (this.font.widthOfTextAtSize(text, s) <= width) return { text, size: s };
    this.continued.push({ label, text });
    let t = text;
    while (t && this.font.widthOfTextAtSize(t + MORE, s) > width) t = t.split(' ').slice(0, -1).join(' ');
    return { text: (t || '') + MORE, size: s };
  }

  async #addContinuationPages() {
    const bold = await this.pdf.embedFont(StandardFonts.HelveticaBold);
    const W = 540, X = 36, SIZE = 9, LEAD = SIZE * 1.2;
    let page = null, y = 0, n = 0;
    const newPage = () => {
      page = this.pdf.addPage([612, 792]); n++;
      page.drawText(`Continuation page${n > 1 ? ` ${n}` : ''}`, { x: X, y: 750, size: 13, font: bold });
      if (this.header) page.drawText(this.header, { x: X, y: 733, size: 9, font: this.font });
      y = 712;
    };
    newPage();
    for (const { label, text } of this.continued) {
      const wrapped = String(text).split(/\n+/).flatMap(par => this.#wrap(par, SIZE, W - 16));
      const h = wrapped.length * LEAD + 8;
      if (y - 14 - h < 40) newPage();
      page.drawText(`${label} (continued)`, { x: X, y, size: 10, font: bold });
      y -= 6;
      const tf = this.form.createTextField(this.#uniqueName(`${label} continued`));
      tf.setText(wrapped.join('\n'));
      tf.enableMultiline();
      tf.addToPage(page, { x: X, y: y - h, width: W, height: h, font: this.font, textColor: BLUE, backgroundColor: undefined, borderColor: rgb(0.75, 0.78, 0.82), borderWidth: 0.5 });
      tf.setFontSize(SIZE);
      y -= h + 18;
    }
  }

  #wrap(text, size, width) {
    const out = []; let cur = '';
    for (const w of text.split(/\s+/).filter(Boolean)) {
      const t = cur ? `${cur} ${w}` : w;
      if (this.font.widthOfTextAtSize(t, size) > width && cur) { out.push(cur); cur = w; } else cur = t;
    }
    if (cur) out.push(cur);
    return out;
  }

  #lineCount(text, size, width) {
    let n = 1, cur = '';
    for (const w of text.split(/\s+/)) {
      const t = cur ? `${cur} ${w}` : w;
      if (this.font.widthOfTextAtSize(t, size) > width && cur) { n++; cur = w; } else cur = t;
    }
    return n;
  }

  #uniqueName(label) {
    const base = `${this.formId}.${String(label).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 50) || 'field'}`;
    let name = base, i = 2;
    while (this.names.has(name)) name = `${base}_${i++}`;
    this.names.add(name);
    return name;
  }
}

// ---------- small formatting helpers shared by the form modules ----------
export const us = iso => (iso ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}` : '');
export const fullName = p => [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' ');
export const phone = s => { const d = String(s || '').replace(/\D/g, ''); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : (s || ''); };
const titleCase = s => String(s || '').replace(/\b([a-z])/g, c => c.toUpperCase());

/** Provider identity: Practice Fusion data, with optional overrides from the Options page. */
export function providerInfo(chart, settings) {
  const pv = chart.provider;
  const name = settings.providerName || pv.name;
  return {
    name,
    nameWithCreds: settings.credentials ? `${name}, ${settings.credentials}` : name,
    practice: pv.practice,
    street: titleCase([pv.address1, pv.address2].filter(Boolean).join(', ')),
    cityStateZip: `${titleCase(pv.city)}, ${pv.state} ${pv.zip}`.trim(),
    phone: phone(settings.phoneOverride || pv.phone),
    email: pv.email,
    fax: settings.fax,
    specialty: settings.specialty,
    license: settings.licenseNumber,
    npi: settings.npi,
  };
}
