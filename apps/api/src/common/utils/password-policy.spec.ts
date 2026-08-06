import { validatePasswordStrength } from './password-policy';

describe('password-policy', () => {
  it('rejects short passwords', () => {
    expect(validatePasswordStrength('Ab1')).toBeTruthy();
  });

  it('rejects no digit', () => {
    expect(validatePasswordStrength('abcdefgh')).toBeTruthy();
  });

  it('rejects common', () => {
    expect(validatePasswordStrength('password123')).toBeTruthy();
  });

  it('accepts strong enough', () => {
    expect(validatePasswordStrength('HouseGate42')).toBeNull();
  });
});
