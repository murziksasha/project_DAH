import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildNbuQrString, generateNbuQrDataUrl, generateNbuQrSvg } from './nbu-qr';

describe('nbu-qr', () => {
  const sampleOptions = {
    recipientName: 'ОСББ "Затишний Дім 50"',
    iban: 'ua 12 305299 0000026001234567890',
    amount: 850.5,
    edrpou: '12345678',
    purpose: 'Внески на утримання будинку кв. 14, Петренко І.І.',
  };

  it('builds standard NBU EPC payload conforming to NBU Resolution No. 3', () => {
    const raw = buildNbuQrString(sampleOptions);
    const lines = raw.split('\n');

    assert.equal(lines[0], 'BCD'); // Service tag
    assert.equal(lines[1], '002'); // Version
    assert.equal(lines[2], '1');   // UTF-8
    assert.equal(lines[3], 'SCT'); // Standard Credit Transfer
    assert.equal(lines[4], '');    // BIC
    assert.equal(lines[5], 'ОСББ "Затишний Дім 50"');
    assert.equal(lines[6], 'UA123052990000026001234567890'); // Cleaned IBAN
    assert.equal(lines[7], 'UAH850.50');
    assert.equal(lines[8], '12345678'); // EDRPOU
    assert.equal(lines[9], ''); // Reference
    assert.equal(lines[10], 'Внески на утримання будинку кв. 14, Петренко І.І.');
  });

  it('handles zero or negative amount gracefully without amount line', () => {
    const raw = buildNbuQrString({
      ...sampleOptions,
      amount: 0,
    });
    const lines = raw.split('\n');
    assert.equal(lines[7], '');
  });

  it('generates SVG markup containing svg tags', async () => {
    const svg = await generateNbuQrSvg(sampleOptions);
    assert.ok(svg.includes('<svg'));
    assert.ok(svg.includes('</svg>'));
  });

  it('generates PNG DataURL starting with data:image/png;base64', async () => {
    const dataUrl = await generateNbuQrDataUrl(sampleOptions);
    assert.ok(dataUrl.startsWith('data:image/png;base64,'));
  });
});
