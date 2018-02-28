/**
 * @author ebidel@ (Eric Bidelman)
 * License Apache-2.0
 */

// Curl a page and dump its markup.

const puppeteer = require('puppeteer');

const URL = process.env.URL || 'https://www.chromestatus.com/features';

puppeteer.launch().then(async browser => {
  const page = await browser.newPage();
  const response = await page.goto(URL);
  console.log(await response.text());
  await browser.close();
});
