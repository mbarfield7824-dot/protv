import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Converts a reviewed SRT file to WebVTT for a Mux text track and checks it
// against the title's length. Never generates captions and never calls Mux.
// Usage: node tools/captions.mjs <in.srt> <out.vtt> <title-duration-seconds>

const TIME = /^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/;

function seconds(stamp) {
  const match = TIME.exec(stamp.trim());
  if (!match) throw new Error(`bad timestamp: ${stamp}`);
  const [, h, m, s, ms] = match.map(Number);
  return h * 3600 + m * 60 + s + ms / 1000;
}

export function srtToVtt(srt, durationSeconds) {
  const blocks = srt.replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim().split(/\n{2,}/);
  const cues = [];
  const problems = [];
  let previousStart = -1;
  for (const block of blocks) {
    const lines = block.split('\n');
    const timing = lines.findIndex(line => line.includes('-->'));
    if (timing < 0) {
      problems.push(`no timing line: ${lines[0]}`);
      continue;
    }
    const [from, to] = lines[timing].split('-->').map(part => part.trim().split(/\s+/)[0]);
    const start = seconds(from);
    const end = seconds(to);
    const text = lines.slice(timing + 1).join('\n').trim();
    if (end <= start) problems.push(`cue ends before it starts at ${from}`);
    if (start < previousStart) problems.push(`cue out of order at ${from}`);
    if (durationSeconds && end > durationSeconds + 1) problems.push(`cue at ${from} ends after the title (${durationSeconds} s)`);
    if (!text) problems.push(`empty cue at ${from}`);
    previousStart = start;
    cues.push(`${from.replace(',', '.')} --> ${to.replace(',', '.')}\n${text}`);
  }
  if (cues.length === 0) problems.push('no cues');
  return { vtt: `WEBVTT\n\n${cues.join('\n\n')}\n`, cues: cues.length, problems };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output, duration] = process.argv.slice(2);
  if (!input || !output) throw new Error('usage: node tools/captions.mjs <in.srt> <out.vtt> <title-duration-seconds>');
  const result = srtToVtt(await readFile(input, 'utf8'), Number(duration) || 0);
  await writeFile(output, result.vtt);
  console.log(`${result.cues} cues written to ${output}`);
  for (const problem of result.problems) console.log(`PROBLEM: ${problem}`);
  if (result.problems.length) process.exitCode = 1;
  console.log('A person must still watch the title with these captions before they are attached.');
}
