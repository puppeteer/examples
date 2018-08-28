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
 * Custom network throttling for Lighthouse Testing using Puppeteer.
 *
 * Chrome gets launched by Puppeteer (normally done by LH) and custom network
 * conditions are established through Puppeteer's APIs. Lighthouse then audits
 * the page with those settings.
 *
 * The flow is:
 * 1. Disable Lighthouse's default throttling settings.
 * 2. Launch Chrome using Puppeteer. Tell Lighthouse to reuse that chrome
 *    instance instead of launching it's own.
 * 3. Hand the url to Lighthouse for testing.
 * Puppeteer observes the page opening, then sets up emulation.
 */

const puppeteer = require('puppeteer');
const lighthouse = require('lighthouse');
// const ReportGenerator = require('lighthouse/lighthouse-core/report/v2/report-generator');
const fs = require('fs');
const {URL} = require('url');

(async() => {

const url = 'https://www.chromestatus.com/features';

// Use Puppeteer to launch headless Chrome.
const browser = await puppeteer.launch({headless: true});
const remoteDebugPort =(new URL(browser.wsEndpoint())).port;

// Watch for Lighthouse to open url, then customize network conditions.
// Note: re-establishes throttle settings every time LH reloads the page. Shooooould be ok :)
browser.on('targetchanged', async target => {
  const page = await target.page();

  if (page && page.url() === url) {
    const client = await page.target().createCDPSession();
    // await client.send('Network.enable'); // Already enabled by pptr.
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      // values of 0 remove any active throttling. crbug.com/456324#c9
      latency: 800,
      downloadThroughput: Math.floor(1.6 * 1024 * 1024 / 8), // 1.6Mbps
      uploadThroughput: Math.floor(750 * 1024 / 8) // 750Kbps
    });
  }
});

// Lighthouse opens url and tests it.
// Note: Possible race with Puppeteer observing the tab opening using `targetchanged` above.
const {report} = await lighthouse(url, {
  port: remoteDebugPort,
  output: 'html',
  logLevel: 'info',
  disableNetworkThrottling: true,
  //disableCpuThrottling: true,
  //disableDeviceEmulation: true,
});

// Save html report.
fs.writeFileSync('results.html', report);
console.log('Results written.');

await browser.close();
})();
