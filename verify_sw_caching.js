/**
 * @author ebidel@ (Eric Bidelman)
 * License Apache-2.0
 */

 /**
  * Verify that page resources are being cached by service worker and served
  * from the cache on repeat visits.
  */

const chalk = require('chalk');
const puppeteer = require('puppeteer');

const URL = process.env.URL || 'https://www.chromestatus.com/features';

(async() => {

const browser = await puppeteer.launch();
const page = await browser.newPage();

// page.on('console', msg => console.log(chalk.yellow('console'), msg.text()));

console.log(chalk.cyan('Page: 1st load'));
await page.goto(URL);
// Wait for sw ready promise to resolve before moving on. This signals the sw
// has installed and cached assets in the `install` event.
await page.evaluate('navigator.serviceWorker.ready');
// Alternatively, wait for UI toast to popup signalling sw caching is done.
// That's specific to this page's implementation though.
// await page.waitForSelector('chromedash-toast[open]');

// Capture requests during 2nd load.
const allRequests = new Map();
page.on('request', req => {
  allRequests.set(req.url(), req);
});

// Could also go offline and verify requests don't 404.
// await page.setOfflineMode(true);

// Reload page to pick up any runtime caching done by the service worker.
console.log(chalk.cyan('Page: 2nd load'));
await page.reload({waitUntil: 'networkidle0'});

// Assert the page has a SW.
console.assert(await page.evaluate('navigator.serviceWorker.controller'),
               'page has active service worker');

console.log(chalk.cyan(`Requests made by ${URL}`),
            `(${chalk.green('✔ cached by sw')}, ${chalk.red('✕ not cached')})`);
Array.from(allRequests.values()).forEach(req => {
  const NUM_CHARS = 75;
  const url = req.url().length > NUM_CHARS ? req.url().slice(0, NUM_CHARS) + '...' : req.url();
  console.log(url, req.response().fromServiceWorker() ? chalk.green('✔') : chalk.red('✕'));
});

await browser.close();

})();
