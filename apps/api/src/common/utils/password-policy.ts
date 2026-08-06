/**
 * Password strength for self-hosted OSBB (200–300 users).
 * Min 8 chars, at least one letter + one digit; block common passwords.
 */

import { BadRequestException } from '@nestjs/common';

const COMMON = new Set(
  [
    'password',
    'password1',
    'password123',
    '12345678',
    '123456789',
    'qwerty123',
    'admin123',
    'welcome1',
    'letmein1',
    'changeme',
    'changeme1',
    'osbb1234',
    'мийдiм',
    'мійдім12',
  ].map((s) => s.toLowerCase()),
);

export function validatePasswordStrength(password: string): string | null {
  if (typeof password !== 'string' || password.length < 8) {
    return 'Пароль має містити щонайменше 8 символів';
  }
  if (password.length > 128) {
    return 'Пароль занадто довгий (макс. 128)';
  }
  if (!/[A-Za-zА-Яа-яІіЇїЄєҐґ]/.test(password)) {
    return 'Пароль має містити хоча б одну літеру';
  }
  if (!/\d/.test(password)) {
    return 'Пароль має містити хоча б одну цифру';
  }
  if (COMMON.has(password.toLowerCase())) {
    return 'Цей пароль занадто поширений — оберіть інший';
  }
  return null;
}

export function assertPasswordStrength(password: string): void {
  const err = validatePasswordStrength(password);
  if (err) throw new BadRequestException(err);
}
