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
 * Uses the web speech synth API to make the browser talk.
 *
 * Run it:
 * node speech.js -t Hello there, my name is Jarvis.
 * node speech.js -t Read anything good lately?
 * CHROME_PATH=/path/to/chrome node speech.js -t hi and bye!
 */

const fs = require('fs');
const puppeteer = require('puppeteer');

const DEFAULT_TXT = 'Hello there, my name is Puppeteer. I am controlling your browser.';

const executablePath = process.env.CHROME_PATH ||
    '/Applications/Google\ Chrome\ Canary.app/Contents/MacOS/Google\ Chrome\ Canary';

(async() => {

const browser = await puppeteer.launch({
  executablePath,  // Note: need Chrome (not Chromium) to use non-default voices.
  headless: false, // Speech synth API doesn't work in headless. crbug.com/815388
  args: [
    '--window-size=0,0', // Launch baby window for fun.
    '--window-position=0,0',
    '--enable-speech-dispatcher', // Needed for Linux?
  ],
});

const page = await browser.newPage();

// Clever way to "communicate with page". Know when speech is done.
page.on('console', async msg => {
  if (msg.text() === 'SPEECH_DONE') {
    await browser.close();
  }
});

const flagIdx = process.argv.findIndex(item => item === '-t');
const text = flagIdx === -1 ? DEFAULT_TXT : process.argv.slice(flagIdx + 1).join(' ');

await page.evaluateOnNewDocument(text => window.TEXT2SPEECH = text, text);

const html = fs.readFileSync('./html/speech_synth.html', {encoding: 'utf-8'});
// Cause a navigation so the evaluateOnNewDocument kicks in.
await page.goto(`data:text/html,${html}`);

const button = await page.$('button');
button.click();

})();
