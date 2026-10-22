/**
 * End-to-end browser flow (light mode):
 *   1. Fresh signup -> onboarding
 *   2. Roadmap tab -> Calibration modal (portal correctness) -> AI proposal generation
 *   3. Plan Preview modal (portal correctness) -> "Build My Plan" -> active plan
 *   4. Dashboard reflects the new plan
 *   5. Settings: edit weak topics + exam date -> save
 *      -> Roadmap STALE banner appears (single-source-of-truth flag)
 *      -> after reload, Intel + Dashboard show the updated profile
 *
 * Usage: node scripts/ui-flow.mjs
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = path.join(__dirname, 'ui-shots');
fs.mkdirSync(SHOT_DIR, { recursive: true });

const APP_URL = 'http://localhost:3000';
const EMAIL = `ui_flow_${Date.now() % 100000}@example.com`;
const PASSWORD = 'AuditPass123!';

const results = [];
const report = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};
console.log('flow user:', EMAIL);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensureServer() {
  const up = async () => {
    try {
      const r = await fetch(`${APP_URL}/login`);
      return r.ok;
    } catch {
      return false;
    }
  };

  const { spawn } = await import('node:child_process');
  const NODE_BIN = process.execPath;
  const NEXT_BIN = path.join(__dirname, '..', 'node_modules', 'next', 'dist', 'bin', 'next');
  const CWD = path.join(__dirname, '..');
  const ENV = { ...process.env, NODE_OPTIONS: '--unhandled-rejections=warn' };
  const logFd = fs.openSync(path.join(__dirname, 'next-server-flow.log'), 'a');
  const spawnServer = () =>
    spawn(NODE_BIN, [NEXT_BIN, 'start', '-p', '3000'], {
      cwd: CWD,
      detached: true,
      stdio: ['ignore', logFd, logFd],
      env: ENV,
    }).unref();
  fs.appendFileSync(logFd, `\n===== flow session @ ${new Date().toISOString()} =====\n`);

  if (await up()) return;
  spawnServer();
  for (let i = 0; i < 40; i++) {
    if (await up()) {
      // Watchdog: Next <14.2 can crash on client-disconnect (ECONNRESET) —
      // auto-restart so a 5-minute browser flow never loses its server.
      const timer = setInterval(() => {
        up().then((alive) => {
          if (!alive) {
            fs.appendFileSync(logFd, `\n===== watchdog respawn @ ${new Date().toISOString()} =====\n`);
            spawnServer();
          }
        });
      }, 5000);
      timer.unref();
      return;
    }
    await sleep(1000);
  }
  throw new Error('Frontend server not reachable on :3000');
}

/** Shared modal-fit metrics (works for any [role=dialog] overlay). */
function metricsJs() {
  return () => {
    const overlay = document.querySelector('[role="dialog"][aria-modal="true"]');
    if (!overlay) return null;
    const modal = overlay.firstElementChild;
    const rect = modal.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    return {
      overlayH: Math.round(overlay.getBoundingClientRect().height),
      fits: rect.top >= -1 && rect.left >= -1 && rect.bottom <= vh + 1 && rect.right <= vw + 1,
      height: Math.round(rect.height),
      vh,
      bodyOverflow: document.body.style.overflow,
    };
  };
}

await ensureServer();
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
});
const ctx = await browser.newContext({ viewport: { width: 1366, height: 850 } });
await ctx.addInitScript(() => localStorage.setItem('theme', 'light'));
const page = await ctx.newPage();
page.setDefaultTimeout(60000);

