/** Focused reproduction of the Settings-modal collapse. */
import { chromium } from 'playwright-core';

const APP_URL = 'http://localhost:3000';
const EMAIL = `debug_modal_${Date.now() % 100000}@example.com`;
const PASSWORD = 'AuditPass123!';

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
});
const ctx = await browser.newContext({ viewport: { width: 1366, height: 850 } });
await ctx.addInitScript(() => localStorage.setItem('theme', 'light'));
const page = await ctx.newPage();
page.setDefaultTimeout(30000);

// Signup + onboarding
await page.goto(`${APP_URL}/signup`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('input[placeholder="Alex Johnson"]', { timeout: 20000 });
await page.fill('input[placeholder="Alex Johnson"]', 'Debug Modal Student');
await page.fill('input[type="email"]', EMAIL);
const pw = page.locator('input[type="password"]');
await pw.nth(0).fill(PASSWORD);
await pw.nth(1).fill(PASSWORD);
await page.click('button[type="submit"]');
try {
  await page.waitForURL(/onboarding/, { timeout: 25000 });
} catch {
  await page.screenshot({ path: 'scripts/ui-shots/debug-signup-stuck.png' });
  console.error('signup stuck at', page.url());
  console.error(await page.locator('.text-rose-300, [role="alert"], .text-red-400').allTextContents().catch(() => ''));
  throw new Error('signup did not reach onboarding');
}
await page.waitForSelector('select', { timeout: 20000 });
await page.selectOption('select >> nth=0', { index: 1 });
await page.selectOption('select >> nth=1', { index: 1 });
await page.fill('input[placeholder="e.g. Class 12, Grade 11"]', 'Class 12');
await page.fill('input[placeholder="Mathematics, Physics, Chemistry"]', 'Mathematics, Physics');
await page.click('button[type="submit"]');
await page.waitForURL(/ai/, { timeout: 20000 });
await page.waitForTimeout(1500);

// Open modal on the AI page (intel tab)
await page.click('button[title="Settings & Profile"]');
await page.waitForSelector('[role="dialog"][aria-modal="true"]');
await page.waitForTimeout(800);

const dump = async (label) => {
  const info = await page.evaluate(() => {
    const overlay = document.querySelector('[role="dialog"][aria-modal="true"]');
    if (!overlay) return { gone: true };
    const modal = overlay.firstElementChild;
    const mr = modal.getBoundingClientRect();
    const or = overlay.getBoundingClientRect();
    const chain = [];
    let node = overlay;
    while (node && node !== document.body) {
      const cs = getComputedStyle(node);
      chain.push({
        tag: node.tagName,
        cls: (typeof node.className === 'string' ? node.className : '').slice(0, 90),
        position: cs.position,
        transform: cs.transform === 'none' ? undefined : cs.transform,
        filter: cs.filter === 'none' ? undefined : cs.filter,
        backdropFilter: cs.backdropFilter === 'none' ? undefined : cs.backdropFilter,
        willChange: cs.willChange === 'auto' ? undefined : cs.willChange,
        contain: cs.contain === 'none' ? undefined : cs.contain,
        containIntrinsic: css_plain_or_undef(node),
        h: Math.round(node.getBoundingClientRect().height),
      });
      node = node.parentElement;
    }
    function css_plain_or_undef(n) {
      const s = getComputedStyle(n);
      return s.containIntrinsicSize && s.containIntrinsicSize !== 'none' ? s.containIntrinsicSize : undefined;
    }
    const parts = [...modal.children].map((c) => {
      const r = c.getBoundingClientRect();
      const cs = getComputedStyle(c);
      return { h: Math.round(r.height), cls: c.className.slice(0, 80), ov: cs.overflowY, flex: cs.flex };
    });
    return {
      overlayRect: { top: Math.round(or.top), h: Math.round(or.height), pos: getComputedStyle(overlay).position },
      modalRect: { top: Math.round(mr.top), h: Math.round(mr.height), maxHeight: getComputedStyle(modal).maxHeight, display: getComputedStyle(modal).display },
      containingFound: chain.filter((c) => c.transform || c.filter || c.backdropFilter || c.willChange || c.contain),
      chain,
      parts,
      bodyOverflow: document.body.style.overflow,
      scrollY: scrollY,
      viewport: { w: innerWidth, h: innerHeight, dvhCss: CSS.supports('height', '100dvh') },
    };
  });
  console.log(`--- ${label} ---`);
  console.log(JSON.stringify(info, null, 1));
};

await dump('after open, t+0.8s');
await page.screenshot({ path: 'scripts/ui-shots/debug-modal-1.png' });
await page.waitForTimeout(1500);
await dump('after open, t+2.3s');
await page.screenshot({ path: 'scripts/ui-shots/debug-modal-2.png' });

await browser.close();
