// Shared helper for dev scripts: launch Chromium (optionally with the built extension), and log in
// to Practice Fusion, handling the texted security code.
import { createRequire } from 'node:module';
import { readFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function launch({ extensionDir } = {}) {
  const profile = process.env.PF_PROFILE_DIR || path.join(root, '.cache', 'e2e-profile');
  mkdirSync(profile, { recursive: true });
  return chromium.launchPersistentContext(profile, {
    headless: !process.env.HEADED,
    channel: 'chromium',
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: extensionDir ? [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`] : [],
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}),
  });
}

/** Log in on `page`. Returns true when the EHR home loads. `onLoginPage` lets callers screenshot the login form. */
export async function login(page, { onLoginPage } = {}) {
  const codeFile = process.env.PF_CODE_FILE || path.join(root, '.cache', 'pf-code.txt');
  await page.goto('https://static.practicefusion.com/apps/ehr/index.html#/PF/home/main', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  if (await page.locator('#inputUsername').isVisible().catch(() => false)) {
    if (onLoginPage) await onLoginPage(page);
    if (!process.env.PF_EMAIL || !process.env.PF_PASSWORD) throw new Error('Set PF_EMAIL and PF_PASSWORD.');
    await page.fill('#inputUsername', process.env.PF_EMAIL);
    await page.fill('#inputPswd', process.env.PF_PASSWORD);
    await page.click('#loginButton');
    await page.waitForTimeout(10000);
  }
  if (/securitycheck/.test(page.url()) && process.env.PF_CODE) {
    // A code was already texted for this login attempt: go straight to the code-entry screen.
    await page.evaluate(() => { location.hash = '#/login/securitycode'; });
    await page.waitForTimeout(3000);
    if (await page.locator('#code').isVisible().catch(() => false)) {
      await page.fill('#code', process.env.PF_CODE);
      await page.click('#sendCodeButton');
      await page.waitForTimeout(12000);
    }
  }
  if (/securitycheck/.test(page.url())) {
    rmSync(codeFile, { force: true });
    await page.getByRole('button', { name: /send code/i }).click();
    console.log(`Practice Fusion texted a security code. Write it into ${codeFile} (waiting up to 15 minutes)…`);
    let code = '';
    for (let i = 0; i < 450 && !code; i++) { await sleep(2000); if (existsSync(codeFile)) code = readFileSync(codeFile, 'utf8').trim(); }
    if (!code) throw new Error('No security code received.');
    await page.fill('#code', code);   // "Always trust this browser" is checked by default
    await page.click('#sendCodeButton');
    await page.waitForTimeout(12000);
  }
  return /#\/PF\//.test(page.url());
}

/** fetch() inside the logged-in Practice Fusion page, with the same headers the EHR uses. */
export function pfApi(page) {
  return (method, url, body) => page.evaluate(async ({ method, url, body }) => {
    const g = k => (sessionStorage.getItem(k) || '').replace(/^"|"$/g, '');
    const r = await fetch(url, { method, headers: { authorization: g('sessionGUID'), 'x-ehr-user-guid': g('userGuid'), 'x-practice-guid': g('practiceGuid'), 'content-type': 'application/json', accept: 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
    return { status: r.status, body: j };
  }, { method, url, body });
}
