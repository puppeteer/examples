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
 * Shows how to click a file download link and verify that the file gets
 * downloaded to the expected download location in the filesystem. Typically,
 * ~/Downloads.
 * Note: this approach only works in headful Chrome.
 *
 * Install:
 *   npm i puppeteer
 * Run:
 *   node verify_download.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('puppeteer');

const DOWNLOAD_PATH = path.resolve(__dirname, 'downloads');

/**
 * From @xprudhomme.
 * Check if file exists, watching containing directory meanwhile.
 * Resolve if the file exists, or if the file is created before the timeout
 * occurs.
 * @param {string} filePath
 * @param {integer} timeout
 * @returns {!Promise<undefined>} Resolves when file has been created. Rejects
 *     if timeout is reached.
 */
function waitForFileExists(filePath, timeout=15000) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(filePath);
    const basename = path.basename(filePath);

    const watcher = fs.watch(dir, (eventType, filename) => {
      if (eventType === 'rename' && filename === basename) {
        clearTimeout(timer);
        watcher.close();
        resolve();
      }
    });

    const timer = setTimeout(() => {
      watcher.close();
      reject(new Error(' [checkFileExists] File does not exist, and was not created during the timeout delay.'));
    }, timeout);

    fs.access(filePath, fs.constants.R_OK, err =>  {
      if (!err) {
        clearTimeout(timer);
        watcher.close();
        resolve();
      }
    });
  });
}

(async() => {

const browser = await puppeteer.launch();

const page = await browser.newPage();

// Change from the default ~/Downloads folder to our own.
const client = await page.target().createCDPSession();
await client.send('Page.setDownloadBehavior', {
  behavior: 'allow',
  downloadPath: DOWNLOAD_PATH,
});

const url = 'https://www.nseindia.com/products/content/equities/equities/homepage_eq.htm';
await page.goto(url);
// Wait for main content area to have list of links.
await page.waitForSelector('.main_content', {visible: true, timeout: 5000});

const downloadUrl = await page.evaluate(() => {
  const link = document.evaluate(`//a[text()="Short Selling (csv)"]`, document,
      null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
  if (link) {
    // Prevent link from opening up in a new tab. Puppeteer won't respect
    // the Page.setDownloadBehavior on the new tab and the file ends up in the
    // default download folder.
    link.target = '';
    link.click();
    return link.href;
  }
  return null;
});

if (!downloadUrl) {
  console.warn('Did not find link to download!');
  await browser.close();
  return;
}

// Wait for file response to complete.
await new Promise(resolve => {
  page.on('response', async resp => {
    if (resp.url() === downloadUrl) {
      resolve();
    }
  });
});

console.log('Downloaded.');

// Verify it's on the file system.
await waitForFileExists(`${DOWNLOAD_PATH}/ShortSelling.csv`);
console.log('Exists!');

await browser.close();

})();
