// Shared by every AI provider: describe a form's questions for a prompt, and clean up whatever comes
// back so the form code always receives the expected shape:
//   text → string ("" = not documented), choice → one of the allowed values or "",
//   yes/no → boolean, list → array of strings (only allowed values when the list has choices).

export function normalizeAnswers(fields, raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = {};
  for (const [k, f] of Object.entries(fields)) {
    const v = src[k];
    if (f.enum) {
      const s = typeof v === 'string' ? v.trim() : '';
      out[k] = f.enum.find(e => e.toLowerCase() === s.toLowerCase()) || '';
    } else if (f.type === 'boolean') {
      out[k] = v === true || (typeof v === 'string' && /^(true|yes)$/i.test(v.trim()));
    } else if (f.type === 'array') {
      const arr = Array.isArray(v) ? v : typeof v === 'string' && v.trim() ? v.split(/;\s*/) : [];
      const strings = arr.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim());
      out[k] = f.itemsEnum ? [...new Set(strings.map(x => f.itemsEnum.find(e => e.toLowerCase() === x.toLowerCase())).filter(Boolean))] : strings;
    } else {
      out[k] = v == null || /^(null|none|not documented|unknown)$/i.test(String(v).trim()) ? '' : String(v).trim();
    }
  }
  return out;
}

/** Plain-language field list + an example object, for providers without schema enforcement. */
export function describeFields(fields) {
  const lines = [], example = {};
  for (const [k, f] of Object.entries(fields)) {
    if (f.enum) { lines.push(`- "${k}" (one of ${f.enum.map(e => JSON.stringify(e)).join(', ')}, or "" if not documented): ${f.description}`); example[k] = f.enum[0]; }
    else if (f.type === 'boolean') { lines.push(`- "${k}" (true or false; false if not documented): ${f.description}`); example[k] = false; }
    else if (f.type === 'array') { lines.push(`- "${k}" (list of strings${f.itemsEnum ? ` chosen from ${f.itemsEnum.map(e => JSON.stringify(e)).join(', ')}` : ''}; [] if none): ${f.description}`); example[k] = []; }
    else { lines.push(`- "${k}" (text; "" if not documented): ${f.description}`); example[k] = ''; }
  }
  return { lines: lines.join('\n'), example: JSON.stringify(example) };
}
