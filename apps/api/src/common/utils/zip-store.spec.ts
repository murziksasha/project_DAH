import { createZipStore } from './zip-store';

describe('createZipStore', () => {
  it('builds a zip with local + central signatures', () => {
    const zip = createZipStore([
      { name: 'a.pdf', data: Buffer.from('%PDF-1.4 a') },
      { name: 'b.pdf', data: Buffer.from('%PDF-1.4 b') },
    ]);
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    expect(zip.includes(Buffer.from('a.pdf'))).toBe(true);
    expect(zip.includes(Buffer.from('b.pdf'))).toBe(true);
    // end of central directory
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
    expect(zip.readUInt16LE(zip.length - 14)).toBe(2);
  });
});
