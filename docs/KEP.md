# КЕП / Дія.Підпис — інтеграція

Модуль `apps/api/src/modules/kep` забезпечує **кваліфікований електронний підпис** протоколів зборів.

## Провайдери

| `KEP_PROVIDER` | Опис |
|----------------|------|
| `mock` | Локальний демо-IdP (`/api/kep/mock/authorize`) |
| `diia` | [Дія.Підпис](https://integration.diia.gov.ua/signature.html) — offer + deeplink + webhook |
| `cloud_kep` | Універсальний хмарний QES (OAuth authorize + token) |
| `cades` | Клієнт (EUSign) підписує `digest` і шле `signatureCms` |

## Flow (збори)

```
POST /api/meetings/:id/sign  { provider?, returnUrl? }
  → SignSession + (authorizeUrl | deeplink)
  → user signs
POST /api/kep/sessions/:id/complete       (mock page)
  або POST /api/kep/webhook               (Diia / cloud)
  або POST /api/kep/sessions/:id/complete-auth  (JWT + CAdES)
  → MeetingSignature status=signed
GET  /api/kep/sessions/:id
```

Альтернатива: `POST /api/kep/meetings/:meetingId/sign`.

## Production Diia.Підпис

1. Зареєструйте сервіс на [integration.diia.gov.ua](https://integration.diia.gov.ua/signature.html).
2. Отримайте acquirer token / branch.
3. `.env`:

```env
KEP_ENABLED=true
KEP_PROVIDER=diia
KEP_ALLOW_MOCK=false
KEP_DIIA_OFFER_URL=https://…  # URL з кабінету інтегратора
KEP_DIIA_ACQUIRER_TOKEN=…
KEP_DIIA_BRANCH_ID=…
KEP_WEBHOOK_SECRET=…
APP_URL=https://your-domain
API_PUBLIC_URL=https://your-domain/api
```

4. Webhook Diia → `POST /api/kep/webhook`  
   Headers: `X-Kep-Secret: <KEP_WEBHOOK_SECRET>` або HMAC `X-Kep-Signature: sha256=…`

5. **Prod checklist:** `GET /api/kep/status` → `productionReady: true`, `mockAllowed: false`.  
   У `docker-compose.prod.yml` / `.env.production` завжди `KEP_ALLOW_MOCK=false`.

Без credentials `diia` **деградує** до mock authorize URL (лише dev).

## Meeting lifecycle + protocol PDF

| Статус | Далі |
|--------|------|
| `draft` | → `scheduled` \| `cancelled` |
| `scheduled` | → `open` \| `cancelled` \| `draft` |
| `open` | → `closed` (авто-протокол) \| `cancelled` |
| `closed` | terminal |
| `cancelled` | → `draft` |

- `POST /api/meetings/:id/protocol` — зберегти текст протоколу  
- `GET /api/meetings/:id/protocol.pdf` — PDF для архіву / КЕП  
- `GET /api/meetings/:id` → `stats.quorumMet`, `participationPercent`, `eligibleWeight`

## CAdES / токен

1. `KEP_PROVIDER=cades` (або `provider: "cades"` у start).
2. Клієнт бере `digest` (SHA-256 hex) з відповіді start.
3. Підписує через EUSign CSP / hardware token.
4. `POST /api/kep/sessions/:id/complete-auth` + JWT:

```json
{
  "signatureCms": "<base64 CAdES>",
  "certificateSubject": "CN=…",
  "certificateSerial": "…"
}
```

## Статус

`GET /api/kep/status` → `enabled`, `provider`, `diiaConfigured`, `productionReady`.

## Безпека

- У `NODE_ENV=production` webhook **без** `KEP_WEBHOOK_SECRET` відхиляється.
- `KEP_ALLOW_MOCK=false` блокує mock-підпис.
- Сесії мають TTL (`KEP_SESSION_TTL_MIN`, default 30).
