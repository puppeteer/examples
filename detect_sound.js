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
  * Trivially detect if media elements on the page are producing audio on page load.
  * Note: approach doesn't work in headless Chrome (which doesn't play sound).
  */

const puppeteer = require('puppeteer');

const URL = process.env.URL || 'https://www.youtube.com/watch?v=sK1ODp0nDbM';

(async() => {

// Note: headless doesn't play audio. Launch headful chrome.
const browser = await puppeteer.launch({headless: false});

const page = await browser.newPage();
await page.goto(URL, {waitUntil: 'networkidle2'});

const playingAudio = await page.evaluate(() => {
  const mediaEls = Array.from(document.querySelectorAll('audio,video'));
  return mediaEls.every(el => el.duration > 0 && !el.paused);
});

console.log('Playing audio:', playingAudio);

await browser.close();

})();
