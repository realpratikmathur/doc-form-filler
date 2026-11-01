// PDF filling helpers. Every value we write is a real, EDITABLE PDF form field:
//  - on fillable government PDFs (e.g. FMLA WH-380-E) we fill the form's own fields;
//  - on flat PDFs (e.g. MetroAccess Part B, DC DDS) we ADD new text fields / checkboxes on top
//    of the printed blanks, so the doctor can click into any box in Chrome's PDF viewer (or
//    Acrobat) and change it before printing or saving.
import { PDFDocument, StandardFonts, rgb, PDFName } from 'pdf-lib';

const BLUE = rgb(0.05, 0.2, 0.6);

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
      while (size > 6 && this.#lineCount(text, size, W) * size * 1.15 > H - 2) size -= 0.5;
    } else if (this.font.widthOfTextAtSize(text, size) > W) {
      if (overflowInto) {
        const words = text.split(' '); let head = '';
        while (words.length && this.font.widthOfTextAtSize(`${head} ${words[0]}`.trim(), size) <= W) head = `${head} ${words.shift()}`.trim();
        this.form.getTextField(overflowInto).setText(words.join(' '));
        text = head;
      }
      while (size > 6 && this.font.widthOfTextAtSize(text, size) > W) size -= 0.25;
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
  addText(pageNo, x, y, width, height, value, { label, source, size = 9, multiline = height >= 20, optional } = {}) {
    const text = value == null ? '' : String(value);
    const tf = this.form.createTextField(this.#uniqueName(label));
    tf.setText(text);
    if (multiline) tf.enableMultiline();
    let s = size;
    if (multiline) while (s > 5.5 && this.#lineCount(text, s, width - 4) * s * 1.17 > height - 2) s -= 0.25;
    else while (s > 5.5 && this.font.widthOfTextAtSize(text, s) > width - 4) s -= 0.25;
    tf.addToPage(this.pdf.getPage(pageNo - 1), { x, y, width, height, font: this.font, textColor: BLUE, backgroundColor: undefined, borderColor: undefined, borderWidth: 0 });
    tf.setFontSize(s);
    this.record(label, value, source, { optional });
  }

  /**
   * Text that should sit on a form's printed rule lines: one editable field per printed line.
   * baselines = y of each printed line (top to bottom). Text wraps across them; font shrinks to fit.
   */
  addLines(pageNo, x, baselines, width, value, { label, source, size = 9, optional } = {}) {
    const text = value == null ? '' : String(value);
    let s = size, lines;
    for (; s >= 6; s -= 0.25) { lines = this.#wrap(text, s, width - 4); if (lines.length <= baselines.length) break; }
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
    this.form.updateFieldAppearances(this.font);
    return this.pdf.save();   // NOT flattened: fields stay editable
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
