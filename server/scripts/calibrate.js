/**
 * Turns the published strength standards into DOTS-point thresholds.
 *
 * Each anchor is a bodyweight multiple at the reference bodyweight. Convert it
 * to kilograms there, then to DOTS points with that sex's polynomial. Those
 * points are what the ranking interpolates between, so the non-linearity of
 * the strength-to-mass relationship is carried by the DOTS curve rather than
 * by a straight proportion.
 *
 *   node scripts/calibrate.js     # rewrites lib/thresholds.js
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ANCHOR_LEVELS,
  ANCHOR_MULTIPLES,
  REFERENCE_BODYWEIGHT_KG,
  dotsPolynomial,
} from '../lib/scoring-config.js';

const OUTPUT = path.resolve(import.meta.dirname, '..', 'lib', 'thresholds.js');

/** { M: { squat: [t1..t6], ... }, F: { ... } } in DOTS points. */
export function computeThresholds() {
  const thresholds = {};
  for (const sex of Object.keys(ANCHOR_MULTIPLES)) {
    const referenceBw = REFERENCE_BODYWEIGHT_KG[sex];
    const p = dotsPolynomial(sex, referenceBw);
    thresholds[sex] = {};
    for (const [code, multiples] of Object.entries(ANCHOR_MULTIPLES[sex])) {
      thresholds[sex][code] = multiples.map((multiple) => (multiple * referenceBw * 500) / p);
    }
  }
  return thresholds;
}

function render(thresholds) {
  const lines = [
    '/**',
    ' * GENERATED FILE - do not edit by hand.',
    ' * Regenerate with: npm run calibrate',
    ' *',
    ' * Anchor thresholds in DOTS points, derived from the bodyweight multiples',
    ' * in scoring-config.js at the reference bodyweight for each sex.',
    ' *',
    ` * Levels, in order: ${ANCHOR_LEVELS.join(', ')}.`,
    ' */',
    '',
  ];

  for (const sex of Object.keys(thresholds)) {
    const referenceBw = REFERENCE_BODYWEIGHT_KG[sex];
    const p = dotsPolynomial(sex, referenceBw);
    lines.push(
      `// ${sex === 'M' ? 'Men' : 'Women'}: reference bodyweight ${referenceBw} kg, ` +
        `P(${referenceBw}) = ${p.toFixed(5)}`,
    );
    lines.push('//');
    lines.push(
      `// ${'exercise'.padEnd(9)}${ANCHOR_LEVELS.map((l) => l.slice(0, 11).padStart(13)).join('')}`,
    );
    for (const [code, points] of Object.entries(thresholds[sex])) {
      const kg = ANCHOR_MULTIPLES[sex][code].map((m) => `${(m * referenceBw).toFixed(1)}kg`);
      lines.push(`// ${code.padEnd(9)}${kg.map((v) => v.padStart(13)).join('')}`);
      lines.push(`// ${''.padEnd(9)}${points.map((v) => v.toFixed(1).padStart(13)).join('')}`);
    }
    lines.push('');
  }

  lines.push('export const DOTS_THRESHOLDS = {');
  for (const sex of Object.keys(thresholds)) {
    lines.push(`  ${sex}: {`);
    for (const [code, points] of Object.entries(thresholds[sex])) {
      lines.push(`    ${code}: [${points.map((n) => String(n)).join(', ')}],`);
    }
    lines.push('  },');
  }
  lines.push('};');
  lines.push('');

  return lines.join('\n');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const thresholds = computeThresholds();
  writeFileSync(OUTPUT, render(thresholds), 'utf8');
  const count = Object.values(thresholds).reduce((n, bySex) => n + Object.keys(bySex).length, 0);
  console.log(`[calibrate] wrote ${path.relative(process.cwd(), OUTPUT)} (${count} exercise/sex pairs)`);
}
