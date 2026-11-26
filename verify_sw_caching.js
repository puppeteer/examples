/**
 * Copyright 2018 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @author ebidel@ (Eric Bidelman)
 */

/**
 * Verify that page resources are being cached by a service worker and served
 * from the cache on repeat visits.
 */

import {styleText} from 'node:util';
import puppeteer from 'puppeteer';

const URL = process.env.URL || 'https://developer.chrome.com/';

const browser = await puppeteer.launch();
const page = await browser.newPage();

console.log(styleText('cyan', 'Page: 1st load'));
await page.goto(URL);
// Wait for sw ready promise to resolve before moving on. This signals the sw
// has installed and cached assets in the `install` event.
await page.evaluate(() => navigator.serviceWorker.ready);

// Capture requests during 2nd load.
const allRequests = new Map();
page.on('request', req => {
  allRequests.set(req.url(), req);
});

// Could also go offline and verify requests don't 404.
// await page.setOfflineMode(true);

// Reload page to pick up any runtime caching done by the service worker.
console.log(styleText('cyan', 'Page: 2nd load'));
await page.reload({waitUntil: 'networkidle0'});

// Assert the page has a SW.
console.assert(
  await page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
  'page has active service worker'
);

console.log(
  styleText('cyan', `Requests made by ${URL}`),
  `(${styleText('green', '✔ cached by sw')}, ${styleText('red', '✕ not cached')})`
);
for (const req of allRequests.values()) {
  const NUM_CHARS = 75;
  const reqUrl = req.url().length > NUM_CHARS ? req.url().slice(0, NUM_CHARS) + '...' : req.url();
  const cached = req.response()?.fromServiceWorker();
  console.log(reqUrl, cached ? styleText('green', '✔') : styleText('red', '✕'));
}

await browser.close();
