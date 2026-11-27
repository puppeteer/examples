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
 * Shows how to use Puppeteer's code coverage API to measure CSS/JS coverage across
 * different points of time during loading. Great for determining if a lazy loading strategy
 * is paying off or working correctly.
 *
 * Run:
 *   URL=https://example.com node code_coverage.js
 */

import {stripVTControlCharacters, styleText} from 'node:util';
import puppeteer from 'puppeteer';

const URL = process.env.URL || 'https://chromestatus.com/roadmap';

const EVENTS = [
  'domcontentloaded',
  'load',
  // 'networkidle2',
  'networkidle0',
];

function formatBytesToKB(bytes) {
  if (bytes > 1024) {
    const formattedNum = new Intl.NumberFormat('en-US', {maximumFractionDigits: 1}).format(bytes / 1024);
    return `${formattedNum}KB`;
  }
  return `${bytes} bytes`;
}

function formatTable(headers, rows) {
  const allRows = [headers, ...rows].map(row => row.map(String));
  const widths = headers.map((_, col) =>
    Math.max(...allRows.map(row => stripVTControlCharacters(row[col]).length))
  );
  const pad = (str, width) => str + ' '.repeat(width - stripVTControlCharacters(str).length);
  const border = (left, mid, right) =>
    styleText('gray', left + widths.map(w => '─'.repeat(w + 2)).join(mid) + right);
  const formatRow = row =>
    styleText('gray', '│') +
    row.map((cell, i) => ` ${pad(cell, widths[i])} `).join(styleText('gray', '│')) +
    styleText('gray', '│');

  return [
    border('┌', '┬', '┐'),
    formatRow(headers.map(h => styleText('white', h))),
    border('├', '┼', '┤'),
    ...rows.map(row => formatRow(row.map(String))),
    border('└', '┴', '┘'),
  ].join('\n');
}

class UsageFormatter {
  constructor(stats) {
    this.stats = stats;
  }

  static eventLabel(event) {
    return styleText('magenta', event);
  }

  summary(used = this.stats.usedBytes, total = this.stats.totalBytes) {
    const percent = total ? Math.round((used / total) * 100) : 0;
    return `${formatBytesToKB(used)}/${formatBytesToKB(total)} (${percent}%)`;
  }

  shortSummary(used, total = this.stats.totalBytes) {
    const percent = total ? Math.round((used / total) * 100) : 0;
    return used ? `${formatBytesToKB(used)} (${percent}%)` : 0;
  }

  /**
   * Constructs a bar chart for the % usage of each value.
   * @param {!{jsUsed: number, cssUsed: number, totalBytes: number}=} stats Usage stats.
   * @return {string}
   */
  barGraph(stats = this.stats) {
    const maxBarWidth = 30;
    const jsLen = stats.totalBytes ? Math.round((stats.jsUsed / stats.totalBytes) * maxBarWidth) : 0;
    const cssLen = stats.totalBytes ? Math.round((stats.cssUsed / stats.totalBytes) * maxBarWidth) : 0;
    const unusedLen = Math.max(0, maxBarWidth - jsLen - cssLen);

    return (
      styleText('bgRedBright', ' '.repeat(jsLen)) +
      styleText('bgBlueBright', ' '.repeat(cssLen)) +
      styleText('bgGray', ' '.repeat(unusedLen))
    );
  }
}

const stats = new Map();

/**
 * @param {!Array<!Object>} coverage
 * @param {string} type Either "css" or "js" to indicate which type of coverage.
 * @param {string} eventType The page event when the coverage was captured.
 */
function addUsage(coverage, type, eventType) {
  for (const entry of coverage) {
    if (!stats.has(entry.url)) {
      stats.set(entry.url, []);
    }

    const urlStats = stats.get(entry.url);

    let eventStats = urlStats.find(item => item.eventType === eventType);
    if (!eventStats) {
      eventStats = {
        cssUsed: 0,
        jsUsed: 0,
        get usedBytes() { return this.cssUsed + this.jsUsed; },
        totalBytes: 0,
        get percentUsed() {
          return this.totalBytes ? Math.round((this.usedBytes / this.totalBytes) * 100) : 0;
        },
        eventType,
        url: entry.url,
      };
      urlStats.push(eventStats);
    }

    eventStats.totalBytes += entry.text.length;

    for (const range of entry.ranges) {
      eventStats[`${type}Used`] += range.end - range.start - 1;
    }
  }
}

async function collectCoverage() {
  const browser = await puppeteer.launch();

  // Do separate load for each event. See
  // https://github.com/puppeteer/puppeteer/issues/1887
  const collectPromises = EVENTS.map(async event => {
    console.log(`Collecting coverage @ ${UsageFormatter.eventLabel(event)}...`);

    const page = await browser.newPage();

    await Promise.all([
      page.coverage.startJSCoverage(),
      page.coverage.startCSSCoverage(),
    ]);

    await page.goto(URL, {waitUntil: event});

    const [jsCoverage, cssCoverage] = await Promise.all([
      page.coverage.stopJSCoverage(),
      page.coverage.stopCSSCoverage(),
    ]);

    addUsage(cssCoverage, 'css', event);
    addUsage(jsCoverage, 'js', event);

    await page.close();
  });

  await Promise.all(collectPromises);
  await browser.close();
}

await collectCoverage();

for (const [url, vals] of stats) {
  console.log('\n' + styleText('cyan', url));

  const headers = [
    'Event',
    `${styleText('bgRedBright', ' JS ')} ${styleText('bgBlueBright', ' CSS ')} % used`,
    'JS used',
    'CSS used',
    'Total bytes used',
  ];

  const rows = [];
  for (const event of EVENTS) {
    const usageForEvent = vals.filter(val => val.eventType === event);

    if (usageForEvent.length) {
      for (const entryStats of usageForEvent) {
        const formatter = new UsageFormatter(entryStats);
        rows.push([
          UsageFormatter.eventLabel(entryStats.eventType),
          formatter.barGraph(),
          formatter.shortSummary(entryStats.jsUsed),
          formatter.shortSummary(entryStats.cssUsed),
          formatter.summary(),
        ]);
      }
    } else {
      rows.push([UsageFormatter.eventLabel(event), 'no usage found', '-', '-', '-']);
    }
  }

  console.log(formatTable(headers, rows));
}

// Print total usage for each event.
for (const event of EVENTS) {
  let totalBytes = 0;
  let totalUsedBytes = 0;

  for (const eventStatsForUrl of stats.values()) {
    const statsForEvent = eventStatsForUrl.find(stat => stat.eventType === event);
    if (statsForEvent) {
      totalBytes += statsForEvent.totalBytes;
      totalUsedBytes += statsForEvent.usedBytes;
    }
  }

  const percentUsed = totalBytes ? Math.round((totalUsedBytes / totalBytes) * 100) : 0;

  console.log(
    `Total used @ ${styleText('magenta', event)}: ` +
    `${formatBytesToKB(totalUsedBytes)}/${formatBytesToKB(totalBytes)} (${percentUsed}%)`
  );
}
