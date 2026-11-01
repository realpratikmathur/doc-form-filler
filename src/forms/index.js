// Registry of supported forms. To add a form: create a module like fmla-wh380e.js (fillable PDF)
// or metroaccess.js (flat PDF), then list it here. `npm run build` downloads each template.
import fmlaWh380e from './fmla-wh380e.js';
import fmlaWh380f from './fmla-wh380f.js';
import metroaccess from './metroaccess.js';
import ddsMedeval from './dds-medeval.js';

export const FORMS = [fmlaWh380e, fmlaWh380f, metroaccess, ddsMedeval];
export const formById = id => FORMS.find(f => f.id === id);
