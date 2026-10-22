import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = path.join(__dirname, 'ui-shots');
const APP_URL = 'http://localhost:3000';
const BACKEND_URL = 'http://127.0.0.1:8000/api/v1';
const EMAIL = 'mahafuzalamkhan25@gmail.com';
const PASSWORD = 'Temp@12345';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('1. Obtaining JWT access token directly from backend API...');
const loginRes = await fetch(`${BACKEND_URL}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
}).then((r) => r.json());

if (!loginRes?.data?.access_token) {
  throw new Error(`Failed to obtain access token: ${JSON.stringify(loginRes)}`);
}
const token = loginRes.data.access_token;
console.log('Token successfully obtained:', token.substring(0, 15) + '...');

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
});

const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
});

// Inject authentication token on every page load
await ctx.addInitScript((jwt) => {
  localStorage.setItem('access_token', jwt);
}, token);

const page = await ctx.newPage();

const report = {
  dashboardFix: {},
  navigation: {},
  planner: {},
  viewports: [],
  desktop: {},
};

// ====================================================================
// TEST A: DASHBOARD VERIFICATION (AI Assistant removed, 2 tiles reflowed)
// ====================================================================
console.log('\n--- 2. Checking Dashboard: AI Assistant removed, 2 tiles remaining ---');
await page.goto(`${APP_URL}/dashboard`);
await sleep(2000);

await page.evaluate(() => {
  localStorage.setItem('theme', 'dark');
  document.documentElement.classList.remove('light');
  document.documentElement.classList.add('dark');
  document.documentElement.setAttribute('data-theme', 'dark');
});
await sleep(500);

const dashData = await page.evaluate(() => {
  const h1 = document.querySelector('h1')?.innerText?.trim();
  const headerButtons = Array.from(document.querySelectorAll('header button')).map((b) => b.innerText?.trim());
  const aiAssistantFound = headerButtons.some((txt) => txt.includes('AI Assistant'));
  const focusRoomFound = headerButtons.some((txt) => txt.includes('Focus Room'));
  const settingsFound = headerButtons.some((txt) => txt.includes('Settings'));
  const gridContainer = document.querySelector('header .grid');
  const gridClasses = gridContainer ? gridContainer.className : '';

  return {
    h1,
    headerButtons,
    aiAssistantFound,
    focusRoomFound,
    settingsFound,
    gridClasses,
  };
});

console.log('Dashboard Data:', JSON.stringify(dashData));
report.dashboardFix = dashData;

// Capture Dark Mode Dashboard with AI Assistant removed
await page.screenshot({ path: path.join(SHOT_DIR, 'dashboard-fixed-dark-390px.png') });

// Capture Light Mode Dashboard with AI Assistant removed
await page.evaluate(() => {
  localStorage.setItem('theme', 'light');
  document.documentElement.classList.remove('dark');
  document.documentElement.classList.add('light');
  document.documentElement.setAttribute('data-theme', 'light');
});
await sleep(500);
await page.screenshot({ path: path.join(SHOT_DIR, 'dashboard-fixed-light-390px.png') });

// Switch back to Dark Mode
await page.evaluate(() => {
  localStorage.setItem('theme', 'dark');
  document.documentElement.classList.remove('light');
  document.documentElement.classList.add('dark');
  document.documentElement.setAttribute('data-theme', 'dark');
});
await sleep(500);

// ====================================================================
// TEST B: BOTTOM NAVIGATION PLANNER ROUTE
// ====================================================================
console.log('\n--- 3. Clicking Planner in Mobile Bottom Navigation ---');
const plannerNavButton = page.locator('nav[aria-label="Mobile Navigation"] button:has-text("Planner")');
await plannerNavButton.click();
await sleep(2000);

console.log('URL after clicking Planner:', page.url());
report.navigation = {
  navigatedUrl: page.url(),
  isPlannerRoute: page.url().includes('/planner') && !page.url().includes('/ai'),
};

// ====================================================================
// TEST C: PLANNER PAGE (Screen #7 in UI Showcase)
// ====================================================================
console.log('\n--- 4. Verifying Planner Page (Screen #7) ---');
const plannerData = await page.evaluate(() => {
  const h1 = document.querySelector('h1')?.innerText?.trim();
  const hasShare = !!document.querySelector('button[aria-label="Share Study Plan"]');
  const tabs = Array.from(document.querySelectorAll('button'))
    .filter((b) => ['Today', 'This Week', 'Subjects'].includes(b.innerText?.trim()))
    .map((b) => b.innerText.trim());
  const activeNav = document.querySelector('nav[aria-label="Mobile Navigation"] button[aria-current="page"]')?.innerText?.trim();
  const taskCards = document.querySelectorAll('h3');
  const taskTitles = Array.from(taskCards).map((c) => c.innerText.trim());

  return {
    h1,
    hasShare,
    tabs,
    activeNav,
    taskTitles,
  };
});

console.log('Planner Initial Data:', JSON.stringify(plannerData));
report.planner.initial = plannerData;

// Screenshot Planner Screen #7 Dark Mode
await page.screenshot({ path: path.join(SHOT_DIR, 'planner-screen7-dark-390px.png') });

// Test Tab: This Week
console.log('Testing "This Week" tab...');
await page.locator('button:has-text("This Week")').first().click();
await sleep(600);
await page.screenshot({ path: path.join(SHOT_DIR, 'planner-tab-week-390px.png') });

// Test Tab: Subjects
console.log('Testing "Subjects" tab...');
await page.locator('button:has-text("Subjects")').first().click();
await sleep(600);
await page.screenshot({ path: path.join(SHOT_DIR, 'planner-tab-subjects-390px.png') });

// Return to Tab: Today
console.log('Returning to "Today" tab and testing + Add Task...');
await page.locator('button:has-text("Today")').first().click();
await sleep(600);

// Open Add Task Modal
await page.locator('button:has-text("+ Add Task")').first().click();
await sleep(600);

const testTaskTitle = `Electromagnetic Induction Practice Set`;
await page.fill('input[placeholder="e.g. Electromagnetic Induction Numerical Drill"]', testTaskTitle);
await page.locator('button:has-text("Save Task")').first().click();
await sleep(2500);

// Verify task exists on timeline
const taskCountAfterAdd = await page.evaluate(() => {
  return document.querySelectorAll('h3').length;
});
console.log('Task count after Add Task:', taskCountAfterAdd);
report.planner.taskCountAfterAdd = taskCountAfterAdd;

// Capture Planner Screen #7 in Light Mode
await page.evaluate(() => {
  localStorage.setItem('theme', 'light');
  document.documentElement.classList.remove('dark');
  document.documentElement.classList.add('light');
  document.documentElement.setAttribute('data-theme', 'light');
});
await sleep(600);
await page.screenshot({ path: path.join(SHOT_DIR, 'planner-screen7-light-390px.png') });

// ====================================================================
// TEST D: MULTI-VIEWPORT RESPONSIVENESS (320px - 480px)
// ====================================================================
console.log('\n--- 5. Testing Multi-Viewport Responsiveness (Dark Mode) ---');
await page.evaluate(() => {
  localStorage.setItem('theme', 'dark');
  document.documentElement.classList.remove('light');
  document.documentElement.classList.add('dark');
  document.documentElement.setAttribute('data-theme', 'dark');
});
await sleep(400);

const mobileWidths = [320, 360, 375, 390, 412, 430, 480];
for (const w of mobileWidths) {
  await page.setViewportSize({ width: w, height: 844 });
  await sleep(400);

  const overflowMetrics = await page.evaluate(() => {
    const docW = document.documentElement.scrollWidth;
    const bodyW = document.body.scrollWidth;
    const winW = window.innerWidth;
    const maxW = Math.max(docW, bodyW);
    return {
      maxW,
      winW,
      hasOverflow: maxW > winW,
    };
  });

  const shot = `planner-dark-${w}px.png`;
  await page.screenshot({ path: path.join(SHOT_DIR, shot) });
  console.log(`[Viewport ${w}px]: overflow=${overflowMetrics.hasOverflow} (${overflowMetrics.maxW}px / ${overflowMetrics.winW}px)`);
  report.viewports.push({ width: w, ...overflowMetrics, shot });
}

// ====================================================================
// TEST E: DESKTOP PRESERVATION (1280px)
// ====================================================================
console.log('\n--- 6. Testing Desktop Dashboard & Planner Preservation (1280px) ---');
for (const theme of ['dark', 'light']) {
  await page.evaluate((t) => {
    localStorage.setItem('theme', t);
    if (t === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
  }, theme);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${APP_URL}/dashboard`);
  await sleep(1500);

  const desktopStats = await page.evaluate(() => {
    const desktopEl = document.querySelector('.hidden.lg\\:block');
    const isDesktopVisible = desktopEl && getComputedStyle(desktopEl).display !== 'none';
    const mobileNav = document.querySelector('nav[aria-label="Mobile Navigation"]');
    const isMobileNavHidden = !mobileNav || getComputedStyle(mobileNav).display === 'none';
    return { isDesktopVisible, isMobileNavHidden };
  });

  await page.screenshot({ path: path.join(SHOT_DIR, `desktop-dashboard-preservation-${theme}-1280px.png`) });
  console.log(`Desktop Dashboard (${theme}): desktopVisible=${desktopStats.isDesktopVisible}, mobileNavHidden=${desktopStats.isMobileNavHidden}`);
  report.desktop[`dashboard_${theme}`] = desktopStats;

  // Visit /planner on desktop
  await page.goto(`${APP_URL}/planner`);
  await sleep(1500);
  await page.screenshot({ path: path.join(SHOT_DIR, `desktop-planner-preservation-${theme}-1280px.png`) });
  console.log(`Desktop Planner (${theme}): captured screenshot`);
}

fs.writeFileSync(path.join(SHOT_DIR, 'unified-test-report.json'), JSON.stringify(report, null, 2));
console.log('\nUnified test suite finished successfully!');

await browser.close();
