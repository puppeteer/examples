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
 *     node side-by-side-pageload.js -u https://example.com -u https://example.org
 *     node side-by-side-pageload.js --no-throttle --no-mobile -u https://example.com -u https://example.org
 */

import {setTimeout} from 'node:timers/promises';
import {parseArgs} from 'node:util';
import puppeteer, {KnownDevices, PredefinedNetworkConditions} from 'puppeteer';

const nexus5X = KnownDevices['Nexus 5X'];

const {values: argv, positionals} = parseArgs({
  allowNegative: true,
  allowPositionals: true,
  options: {
    mobile: {type: 'boolean', short: 'm', default: true},
    throttle: {type: 'boolean', default: true},
    center: {type: 'boolean', short: 'c', default: true},
    url: {type: 'string', short: 'u', multiple: true},
    space: {type: 'string', short: 's', default: '20'},
    timeout: {type: 'string', short: 't', default: '3000'},
    help: {type: 'boolean', short: 'h', default: false},
  },
});

if (argv.help) {
  console.log(`Usage: node side-by-side-pageload.js [options] [urls...]

Options:
  -u, --url <url>      URL to load (can be passed multiple times, or as positional args)
  -m, --mobile         Emulate a mobile viewport (default: true; pass --no-mobile to disable)
      --throttle       Throttle CPU by 4x and network to "Slow 3G" (default: true; pass --no-throttle to disable)
  -c, --center         Center the windows on screen (default: true; pass --no-center to disable)
  -s, --space <px>     Space between windows (default: 20)
  -t, --timeout <ms>   Timeout after page finishes loading before closing browsers (default: 3000)
  -h, --help           Show this help message`);
  process.exit(0);
}

const urls = [...(argv.url || []), ...positionals];
if (!urls.length) {
  urls.push('https://developer.chrome.com/', 'https://chromestatus.com/roadmap');
}

const CENTER_WINDOWS_ON_SCREEN = argv.center;
const SPACE_BETWEEN_WINDOWS = Number(argv.space);
const MOBILE = argv.mobile;
const THROTTLE = argv.throttle;
const TIMEOUT_AFTER_LOAD = Number(argv.timeout);
const DEFAULT_VIEWPORT = {width: 1000, height: 800, deviceScaleFactor: 2};

async function launch(position, screen) {
  const totalSpacerWidthAddition = SPACE_BETWEEN_WINDOWS * (urls.length - 1);
  const totalWidthOfWindows = urls.length * DEFAULT_VIEWPORT.width;
  const totalWidthOfWindowsWithSpacers = totalWidthOfWindows + totalSpacerWidthAddition;

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
    await page.emulateNetworkConditions(PredefinedNetworkConditions['Slow 3G']);
    await page.emulateCPUThrottling(4);
  }

  return page;
}

const browser = await puppeteer.launch();
const page = await browser.newPage();

const screen = await page.evaluate(() => ({
  width: window.screen.availWidth,
  height: window.screen.availHeight,
}));
await browser.close();

// Take up full desktop space or emulate mobile.
DEFAULT_VIEWPORT.width = MOBILE ? nexus5X.viewport.width : Math.floor(screen.width / urls.length);
DEFAULT_VIEWPORT.height = MOBILE ? nexus5X.viewport.height : screen.height;

const pages = await Promise.all(urls.map((_url, i) => launch(i, screen)));

const start = Date.now();

const waitForPage = async pos => {
  await pages[pos].goto(urls[pos], {waitUntil: 'networkidle2'});
  return Date.now();
};

const stopTimes = await Promise.all(urls.map((_url, i) => waitForPage(i)));
stopTimes.forEach((stopTime, i) =>
  console.log(`Page ${i + 1} took ${stopTime - start} ms to reach network idle`)
);

await setTimeout(TIMEOUT_AFTER_LOAD);

await Promise.all(pages.map(p => p.browser().close()));
