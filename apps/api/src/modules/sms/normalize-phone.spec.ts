import { normalizePhone } from './sms.service';

describe('normalizePhone', () => {
  it('normalizes UA formats', () => {
    expect(normalizePhone('0501112233')).toBe('+380501112233');
    expect(normalizePhone('380501112233')).toBe('+380501112233');
    expect(normalizePhone('+380501112233')).toBe('+380501112233');
    expect(normalizePhone('501112233')).toBe('+380501112233');
  });
});
