/**
 * @author ebidel@ (Eric Bidelman)
 * License Apache-2.0
 *
 * How to:
 * 1. Use chrome-launcher module to launch chrome
 * 2. Connect to that browser instance using Puppeteer.
 * 3. Run Lighthouse on the page.
 */

const chromeLauncher = require('chrome-launcher');
const puppeteer = require('puppeteer');
const lighthouse = require('lighthouse');
const request = require('request');
const util = require('util');

(async() => {

const URL = 'https://www.chromestatus.com/features';

const opts = {
  chromeFlags: ['--headless'],
  logLevel: 'info',
  output: 'json'
};

// Launch chrome using chrome-launcher.
const chrome = await chromeLauncher.launch(opts);
opts.port = chrome.port;

// Connect to it using puppeteer.connect().
const resp = await util.promisify(request)(`http://localhost:${opts.port}/json/version`);
const {webSocketDebuggerUrl} = JSON.parse(resp.body);
const browser = await puppeteer.connect({browserWSEndpoint: webSocketDebuggerUrl});

// Run Lighthouse.
const lhr = await lighthouse(URL, opts, null);
console.log(`Lighthouse score: ${lhr.score}`);

await browser.disconnect();
await chrome.kill();

})();