/* 1 — signup + onboarding */
await page.goto(`${APP_URL}/signup`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('input[placeholder="Alex Johnson"]');
await page.fill('input[placeholder="Alex Johnson"]', 'UI Flow Student');
await page.fill('input[type="email"]', EMAIL);
const pw = page.locator('input[type="password"]');
await pw.nth(0).fill(PASSWORD);
await pw.nth(1).fill(PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL(/onboarding/, { timeout: 25000 });
await page.selectOption('select >> nth=0', { index: 1 });
await page.selectOption('select >> nth=1', { index: 1 });
await page.fill('input[placeholder="e.g. Class 12, Grade 11"]', 'Class 12');
await page.fill('input[placeholder="Mathematics, Physics, Chemistry"]', 'Mathematics, Physics');
await page.click('button[type="submit"]');
await page.waitForURL(/ai/, { timeout: 25000 });
await sleep(2000);

/* 2 — calibration modal via Roadmap tab */
await page.getByRole('button', { name: 'Study Roadmap' }).click();
await sleep(800);
await page.getByRole('button', { name: /Generate 14-Day Proposal/ }).click();
await page.waitForSelector('[role="dialog"][aria-labelledby="calibration-modal-title"]');
await sleep(600);
const calib = await page.evaluate(metricsJs());
report(
  'calibration modal fits viewport (portal ok)',
  !!calib && calib.overlayH === 850 && calib.fits && calib.bodyOverflow === 'hidden',
  JSON.stringify(calib)
);
await page.screenshot({ path: path.join(SHOT_DIR, 'calibration-light.png') });

const examDate = new Date(Date.now() + 40 * 86400000);
const examDateStr = examDate.toISOString().slice(0, 10);
const weakText =
  "I struggle with Rotational Inertia integration, Lenz's law numericals, and thermodynamics cycle calculations.";
await page.fill('textarea', weakText);
await page.fill('input[type="date"]', examDateStr);
await page.getByRole('button', { name: /Generate Tailored Roadmap/ }).click();
report('calibration submitted', true, `exam=${examDateStr}`);

/* 3 — generation auto-confirms; then the preview modal opens via "Inspect Full Modal" */
let roadmapActive = false;
const MAX_GEN_ATTEMPTS = 2;
for (let attempt = 1; attempt <= MAX_GEN_ATTEMPTS && !roadmapActive; attempt++) {
  if (attempt > 1) {
    console.log(`retrying proposal generation (attempt ${attempt}) after provider backoff…`);
    await sleep(30000);
    await page.getByRole('button', { name: /Generate Tailored Roadmap/ }).click().catch(() => {});
  }
  try {
    // Generation completes -> proposal auto-saved -> roadmap tasks appear
    await page.waitForSelector('text=Planned Study Tasks', { timeout: attempt === 1 ? 240000 : 300000 });
    roadmapActive = true;
    report('AI proposal generated & auto-confirmed', true);
  } catch {
    report('AI proposal generated & auto-confirmed', false, `attempt ${attempt} failed (see backend log)`);
  }
}
if (roadmapActive) {
  await sleep(800);
  await page.screenshot({ path: path.join(SHOT_DIR, 'roadmap-active-light.png') });
}

if (roadmapActive) {
  await page.getByRole('button', { name: 'Inspect Full Modal' }).click();
  await page.waitForSelector('[role="dialog"][aria-labelledby="modal-title"]', { timeout: 20000 });
  await sleep(800);
  const preview = await page.evaluate(metricsJs());
  report(
    'plan preview modal fits viewport (portal ok)',
    !!preview && preview.overlayH === 850 && preview.fits && preview.bodyOverflow === 'hidden',
    JSON.stringify(preview)
  );
  await page.screenshot({ path: path.join(SHOT_DIR, 'plan-preview-light.png') });
  await page.getByRole('button', { name: 'Make Changes' }).click();
  await sleep(500);

  /* 5 — settings edit (on the AI page, in-session) -> stale banner on roadmap tab */
  await page.click('button[title="Settings & Profile"]');
  await page.waitForSelector('[role="dialog"][aria-modal="true"]');
  await sleep(500);
  const weakInput = page.locator('[role="dialog"] textarea, [placeholder*="Rotational Motion" i]').first();
  await weakInput.fill('Thermodynamics, Rotational Motion');
  const newExam = new Date(Date.now() + 53 * 86400000).toISOString().slice(0, 10);
  const dateInput = page.locator('[role="dialog"] input[type="date"]');
  await dateInput.fill(newExam);
  await page.getByRole('button', { name: /Save Changes/ }).click();
  await sleep(2500);

  // roadmap tab should now show the stale banner (session proposal state intact)
  const bannerVisible = await page
    .locator('text=Recalibration Recommended')
    .first()
    .isVisible()
    .catch(() => false);
  report('roadmap stale banner after profile change (in-session)', bannerVisible);
  await page.getByRole('button', { name: 'Study Roadmap' }).click();
  await sleep(600);
  const bannerOnTab = await page
    .locator('text=Recalibration Recommended')
    .first()
    .isVisible()
    .catch(() => false);
  report('stale banner visible on roadmap tab', bannerOnTab);
  await page.screenshot({ path: path.join(SHOT_DIR, 'roadmap-stale-banner.png') });

  /* 4 (moved) — dashboard picked up the plan + profile (fresh load reads DB) */
  await page.goto(`${APP_URL}/dashboard`, { waitUntil: 'networkidle' });
  let dashTasks = false;
  try {
    await page.getByText(/tasks remaining/).first().waitFor({ timeout: 20000 });
    const text = await page.evaluate(() => document.body.textContent ?? '');
    dashTasks =
      /study schedule/i.test(text) &&
      (text.includes('Mathematics') || text.includes('Physics') || text.includes('Break'));
    const examUpdated = text.includes('Dec 13');
    const dSlice = /D-\d+/.test(text)
      ? text.slice(Math.max(0, text.indexOf('D-') - 80), text.indexOf('D-') + 80)
      : '(no D- badge)';
    report('dashboard exam date reflects Settings save', examUpdated, examUpdated ? 'D-53 / Dec 13' : dSlice);
  } catch {
    dashTasks = false;
  }
  report('dashboard reflects generated plan', dashTasks);
  await page.screenshot({ path: path.join(SHOT_DIR, 'dashboard-after-plan.png') });

  /* 6 — after reload: Intel + Dashboard consume persisted profile */
  await page.goto(`${APP_URL}/ai`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Learning Intel' }).click();
  await sleep(1200);
  const intelWeak = await page.evaluate(() => {
    const panel = document.querySelector('[data-tab-panel="intel"]');
    return panel ? panel.textContent : '';
  });
  const hasWeak = /thermodynamics/i.test(intelWeak);
  const staleAfterReload = await page
    .locator('text=Recalibration Recommended')
    .first()
    .isVisible()
    .catch(() => false);
  report('intel shows updated weak topics after reload+save', hasWeak, `staleBanner=${staleAfterReload}`);
  await page.screenshot({ path: path.join(SHOT_DIR, 'intel-after-profile-sync.png') });

  await page.goto(`${APP_URL}/dashboard`, { waitUntil: 'networkidle' });
  await sleep(1500);
  await page.screenshot({ path: path.join(SHOT_DIR, 'dashboard-after-profile-sync.png') });
}

await browser.close();
fs.writeFileSync(path.join(SHOT_DIR, 'ui-flow-results.json'), JSON.stringify(results, null, 2));
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} flow checks passed.`);
process.exitCode = passed === results.length ? 0 : 1;
