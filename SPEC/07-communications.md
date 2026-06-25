# 07. Комунікації

## Оголошення (Announcements)

### Можливості
- Заголовок, текст, закріплення (`isPinned`)
- Автор — користувач з роллю write (chairman, accountant, board)
- При створенні — **Web Push** усім підписаним користувачам

### API
- `GET /communications/announcements` — усі (сорт: pinned → date)
- `POST /communications/announcements` — створити
- `DELETE /communications/announcements/:id` — chairman, board

### UI
- Admin: `/admin/communications` → вкладка «Оголошення»
- Resident: `/resident` → вкладка «Новини»

## Заявки (Requests)

### Категорії (приклад)
`sanitary`, `electric`, `cleaning`, `other`

### Статуси
| Статус | Опис |
|--------|------|
| `new` | Нова |
| `in_progress` | В роботі |
| `done` | Виконано |

### Правила
- Будь-який автентифікований користувач може створити заявку
- Мешканець бачить лише **свої** заявки
- Правління бачить **усі** та може змінювати статус / призначати виконавця

## Опитування (Polls)

### Правила
- Мінімум 2 варіанти відповіді
- 1 голос на користувача (`@@unique([pollId, userId])`)
- Повторне голосування → `403 Forbidden`
- `endsAt` — опційний дедлайн
- `isActive = false` — опитування закрито

### API
- `POST /communications/polls` — створити (chairman, board)
- `POST /communications/polls/:id/vote` — `{ optionId }`
- `PATCH /communications/polls/:id/close` — закрити

Відповідь `listPolls` містить `userVote` — ID обраного варіанту.

## Web Push

### Налаштування (.env)
```
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@osbb.local
NEXT_PUBLIC_VAPID_PUBLIC_KEY=   # той самий public key
```

Генерація: `npx web-push generate-vapid-keys`

### Потік
1. Клієнт: `GET /notifications/vapid-public-key`
2. Service Worker: `/public/sw.js`
3. `POST /notifications/subscribe` — зберегти endpoint
4. При новому оголошенні — push з `{ title, body, url }`

### PWA prompt
Компонент `PwaPrompt` — підказка встановлення + підписка на сповіщення.

## Аудит

| action | Коли |
|--------|------|
| `announcement.created` | Нове оголошення |
| `announcement.deleted` | Видалення |
| `request.created` | Нова заявка |
| `request.updated` | Зміна статусу |
| `poll.created` | Нове опитування |
| `poll.closed` | Закриття |