# OpenAPI → `@dah/api-client` (Package E)

Nest Swagger already exposes **«Мій дім API»** when `SWAGGER_ENABLED=true` (dev):

- Spec UI: `http://localhost:3001/api/docs`
- JSON: `http://localhost:3001/api/docs-json`

## Recommended flow

```bash
# 1. Run API with Swagger
SWAGGER_ENABLED=true npm run dev:api

# 2. Export OpenAPI document
curl -s http://localhost:3001/api/docs-json -o packages/api-client/openapi.json

# 3. (Optional) generate types with openapi-typescript
# npx openapi-typescript packages/api-client/openapi.json -o packages/api-client/src/generated.ts
```

Until full codegen is wired, keep hand-maintained types in `packages/api-client/src/index.ts` aligned with `SPEC/05-api-reference.md` on breaking changes.

## Policy

- Breaking API/schema changes → update SPEC + CHANGELOG + this export.
- Production: leave `SWAGGER_ENABLED=false` (see SECURITY-CHECKLIST).
