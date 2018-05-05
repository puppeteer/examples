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
  * Launch a URL in full screen.
  */

const puppeteer = require('puppeteer');

const url = process.env.URL || 'https://news.ycombinator.com/';

(async() => {

const browser = await puppeteer.launch({
  headless: false,
  // See flags at https://peter.sh/experiments/chromium-command-line-switches/.
  args: [
    '--disable-infobars', // Removes the butter bar.
    '--start-maximized',
    // '--start-fullscreen',
    // '--window-size=1920,1080',
    // '--kiosk',
  ],
});

const page = await browser.newPage();
await page.setViewport({width: 1920, height: 1080});
await page.goto(url);
await page.evaluate('document.documentElement.webkitRequestFullscreen()');
await page.waitFor(5000);

await browser.close();
})();