/**
 * Phase 3: typed bridge from the web app to the generated OpenAPI contract (@dah/api-client).
 * Type-only at the call sites (`satisfies ApiSchema<'LoginDto'>`), so runtime behaviour is unchanged;
 * a renamed DTO field or route in the API now fails `typecheck:web` instead of failing in production.
 * The OpenAPI spec documents request bodies (DTOs) but not response shapes yet, so responses stay hand-typed.
 */
import type { components, paths } from '@dah/api-client';

/** A request DTO schema from docs/api/openapi.json, e.g. `ApiSchema<'LoginDto'>`. */
export type ApiSchema<N extends keyof components['schemas']> = components['schemas'][N];

type StripApiPrefix<P> = P extends `/api${infer R}` ? R : never;

/** Route as passed to apiFetch (without the `/api` prefix), e.g. `'/kep/sessions/{id}'`. */
export type WebApiPath = StripApiPrefix<keyof paths>;

type JsonBody<Op> = Op extends { requestBody?: { content: { 'application/json': infer B } } } ? B : never;

/** JSON request body of a route + method, e.g. `ApiRequestBody<'/auth/login', 'post'>`. */
export type ApiRequestBody<
  P extends WebApiPath,
  M extends 'post' | 'put' | 'patch',
> = JsonBody<paths[`/api${P}` & keyof paths][M & keyof paths[`/api${P}` & keyof paths]]>;

type PathParamNames<P extends string> = P extends `${string}{${infer N}}${infer Rest}`
  ? N | PathParamNames<Rest>
  : never;

/**
 * Compile-time checked route builder: `apiRoute('/kep/sessions/{id}', { id })` → `/kep/sessions/<id>`.
 * Unknown routes or missing path params do not compile. Values are URI-encoded.
 */
export function apiRoute<P extends WebApiPath>(
  path: P,
  ...params: PathParamNames<P> extends never ? [] : [Record<PathParamNames<P>, string>]
): string {
  const values = (params[0] ?? {}) as Record<string, string>;
  return path.replace(/\{([^}]+)\}/g, (_, name: string) => {
    const v = values[name];
    if (v === undefined) throw new Error(`apiRoute: missing path param "${name}" for ${path}`);
    return encodeURIComponent(v);
  });
}
