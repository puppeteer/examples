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
 * Takes screenshots of DOM elements as you tab through the page.
 */

const puppeteer = require('puppeteer');

const AUTO_TAB = !false; // If true, tabbing through elements is done automatically.
const padding = 25; // padding around the element screenshot.
const url = process.env.URL || 'https://perf-sandbox.appspot.com/';

(async() => {

let screenshotNum = 1;

const browser = await puppeteer.launch({headless: AUTO_TAB});
const page = await browser.newPage();
await page.setViewport({width: 1200, height: 800, deviceScaleFactor: 2});

await page.exposeFunction('onTabToElement', async selector => {
  const el = await page.$(selector);
  console.log(`Taking screenshot of ${selector}`);
  const boundingBox = await el.boundingBox();

  await el.screenshot({
    path: `screenshot_${screenshotNum++}.png`,
    clip: {
      x: boundingBox.x - padding,
      y: boundingBox.y - padding,
      width: boundingBox.width + padding * 2,
      height: boundingBox.height + padding * 2,
    }
  });
});

await page.evaluateOnNewDocument(() => {
  window.addEventListener('keyup', e => {
    if (e.key === 'Tab') {
      const active = document.activeElement;
      const selector = active.getAttribute('id') ? `#${active.id}` :
          `${active.localName}.${active.className.replace(/\s/g, '.')}`;
      window.onTabToElement(selector);
    }
  });
});

await page.goto(url);

if (AUTO_TAB) {
  await page.keyboard.press('Tab');
  await page.waitFor(1000);
  await page.keyboard.press('Tab');
  await page.waitFor(1000);
  await page.keyboard.press('Tab');
  await page.waitFor(1000);
  await page.keyboard.press('Tab');
  await page.waitFor(1000);

  await browser.close();
}

// If not in AUTO_TAB mode, close the browser when you're down with ctrl+c.

})();
