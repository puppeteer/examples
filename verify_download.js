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
 * downloaded to the expected download location in the filesystem.
 *
 * Run:
 *   node verify_download.js
 */

import fs from 'node:fs';
import {mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import puppeteer from 'puppeteer';

const DOWNLOAD_PATH = path.resolve(import.meta.dirname, 'downloads');
const FILENAME = 'sample.csv';

/**
 * Check if file exists, watching containing directory meanwhile.
 * Resolve if the file exists, or if the file is created before the timeout
 * occurs.
 * @param {string} filePath
 * @param {number=} timeout
 * @returns {!Promise<void>}
 */
function waitForFileExists(filePath, timeout = 15000) {
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
      reject(new Error('[waitForFileExists] File does not exist, and was not created during the timeout delay.'));
    }, timeout);

    fs.access(filePath, fs.constants.R_OK, err => {
      if (!err) {
        clearTimeout(timer);
        watcher.close();
        resolve();
      }
    });
  });
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

await mkdir(DOWNLOAD_PATH, {recursive: true});

const browser = await puppeteer.launch();
const page = await browser.newPage();

// Change from the default ~/Downloads folder to our own.
const client = await page.createCDPSession();
await client.send('Browser.setDownloadBehavior', {
  behavior: 'allow',
  downloadPath: DOWNLOAD_PATH,
});

await page.goto(`http://localhost:${port}/`);
await page.click('#download');

// Verify the file lands on the file system.
const downloadedFile = path.join(DOWNLOAD_PATH, FILENAME);
await waitForFileExists(downloadedFile);
console.log(`Downloaded and verified: ${downloadedFile}`);

await browser.close();
server.close();
