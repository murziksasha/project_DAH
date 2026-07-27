import { bomCsv, csvEscape, toCsv } from './csv-export';

describe('csv-export', () => {
  it('escapes quotes and separators', () => {
    expect(csvEscape('a;b')).toBe('"a;b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
  });

  it('joins rows with semicolon', () => {
    expect(toCsv([['a', 1], ['b', 2]])).toBe('a;1\r\nb;2');
  });

  it('adds UTF-8 BOM', () => {
    const buf = bomCsv('x');
    expect(buf[0]).toBe(0xef);
    expect(buf.toString('utf8').slice(1)).toBe('x');
  });
});
