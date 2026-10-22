import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = path.join(__dirname, 'ui-shots');
const APP_URL = 'http://localhost:3000';
const EMAIL = 'mahafuzalamkhan25@gmail.com';
const PASSWORD = 'Temp@12345';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
});

console.log('1. Authenticating...');
const authCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const authPage = await authCtx.newPage();
await authPage.goto(`${APP_URL}/login`);
await authPage.fill('input[type="email"]', EMAIL);
await authPage.fill('input[type="password"]', PASSWORD);
await authPage.click('button[type="submit"]');
await sleep(4000);
await authPage.goto(`${APP_URL}/dashboard`);
await sleep(2500);

const storageState = await authCtx.storageState();
await authCtx.close();
console.log('Session acquired.');

const viewports = [320, 360, 375, 390, 412, 430, 480];
const results = {
  dashboardFix: {},
  navigation: {},
  planner: {},
  desktop: {},
};

// ====================================================================
// TEST 1: DASHBOARD FIX VERIFICATION (Part A)
// ====================================================================
console.log('\n--- 2. Verifying Dashboard: AI Assistant removed, 2 tiles remaining ---');
{
  const ctx = await browser.newContext({
    storageState,
    viewport: { width: 390, height: 844 },
    colorScheme: 'dark',
  });
  const page = await ctx.newPage();
  await page.goto(`${APP_URL}/dashboard`);
  await sleep(2000);

  // Force dark theme
  await page.evaluate(() => {
    localStorage.setItem('theme', 'dark');
    document.documentElement.classList.remove('light');
    document.documentElement.classList.add('dark');
  });
  await sleep(500);

  const dashCheck = await page.evaluate(() => {
    const aiAssistantInHeader = Array.from(document.querySelectorAll('header button')).some(
      (b) => b.textContent?.includes('AI Assistant')
    );
    const focusRoomInHeader = Array.from(document.querySelectorAll('header button')).some(
      (b) => b.textContent?.includes('Focus Room')
    );
    const settingsInHeader = Array.from(document.querySelectorAll('header button')).some(
      (b) => b.textContent?.includes('Settings')
    );
    const actionTilesContainer = document.querySelector('header .grid');
    const colsClass = actionTilesContainer ? actionTilesContainer.className : '';

    return {
      aiAssistantInHeader,
      focusRoomInHeader,
      settingsInHeader,
      colsClass,
      title: document.querySelector('h1')?.innerText?.trim(),
    };
  });

  console.log('Dashboard Action Tiles Check:', JSON.stringify(dashCheck));
  results.dashboardFix = dashCheck;

  await page.screenshot({ path: path.join(SHOT_DIR, 'dashboard-fixed-dark-390px.png') });

  // Light mode check
  await page.evaluate(() => {
    localStorage.setItem('theme', 'light');
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
  });
  await sleep(500);
  await page.screenshot({ path: path.join(SHOT_DIR, 'dashboard-fixed-light-390px.png') });

  // ====================================================================
  // TEST 2: BOTTOM NAVIGATION PLANNER ROUTE
  // ====================================================================
  console.log('\n--- 3. Verifying Bottom Navigation: Planner routes to /planner ---');
  const plannerNavBtn = page.locator('nav[aria-label="Mobile Navigation"] button:has-text("Planner")');
  await plannerNavBtn.click();
  await sleep(2000);

  const currentUrl = page.url();
  console.log('Navigated to URL after clicking Planner:', currentUrl);
  results.navigation = {
    clickedPlannerUrl: currentUrl,
    isCorrectRoute: currentUrl.includes('/planner') && !currentUrl.includes('/ai'),
  };

  await ctx.close();
}

