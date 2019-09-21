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
 * Note: this approach only works in headful Chrome.
 * Another approach to verifying a file gets downloaded. Shows how to click a
 * file download link and verify that the file gets downloaded in the
 * chrome:downloads page.
 *
 * Install:
 *   npm i puppeteer
 * Run:
 *   node verify_download2.js
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DOWNLOADS_FOLDER = `${os.homedir()}/Downloads`;

/**
 * From @xprudhomme.
 * Check if file exists, watching containing directory meanwhile.
 * Resolve if the file exists, or if the file is created before the timeout
 * occurs.
 * @param {string} filePath
 * @param {integer} timeout
 * @returns {!Promise<undefined>} Resolves when file has been created. Rejects
 *     if timout is reached.
 */
function checkFileExists(filePath, timeout=15000) {
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

/**
 * @param {!Browser} browser
 * @param {string} url The URL of the download file to wait for.
 * @returns {!Promise<!Object>} Metadata about the latest file in Download Manager.
 */
async function waitForFileToDownload(browser, url) {
  const downloadPage = await browser.newPage();
  // Note: navigating to this page only works in headful chrome.
  await downloadPage.goto('chrome://downloads/');

  // Wait for our download to show up in the list by matching on its url.
  const jsHandle = await downloadPage.waitForFunction(downloadUrl => {
    const manager = document.querySelector('downloads-manager');
    const downloads = manager.items_.length;
    const lastDownload = manager.items_[0];
    if (downloads && lastDownload.url === downloadUrl &&
        lastDownload.state === 'COMPLETE') {
      return manager.items_[0];
    }
  }, {polling: 100}, url);

  const fileMeta = await jsHandle.jsonValue();

  await downloadPage.close();

  return fileMeta;
}

/**
 * @param {!Browser} browser
 * @param {string} url The url of the page to navigate to.
 * @param {string} text The link with this text to find and click on the page.
 * @returns {!Promise<?string>} The download resource's url.
 */
async function clickDownloadLink(browser, url, text) {
  const page = await browser.newPage();
  await page.goto(url, {waitUntil: 'networkidle2'});

  const downloadUrl = await page.evaluate((text) => {
    const link = document.evaluate(`//a[text()="${text}"]`, document,
        null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    if (link) {
      link.click();
      return link.href;
    }
    return null;
  }, text);

  await page.close();

  return downloadUrl;
}

(async() => {

const browser = await puppeteer.launch({
  headless: false,
  // dumpio: true,
});

// TODO: setDownloadBehavior would be a good approach, as we could check
// that the file shows up in the location specified by downloadPath. However,
// that arg doesn't currently work.
// const client = await page.target().createCDPSession();
// await client.send('Page.setDownloadBehavior', {
//   behavior: 'allow',
//   downloadPath: path.resolve(__dirname, 'downloads'),
// });

// await client.detach();

// 1. navigate to a page with a bunch links to download.
// 2. click the "Short Selling (csv)" link on the page. The browser force downloads the file.
const url = 'https://www.nseindia.com/products/content/equities/equities/homepage_eq.htm';
const downloadUrl = await clickDownloadLink(browser, url, 'Short Selling (csv)');

if (!downloadUrl) {
  console.error('Did not find download link!');
  return;
}

// 3. Open chrome:downloads and wait for the file to be downloaded.
const fileMeta = await waitForFileToDownload(browser, downloadUrl);
console.log(`"${fileMeta.file_name}" was downloaded`);

// 4. Optionally check that the file really ends up in the expected location
//    on the filesystem.
const exists = await checkFileExists(`${DOWNLOADS_FOLDER}/${fileMeta.file_name}`);
console.assert(exists, `${fileMeta.file_name} was not downloaded to correct location.`);

await browser.close();

})();