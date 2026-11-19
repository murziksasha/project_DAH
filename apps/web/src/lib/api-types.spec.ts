import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { apiRoute, type ApiRequestBody, type ApiSchema } from './api-types';

describe('api-types (generated @dah/api-client contract)', () => {
  it('builds routes and encodes path params', () => {
    assert.equal(apiRoute('/auth/login'), '/auth/login');
    assert.equal(apiRoute('/kep/sessions/{id}', { id: 'a/b c' }), '/kep/sessions/a%2Fb%20c');
  });

  it('request body types follow the OpenAPI DTOs (compile-time)', () => {
    const login = { email: 'a@b.c', password: 'x' } satisfies ApiSchema<'LoginDto'>;
    const sot: ApiRequestBody<'/journal/sot', 'post'> = { buildingId: 'b', enabled: false };
    assert.equal(login.email, 'a@b.c');
    assert.equal(sot.enabled, false);
  });
});
