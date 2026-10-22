import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
});
const page = await browser.newPage();
page.on('console', (msg) => console.log('BROWSER CONSOLE:', msg.text()));
await page.goto('http://localhost:3000/login');
await page.fill('input[type="email"]', 'mahafuzalamkhan25@gmail.com');
await page.fill('input[type="password"]', 'Temp@12345');
await page.click('button[type="submit"]');
await new Promise((r) => setTimeout(r, 4000));
console.log('Current URL after submit:', page.url());
const errorEl = await page.$('.text-rose-400, [role="alert"], .text-red-400, .bg-rose-500\\/10');
if (errorEl) {
  console.log('Error text:', await errorEl.innerText());
}
await browser.close();
