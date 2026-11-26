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

import {setTimeout} from 'node:timers/promises';
import puppeteer from 'puppeteer';

const AUTO_TAB = true; // If true, tabbing through elements is done automatically.
const padding = 25; // padding around the element screenshot.
const url = process.env.URL || 'https://developer.chrome.com/';

let screenshotNum = 1;

const browser = await puppeteer.launch({headless: AUTO_TAB});
const page = await browser.newPage();
await page.setViewport({width: 1200, height: 800, deviceScaleFactor: 2});

await page.exposeFunction('onTabToElement', async selector => {
  const el = await page.$(selector);
  if (!el) {
    return;
  }
  const boundingBox = await el.boundingBox();
  if (!boundingBox) {
    return;
  }

  console.log(`Taking screenshot of ${selector}`);
  await page.screenshot({
    path: `screenshot_${screenshotNum++}.png`,
    clip: {
      x: Math.max(0, boundingBox.x - padding),
      y: Math.max(0, boundingBox.y - padding),
      width: boundingBox.width + padding * 2,
      height: boundingBox.height + padding * 2,
    },
  });
});

await page.evaluateOnNewDocument(() => {
  window.addEventListener('keyup', e => {
    if (e.key === 'Tab') {
      const active = document.activeElement;
      const selector = active.id
        ? `#${active.id}`
        : `${active.localName}.${active.className.trim().replace(/\s+/g, '.')}`;
      window.onTabToElement(selector);
    }
  });
});

await page.goto(url);

if (AUTO_TAB) {
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Tab');
    await setTimeout(1000);
  }

  await browser.close();
}

// If not in AUTO_TAB mode, close the browser when you're done with ctrl+c.
