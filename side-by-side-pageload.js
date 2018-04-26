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
  * Launches one or more URLs in different browser windows to visually compare
  * the page loads side-by-side. Options to center the windows on screen,
  * emulate mobile devices, and toggle CPU/Network throttling.
  *
  * Usage:
  *
  *     node side-by-side-pageload.js -h
  */

const fs = require('fs');
const puppeteer = require('puppeteer');
const devices = require('puppeteer/DeviceDescriptors');
const nexus5X = devices['Nexus 5X'];

const argv = require('yargs')
  .options({
    'mobile': {
      alias: 'm',
      describe: 'Emulate a mobile viewport',
      default: true,
    },
    'throttle': {
      describe: 'Throttles CPU by 4x and network to "Slow 3G"',
      default: true,
    },
    'center': {
      alias: 'c',
      describe: 'Centers the the windows on screen',
      default: true,
    },
    'url': {
      alias: 'u',
      describe: 'URL to load',
      demandOption: true,
    },
    'space': {
      alias: 's',
      describe: 'Spaces between windows (when emulating mobile)',
      default: 20,
    },
    'timeout': {
      alias: 't',
      describe: 'Timeout after page finish loading before closing the browers',
      default: 3000,
    },
  })
  .array('url')
  .help()
  .example('$0 --url https://devwebfeed.appspot.com https://devwebfeed.appspot.com/ssr')
  .example('$0 --no-throttle --no-mobile -u https://devwebfeed.appspot.com https://devwebfeed.appspot.com/ssr')
  .example('$0 -u https://www.bing.com/ https://www.google.com/ https://www.yahoo.com/')
  .wrap(null)
  .argv;

const urls = argv.url.length ? argv.url : [
  'https://devwebfeed.appspot.com/',
  'https://devwebfeed.appspot.com/ssr',
];

const CENTER_WINDOWS_ON_SCREEN = argv.center;
const SPACE_BETWEEN_WINDOWS = argv.space;
const MOBILE = argv.mobile;
const THROTTLE = argv.throttle;
const TIMEOUT_AFTER_LOAD = argv.timeout;
const DEFAULT_VIEWPORT = {width: 1000, height: 800, deviceScaleFactor: 2};

const sleep = (timeout) => new Promise(r => setTimeout(r, timeout));

async function launch(position, screen) {
  const totalSpacerWidthAddition = SPACE_BETWEEN_WINDOWS * (urls.length - 1);
  const totalWidthOfWindows = urls.length * DEFAULT_VIEWPORT.width;
  const totalWidthOfWindowsWithSpacers =  totalWidthOfWindows + totalSpacerWidthAddition;

  const centerScreenX = screen.width / 2;
  const centerScreenY = screen.height / 2;

  let dx = DEFAULT_VIEWPORT.width * position;
  dx += SPACE_BETWEEN_WINDOWS * position;

  const x = Math.floor(centerScreenX - (totalWidthOfWindowsWithSpacers / 2) + dx);
  const y = Math.floor(centerScreenY - (DEFAULT_VIEWPORT.height / 2));

  const browser = await puppeteer.launch({
    headless: false,
    args: [
      `--window-size=${DEFAULT_VIEWPORT.width},${DEFAULT_VIEWPORT.height}`,
      CENTER_WINDOWS_ON_SCREEN ? `--window-position=${x},${y}` : `--window-position=${dx},0`,
    ],
  });

  const page = await browser.newPage();
  if (MOBILE) {
    await page.emulate(nexus5X);
  } else {
    await page.setViewport(DEFAULT_VIEWPORT);
  }

  if (THROTTLE) {
    const client = await page.target().createCDPSession();
    // Emulate "Slow 3G" according to WebPageTest.
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 400,
      downloadThroughput: Math.floor(400 * 1024 / 8), // 400 Kbps
      uploadThroughput: Math.floor(400 * 1024 / 8) // 400 Kbps
    });
    await client.send('Emulation.setCPUThrottlingRate', {rate: 4});
  }

  return page;
}

(async () => {

const browser = await puppeteer.launch();
const page = await browser.newPage();

const screen = await page.evaluate(() => {
  return {width: window.screen.availWidth, height: window.screen.availHeight};
});
await browser.close();

// Take up full desktop space or emulate mobile.
DEFAULT_VIEWPORT.width = MOBILE ? nexus5X.viewport.width : Math.floor(screen.width / urls.length);
DEFAULT_VIEWPORT.height = MOBILE ? nexus5X.viewport.height : screen.height;

const pages = await Promise.all(urls.map((url, i) => launch(i, screen)));

const start = Date.now();

const waitForPage = async pos => {
  const page = pages[pos];
  const url = urls[pos];
  return page.goto(url, {waitUntil: 'networkidle2'})
      .then(() => Date.now());
};

const stopTimes = await Promise.all(urls.map((url, i) => waitForPage(i)));
stopTimes.forEach((stopTime, i) => console.log(`Page ${i + 1} took ${stopTime - start} ms to reach network idle`));

await sleep(TIMEOUT_AFTER_LOAD);

await Promise.all(pages.map(page => page.browser().close()));

})();
