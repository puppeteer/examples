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
 * chrome://downloads page.
 *
 * Run:
 *   node verify_download2.js
 */

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';

const DOWNLOADS_FOLDER = path.join(os.homedir(), 'Downloads');
const FILENAME = `puppeteer-example-${Date.now()}.csv`;

/**
 * Check if file exists, watching containing directory meanwhile.
 * @param {string} filePath
 * @param {number=} timeout
 * @returns {!Promise<boolean>}
 */
function checkFileExists(filePath, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(filePath);
    const basename = path.basename(filePath);

    const watcher = fs.watch(dir, (eventType, filename) => {
      if (eventType === 'rename' && filename === basename) {
        clearTimeout(timer);
        watcher.close();
        resolve(true);
      }
    });

    const timer = setTimeout(() => {
      watcher.close();
      reject(new Error('[checkFileExists] File does not exist, and was not created during the timeout delay.'));
    }, timeout);

    fs.access(filePath, fs.constants.R_OK, err => {
      if (!err) {
        clearTimeout(timer);
        watcher.close();
        resolve(true);
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
  // Note: navigating to this page only works in headful Chrome.
  await downloadPage.goto('chrome://downloads/');

  // Wait for our download to show up in the list by matching on its url.
  const jsHandle = await downloadPage.waitForFunction(downloadUrl => {
    const manager = document.querySelector('downloads-manager');
    const items = manager?.items_ || [];
    const match = items.find(item => {
      const itemUrl = typeof item.url === 'string' ? item.url : item.url?.url;
      const isComplete = item.state === 2 || item.state === 'COMPLETE';
      return itemUrl === downloadUrl && isComplete;
    });
    if (match) {
      return {
        fileName: match.fileName || match.file_name,
        filePath: match.filePath || match.file_path,
      };
    }
    return null;
  }, {polling: 100}, url);

  const fileMeta = await jsHandle.jsonValue();
  await downloadPage.close();

  return fileMeta;
}

// Start a local test server that serves a downloadable CSV file.
const server = http.createServer((req, res) => {
  if (req.url === `/${FILENAME}`) {
    res.writeHead(200, {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${FILENAME}"`,
    });
    res.end('name,value\npuppeteer,1\n');
    return;
  }
  res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
  res.end(`<a id="download" href="/${FILENAME}" download="${FILENAME}">Download CSV</a>`);
});

await new Promise(resolve => server.listen(0, resolve));
const {port} = server.address();
const downloadUrl = `http://localhost:${port}/${FILENAME}`;

const browser = await puppeteer.launch({headless: false});

const page = await browser.newPage();
await page.goto(`http://localhost:${port}/`);
await page.click('#download');

// Open chrome://downloads and wait for the file to finish downloading.
const fileMeta = await waitForFileToDownload(browser, downloadUrl);
console.log(`"${fileMeta.fileName}" was downloaded`);

// Verify the file exists in the expected location on the filesystem.
const targetPath = fileMeta.filePath || path.join(DOWNLOADS_FOLDER, fileMeta.fileName);
const exists = await checkFileExists(targetPath);
console.assert(exists, `${fileMeta.fileName} was not downloaded to correct location.`);

await browser.close();
server.close();
