import { detectFileKind, assertAllowedUpload } from './file-magic';

describe('file-magic', () => {
  it('detects PDF', () => {
    const buf = Buffer.from('%PDF-1.4 rest');
    expect(detectFileKind(buf)).toBe('pdf');
  });

  it('detects PNG signature', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    expect(detectFileKind(buf)).toBe('png');
  });

  it('rejects empty', () => {
    expect(() => assertAllowedUpload(Buffer.alloc(0))).toThrow();
  });
});