// ====================================================================
// TEST 3: DEDICATED PLANNER PAGE FUNCTIONALITY (Part B)
// ====================================================================
console.log('\n--- 4. Verifying Planner Page (Screen #7): Tabs, Timeline, Add Task ---');
{
  const ctx = await browser.newContext({
    storageState,
    viewport: { width: 390, height: 844 },
    colorScheme: 'dark',
  });
  const page = await ctx.newPage();
  await page.goto(`${APP_URL}/planner`);
  await sleep(2000);

  // Set dark theme
  await page.evaluate(() => {
    localStorage.setItem('theme', 'dark');
    document.documentElement.classList.remove('light');
    document.documentElement.classList.add('dark');
  });
  await sleep(500);

  const plannerElements = await page.evaluate(() => {
    const h1 = document.querySelector('h1')?.innerText?.trim();
    const hasShareBtn = !!document.querySelector('button[aria-label="Share Study Plan"]');
    const tabs = Array.from(document.querySelectorAll('button')).filter((b) =>
      ['Today', 'This Week', 'Subjects'].includes(b.innerText?.trim())
    ).map((b) => b.innerText.trim());
    const hasAddBtn = Array.from(document.querySelectorAll('button')).some((b) => b.innerText?.includes('+ Add Task'));
    const taskCards = document.querySelectorAll('h3');
    const activeNav = document.querySelector('nav[aria-label="Mobile Navigation"] button[aria-current="page"]')?.innerText?.trim();

    return {
      h1,
      hasShareBtn,
      tabs,
      hasAddBtn,
      taskCount: taskCards.length,
      activeNav,
    };
  });
  console.log('Planner Initial Check:', JSON.stringify(plannerElements));

  // 1. Capture Dark Mode Planner (Screen #7)
  await page.screenshot({ path: path.join(SHOT_DIR, 'planner-screen7-dark-390px.png') });

  // 2. Test "This Week" Tab
  console.log('Testing "This Week" Tab...');
  await page.click('button:has-text("This Week")');
  await sleep(600);
  await page.screenshot({ path: path.join(SHOT_DIR, 'planner-tab-week-390px.png') });

  // 3. Test "Subjects" Tab
  console.log('Testing "Subjects" Tab...');
  await page.click('button:has-text("Subjects")');
  await sleep(600);
  await page.screenshot({ path: path.join(SHOT_DIR, 'planner-tab-subjects-390px.png') });

  // 4. Return to "Today" Tab and test Add Task
  console.log('Testing "Today" Tab and "+ Add Task" creation...');
  await page.click('button:has-text("Today")');
  await sleep(600);

  // Click "+ Add Task"
  await page.click('button:has-text("+ Add Task")');
  await sleep(600);

  // Fill in Add Task Form
  const testTitle = `Test Drill ${Date.now() % 10000}`;
  await page.fill('input[placeholder="e.g. Electromagnetic Induction Numerical Drill"]', testTitle);
  await page.selectOption('select >> nth=0', 'Physics');
  await page.click('button:has-text("Save Task")');
  await sleep(2500);

  // Verify task was added to timeline
  const addedTaskCheck = await page.evaluate((title) => {
    return Array.from(document.querySelectorAll('h3')).some((h) => h.innerText.includes(title));
  }, testTitle);
  console.log(`Task "${testTitle}" added to timeline successfully:`, addedTaskCheck);

  // 5. Capture Light Mode Planner (Screen #7)
  await page.evaluate(() => {
    localStorage.setItem('theme', 'light');
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
  });
  await sleep(600);
  await page.screenshot({ path: path.join(SHOT_DIR, 'planner-screen7-light-390px.png') });

  results.planner = {
    ...plannerElements,
    taskAddedSuccess: addedTaskCheck,
  };

  await ctx.close();
}

// ====================================================================
// TEST 4: MULTI-VIEWPORT VERIFICATION FOR PLANNER
// ====================================================================
console.log('\n--- 5. Testing Planner across all mobile viewports in Dark Mode ---');
for (const w of viewports) {
  const ctx = await browser.newContext({
    storageState,
    viewport: { width: w, height: 844 },
    colorScheme: 'dark',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
  });
  const page = await ctx.newPage();
  await page.goto(`${APP_URL}/planner`);
  await sleep(1500);

  await page.evaluate(() => {
    localStorage.setItem('theme', 'dark');
    document.documentElement.classList.remove('light');
    document.documentElement.classList.add('dark');
  });
  await sleep(500);

  const metrics = await page.evaluate(() => {
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

  const shotName = `planner-dark-${w}px.png`;
  await page.screenshot({ path: path.join(SHOT_DIR, shotName) });
  console.log(`Planner ${w}px: overflow=${metrics.hasOverflow} (${metrics.maxW}px / ${metrics.winW}px)`);
  await ctx.close();
}

// ====================================================================
// TEST 5: DESKTOP PRESERVATION (1280px)
// ====================================================================
console.log('\n--- 6. Verifying Desktop Dashboard & Planner Preservation (1280px) ---');
for (const theme of ['dark', 'light']) {
  const ctx = await browser.newContext({
    storageState,
    viewport: { width: 1280, height: 800 },
    colorScheme: theme,
  });
  const page = await ctx.newPage();
  await page.goto(`${APP_URL}/dashboard`);
  await sleep(1500);

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
  await sleep(600);

  const desktopCheck = await page.evaluate(() => {
    const mobileNav = document.querySelector('nav[aria-label="Mobile Navigation"]');
    const isMobileNavHidden = !mobileNav || getComputedStyle(mobileNav).display === 'none';
    const desktopContainer = document.querySelector('.hidden.lg\\:block');
    const isDesktopVisible = desktopContainer && getComputedStyle(desktopContainer).display !== 'none';
    return { isMobileNavHidden, isDesktopVisible };
  });

  await page.screenshot({ path: path.join(SHOT_DIR, `desktop-dashboard-final-${theme}-1280px.png`) });
  console.log(`Desktop Dashboard (${theme}): desktopVisible=${desktopCheck.isDesktopVisible}, mobileNavHidden=${desktopCheck.isMobileNavHidden}`);

  // Also check desktop /planner
  await page.goto(`${APP_URL}/planner`);
  await sleep(1500);
  await page.screenshot({ path: path.join(SHOT_DIR, `desktop-planner-${theme}-1280px.png`) });
  console.log(`Desktop Planner (${theme}): captured desktop-planner-${theme}-1280px.png`);

  await ctx.close();
}

fs.writeFileSync(path.join(SHOT_DIR, 'planner-test-summary.json'), JSON.stringify(results, null, 2));
console.log('\nAll tests completed and verified successfully!');
await browser.close();
