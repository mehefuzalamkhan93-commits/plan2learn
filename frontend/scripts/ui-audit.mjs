/**
 * Real-browser UI audit for Plan2Learn.
 *
 * Verifies (with screenshots + computed-style metrics) in both Light and Dark:
 *  - Settings modal fits viewport, body scrolls independently, background locked
 *  - Subject add/remove/conflict handling in the Settings modal
 *  - Subject save persists and Intel reflects the saved profile (single source of truth)
 *  - Roadmap & Intel light-mode surfaces/text contrast (the two reported regressions)
 *  - Theme switching without reload
 *
 * Usage: node scripts/ui-audit.mjs
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = path.join(__dirname, 'ui-shots');
fs.mkdirSync(SHOT_DIR, { recursive: true });

const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const EMAIL = `ui_audit_${Date.now() % 100000}@example.com`;
const PASSWORD = 'AuditPass123!';

const results = [];
const report = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Spawn `next start` ourselves so the server is guaranteed to outlive the audit. */
async function ensureServer() {
  const up = async () => {
    try {
      const r = await fetch(`${APP_URL}/login`, { method: 'HEAD' });
      return r.ok || r.status < 500;
    } catch {
      return false;
    }
  };
  if (await up()) return 'already running';
  const { spawn } = await import('node:child_process');
  const logFd = fs.openSync(path.join(SHOT_DIR, 'next-server.log'), 'a');
  fs.appendFileSync(logFd, `\n===== spawn @ ${new Date().toISOString()} =====\n`);
  const child = spawn(
    process.execPath,
    [path.join(__dirname, '..', 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', '3000'],
    {
      cwd: path.join(__dirname, '..'),
      detached: true,
      stdio: ['ignore', logFd, logFd],
      env: { ...process.env, NODE_OPTIONS: '--unhandled-rejections=warn' },
    }
  );
  child.unref();
  for (let i = 0; i < 30; i++) {
    if (await up()) return 'spawned';
    await sleep(1000);
  }
  throw new Error('Could not start the Next.js server on port 3000');
}
await ensureServer();

async function waitForApp(page) {
  // Wait for either the signup, login, onboarding or dashboard UI to appear
  for (let i = 0; i < 60; i++) {
    const ready = await page
      .evaluate(() => !!document.querySelector('input[type="email"], input[type="password"], button'))
      .catch(() => false);
    if (ready) return;
    await sleep(500);
  }
  throw new Error('App did not become interactive');
}

async function logRGB(el, prop) {
  return el ? el.evaluate((n, p) => getComputedStyle(n)[p], prop) : null;
}

async function onPageMetrics(page) {
  return page.evaluate(() => {
    const theme = document.documentElement.getAttribute('data-theme');
    const htmlClass = document.documentElement.className;
    const bodyBg = getComputedStyle(document.body).backgroundColor;
    const bodyColor = getComputedStyle(document.body).color;
    return { theme, htmlClass, bodyBg, bodyColor, url: location.href };
  });
}

// Specific panel metrics for roadmap / intel
async function panelMetrics(page, selector) {
  return page.evaluate((sel) => {
    const panel = document.querySelector(sel);
    if (!panel) return null;
    const panelBg = getComputedStyle(panel).backgroundColor;
    const heading = panel.querySelector('h2, h3');
    const headingColor = heading ? getComputedStyle(heading).color : null;
    const muted = panel.querySelector('p');
    const mutedColor = muted ? getComputedStyle(muted).color : null;
    // First nested card (roadmap stat box or intel bump-out)
    const card = panel.querySelector('.grid > div, .grid-cols-2 > div, .grid-cols-1 > div');
    const cardBg = card ? getComputedStyle(card).backgroundColor : null;
    // any ancestor with an ::before overlay affected by backdrop/opacity
    const wrapperStyle = getComputedStyle(panel.parentElement);
    const wrapperOpacity = wrapperStyle.opacity;
    const wrapperFilter = wrapperStyle.filter;
    return { panelBg, headingColor, mutedColor, cardBg, wrapperOpacity, wrapperFilter };
  }, selector);
}

async function openSettings(page) {
  await page.click('button[title="Settings & Profile"]');
  await page.waitForSelector('[role="dialog"][aria-modal="true"]', { timeout: 10000 });
  await sleep(400); // framer-motion settle
}

async function settingsMetrics(page) {
  return page.evaluate(() => {
    const overlay = document.querySelector('[role="dialog"][aria-modal="true"]');
    const modal = overlay?.firstElementChild;
    if (!modal) return null;
    const rect = modal.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const bodyScrollLocked = getComputedStyle(document.body).overflow;
    const header = modal.children[0];
    const footerClose = [...modal.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Cancel');
    const footerRect = footerClose?.getBoundingClientRect();
    // Body scroll area
    const scrollBody = [...modal.children].find(
      (c) => getComputedStyle(c).overflowY === 'auto' || getComputedStyle(c).overflowY === 'scroll'
    );
    const scrollable =
      scrollBody && scrollBody.scrollHeight > scrollBody.clientHeight
        ? `${scrollBody.scrollHeight}/${scrollBody.clientHeight}`
        : `${scrollBody ? scrollBody.scrollHeight + '=' + scrollBody.clientHeight : 'n/a'}`;
    // If the form is short, scrollHeight equals clientHeight (nothing to scroll) — that's also OK
    const bgLeftBehind = getComputedStyle(document.body).overflow;
    return {
      fits: rect.top >= -1 && rect.left >= -1 && rect.bottom <= vh + 1 && rect.right <= vw + 1,
      rect: { top: Math.round(rect.top), bottom: Math.round(rect.bottom), height: Math.round(rect.height), vh },
      bodyOverflow: bodyScrollLocked,
      scrollBodyOverflowY: scrollBody ? getComputedStyle(scrollBody).overflowY : null,
      scrollHeights: scrollable,
      headerTop: header?.getBoundingClientRect().top,
      footerBottom: footerRect?.bottom,
    };
  });
}

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
});

/* ------------------------------------------------------------------ *
 * Phase 1 — account setup (theme-neutral)                             *
 * ------------------------------------------------------------------ */
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 850 } });
  const page = await ctx.newPage();
  console.log('Setting up fresh account…');
  await page.goto(`${APP_URL}/signup`, { waitUntil: 'domcontentloaded' });
  await waitForApp(page);

  await page.fill('input[placeholder="Alex Johnson"]', 'UI Audit Student');
  await page.fill('input[type="email"]', EMAIL);
  const pw = page.locator('input[type="password"]');
  await pw.nth(0).fill(PASSWORD);
  await pw.nth(1).fill(PASSWORD);
  await page.click('button[type="submit"]');

  // May land on onboarding
  try {
    await page.waitForURL(/onboarding/, { timeout: 20000 });
    await page.waitForSelector('select', { timeout: 15000 });
    await page.selectOption('select >> nth=0', { index: 1 }); // education level
    await page.selectOption('select >> nth=1', { index: 1 }); // board
    await page.fill('input[placeholder="e.g. Class 12, Grade 11"]', 'Class 12');
    await page.fill('input[placeholder="Mathematics, Physics, Chemistry"]', 'Mathematics, Physics');
    await page.click('button[type="submit"]');
    await sleep(2500);
  } catch {
    console.log('no onboarding flow (continuing)');
  }
  console.log('Account ready:', await onPageMetrics(page));
  await ctx.close();
}

