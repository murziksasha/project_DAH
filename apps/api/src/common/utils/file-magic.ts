/**
 * Validate upload buffers by magic bytes (do not trust client mimetype).
 */

export type DetectedFileKind = 'pdf' | 'jpeg' | 'png' | 'webp';

const MIME_BY_KIND: Record<DetectedFileKind, string> = {
  pdf: 'application/pdf',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export function detectFileKind(buf: Buffer): DetectedFileKind | null {
  if (!buf || buf.length < 12) return null;
  // PDF
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
    return 'pdf';
  }
  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'jpeg';
  }
  // PNG
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'png';
  }
  // WEBP: RIFF....WEBP
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return 'webp';
  }
  return null;
}

export function assertAllowedUpload(buf: Buffer, clientMime?: string): {
  kind: DetectedFileKind;
  mime: string;
} {
  const kind = detectFileKind(buf);
  if (!kind) {
    throw new Error('Невпізнаний або заборонений тип файлу (дозволено PDF, JPEG, PNG, WebP)');
  }
  const mime = MIME_BY_KIND[kind];
  if (clientMime && clientMime !== mime) {
    // Allow close variants
    const ok =
      (kind === 'jpeg' && (clientMime === 'image/jpg' || clientMime === 'image/jpeg')) ||
      clientMime === mime;
    if (!ok) {
      throw new Error(`MIME не збігається з вмістом файлу (очікується ${mime})`);
    }
  }
  return { kind, mime };
}
