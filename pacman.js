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
 * Play Google Pac-man Doodle from Node! Uses Puppeteer's keyboard API to
 * forward key presses to the browser.
 */

const readline = require('readline');
const puppeteer = require('puppeteer');

(async() => {

const browser = await puppeteer.launch({
  headless: false,
  args: ['--window-size=800,500']
});

const page = await browser.newPage();
await page.setViewport({width: 800, height: 500, deviceScaleFactor: 2});
await page.goto('https://www.google.com/logos/2010/pacman10-i.html');

process.stdin.on('keypress', async (str, key) => {
  // In "raw" mode, so create own kill switch.
  if (key.sequence === '\u0003') {
    await browser.close();
    process.exit();
  }

  // See https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#keyboarddownkey-options
  if (['up', 'down', 'left', 'right'].includes(key.name)) {
    const capitalized = key.name[0].toUpperCase() + key.name.slice(1);
    const keyName = `Arrow${capitalized}`;
    console.log(`page.keyboard.down('${keyName}')`);
    await page.keyboard.down(keyName);
  }
});

readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);

})();