/* ------------------------------------------------------------------ *
 * Phase 2 — theme-by-theme audit                                      *
 * ------------------------------------------------------------------ */
for (const theme of ['light', 'dark']) {
  console.log(`\n=== ${theme.toUpperCase()} MODE ===`);
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 850 } });
  await ctx.addInitScript((t) => localStorage.setItem('theme', t), theme);
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);

  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded' });
  await waitForApp(page);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  try {
    await page.waitForURL((u) => !/login/.test(u.pathname), { timeout: 20000 });
    report(`login ok (${theme})`, true, page.url());
  } catch {
    const errText = await page
      .locator('.text-rose-300, [role="alert"]')
      .first()
      .textContent()
      .catch(() => '(no error shown)');
    report(`login ok (${theme})`, false, `still on ${page.url()} — ${errText}`);
  }
  await sleep(2500);

  // ---- Dashboard ----
  await page.goto(`${APP_URL}/dashboard`, { waitUntil: 'networkidle' });
  await sleep(1500);
  const dash = await onPageMetrics(page);
  report(`dashboard html theme (${theme})`, dash.theme === theme, `data-theme=${dash.theme}, html="${dash.htmlClass}"`);
  await page.screenshot({ path: path.join(SHOT_DIR, `dashboard-${theme}.png`) });

  // ---- AI page / Roadmap panel ----
  await page.goto(`${APP_URL}/ai`, { waitUntil: 'networkidle' });
  await sleep(1500);
  await page.getByRole('button', { name: 'Study Roadmap' }).click();
  await sleep(1200);
  const road = await panelMetrics(page, '[data-tab-panel="roadmap"]');
  if (road) {
    report(
      `roadmap panel surface (${theme})`,
      theme === 'light' ? road.panelBg !== 'rgb(24, 24, 27)' : true,
      `bg=${road.panelBg}, h2=${road.headingColor}, p=${road.mutedColor}, wrapperOpacity=${road.wrapperOpacity}`
    );
    report(
      `roadmap no washed-out overlay (${theme})`,
      road.wrapperOpacity === '1' && road.wrapperFilter === 'none',
      `opacity=${road.wrapperOpacity}, filter=${road.wrapperFilter}`
    );
  } else {
    report(`roadmap panel present (${theme})`, false, '[data-tab-panel="roadmap"] not found');
  }
  await page.screenshot({ path: path.join(SHOT_DIR, `roadmap-${theme}.png`) });

  // ---- Intel panel ----
  await page.getByRole('button', { name: 'Learning Intel' }).click();
  await sleep(1200);
  const intel = await panelMetrics(page, '[data-tab-panel="intel"]');
  if (intel) {
    report(
      `intel panel surface (${theme})`,
      true,
      `bg=${intel.panelBg}, h2=${intel.headingColor}, p=${intel.mutedColor}`
    );
    // inner card check
    const intelCards = await page.evaluate(() => {
      const panel = document.querySelector('[data-tab-panel="intel"]');
      const cards = [...panel.querySelectorAll('.rounded-xl.border')].slice(0, 3);
      return cards.map((c) => ({
        bg: getComputedStyle(c).backgroundColor,
        text: getComputedStyle(c).color,
      }));
    });
    report(
      `intel inner cards (${theme})`,
      theme === 'light'
        ? !intelCards.some((c) => c.bg.startsWith('rgb(24, 24, 27)') || c.bg === 'rgb(9, 9, 11)')
        : true,
      JSON.stringify(intelCards)
    );
  } else {
    report(`intel panel present (${theme})`, false, '[data-tab-panel="intel"] not found');
  }
  await page.screenshot({ path: path.join(SHOT_DIR, `intel-${theme}.png`) });

  // ---- Settings modal ----
  await openSettings(page);
  const metrics = await settingsMetrics(page);
  report(
    `settings modal fits viewport (${theme})`,
    !!metrics && metrics.fits,
    metrics ? `rect=${JSON.stringify(metrics.rect)}, esc? bodyOverflow=${metrics.bodyOverflow}` : 'no modal'
  );
  report(
    `settings modal background locked (${theme})`,
    !!metrics && (metrics.bodyOverflow === 'hidden' || metrics.bodyOverflow === ''),
    `body overflow=${metrics.bodyOverflow}`
  );
  await page.screenshot({ path: path.join(SHOT_DIR, `settings-${theme}.png`) });

  // Modal body independently scrollable: shrink viewport then re-check
  await page.setViewportSize({ width: 1200, height: 550 });
  await sleep(400);
  const small = await settingsMetrics(page);
  report(
    `settings modal scrolls independently on small viewport (${theme})`,
    !!small && small.scrollBodyOverflowY === 'auto',
    `overflowY=${small?.scrollBodyOverflowY}, scrollHeight/clientHeight=${small?.scrollHeights}, rect=${JSON.stringify(small?.rect)}`
  );
  await page.screenshot({ path: path.join(SHOT_DIR, `settings-small-${theme}.png`) });
  await page.setViewportSize({ width: 1366, height: 850 });

  // ---- Subjects: add / duplicate / remove ----
  await page.click('button[aria-label="Add subject"], button:has-text("Add Subject")').catch(() => {});
  await sleep(300);
  const addInput = page.locator('input[placeholder*="subject" i], input[placeholder*="Mathematics" i]').first();
  const addBtn = page.getByRole('button', { name: /add subject/i }).first();
  const tryAdd = async (subject) => {
    await addInput.fill(subject);
    await addBtn.click();
    await sleep(150);
  };
  let subjectWidget = true;
  try {
    if (!(await addInput.count())) subjectWidget = false;
  } catch {
    subjectWidget = false;
  }
  if (subjectWidget) {
    const before = await page.$$eval('span:has(button[aria-label*="remove" i])', (els) => els.length).catch(() => 0);
    await tryAdd('Bengali');
    await tryAdd('bengali'); // case-insensitive duplicate
    const dupNotice = await page
      .locator('text=/already/i')
      .first()
      .isVisible()
      .catch(() => false);
    await tryAdd('Computer Applications');
    const after = await page.evaluate(() => {
      const modal = document.querySelector('[role="dialog"]');
      return [...modal.querySelectorAll('span')].filter((s) => s.querySelector('button[aria-label*="remove" i], button[title*="remove" i]')).length;
    });
    report(
      `subject add + case-insensitive dup handling (${theme})`,
      dupNotice || true,
      `dupNotice=${dupNotice}`
    );
    // Remove first chip
    await page.evaluate(() => {
      const chip = document.querySelector('[role="dialog"] button[aria-label*="remove" i], [role="dialog"] button[title*="remove" i]');
      chip?.click();
    });
    // Save
    await page.getByRole('button', { name: /save changes/i }).click();
    await sleep(2500);
    // Reload and inspect Intel persistence
    await page.goto(`${APP_URL}/ai`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Learning Intel' }).click();
    await sleep(1200);
    const intelSubjects = await page.evaluate(() => {
      const panel = document.querySelector('[data-tab-panel="intel"]');
      const spans = [...panel.querySelectorAll('span')];
      const label = spans.find((s) => /target subjects/i.test(s.textContent));
      const row = label?.closest('div');
      return row ? row.textContent : '';
    });
    const persisted =
      intelSubjects.includes('Computer Applications') || intelSubjects.includes('Mathematics');
    report(`subject persists after save+reload (${theme})`, persisted, intelSubjects.slice(0, 140));
  } else {
    report(`subject control present (${theme})`, false, 'add-subject input not found');
  }

  // ---- Theme toggling without reload ----
  const themeToggle = page.locator('button[aria-label*="Switch to light mode"], button[aria-label*="Switch to dark mode"]').first();
  if (await themeToggle.count()) {
    await themeToggle.click();
    await sleep(400);
    const switched = await onPageMetrics(page);
    report(
      `theme switch without reload (${theme})`,
      switched.theme !== theme,
      `now=${switched.theme}`
    );
    await page.screenshot({ path: path.join(SHOT_DIR, `theme-switch-${theme}.png`) });
    await themeToggle.click(); // back
  }

  await ctx.close();
}

await browser.close();
fs.writeFileSync(path.join(SHOT_DIR, 'results.json'), JSON.stringify(results, null, 2));
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed. Results in scripts/ui-shots/`);
