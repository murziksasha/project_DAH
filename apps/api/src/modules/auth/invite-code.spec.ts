import { inviteCodeMatches } from './auth.service';

describe('inviteCodeMatches (constant-time)', () => {
  it('matches exact codes only', () => {
    expect(inviteCodeMatches('ABC-123', 'ABC-123')).toBe(true);
    expect(inviteCodeMatches('ABC-124', 'ABC-123')).toBe(false);
    expect(inviteCodeMatches('ABC', 'ABC-123')).toBe(false);
    expect(inviteCodeMatches('', '')).toBe(false);
  });
});
