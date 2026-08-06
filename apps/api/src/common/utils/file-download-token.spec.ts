import {
  buildFileDownloadPath,
  isAllowedStorageKey,
  signFileDownload,
  verifyFileDownload,
} from './file-download-token';

describe('file-download-token', () => {
  const secret = 'test-secret-for-hmac';
  const key = 'requests/550e8400-e29b-41d4-a716-446655440000/photo.jpg';

  it('accepts valid storage keys', () => {
    expect(isAllowedStorageKey(key)).toBe(true);
    expect(
      isAllowedStorageKey('expenses/550e8400-e29b-41d4-a716-446655440000/doc.pdf'),
    ).toBe(true);
    expect(
      isAllowedStorageKey('documents/550e8400-e29b-41d4-a716-446655440000/a_b-1.png'),
    ).toBe(true);
  });

  it('rejects path traversal and unknown folders', () => {
    expect(isAllowedStorageKey('../etc/passwd')).toBe(false);
    expect(isAllowedStorageKey('requests/../secret')).toBe(false);
    expect(isAllowedStorageKey('other/550e8400-e29b-41d4-a716-446655440000/x.jpg')).toBe(
      false,
    );
    expect(isAllowedStorageKey('')).toBe(false);
  });

  it('round-trips sign/verify', () => {
    const { exp, sig } = signFileDownload(key, secret, 600);
    expect(verifyFileDownload(key, exp, sig, secret)).toBe(true);
  });

  it('rejects wrong signature and expired token', () => {
    const { exp, sig } = signFileDownload(key, secret, 600);
    expect(verifyFileDownload(key, exp, 'not-the-sig', secret)).toBe(false);
    expect(verifyFileDownload(key, exp - 10_000, sig, secret)).toBe(false);
    const past = Math.floor(Date.now() / 1000) - 10;
    const bad = signFileDownload(key, secret, 600);
    expect(verifyFileDownload(key, past, bad.sig, secret)).toBe(false);
  });

  it('builds same-origin download path', () => {
    const path = buildFileDownloadPath(key, secret, 3600);
    expect(path.startsWith('/api/files/download?')).toBe(true);
    expect(path).toContain('key=');
    expect(path).toContain('exp=');
    expect(path).toContain('sig=');
    expect(path).not.toContain('9000');
    expect(path).not.toContain('minio');
  });
});
