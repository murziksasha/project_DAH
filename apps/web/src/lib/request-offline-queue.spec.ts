import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearQueuedRequests,
  countQueuedRequests,
  enqueueRequestDraft,
  flushRequestOfflineQueue,
  listQueuedRequests,
  removeQueuedRequest,
  updateQueuedRequest,
} from './request-offline-queue';

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.get(key) ?? null;
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
}

const mockStorage = new MemoryStorage();
(globalThis as unknown as { localStorage: Storage }).localStorage = mockStorage;

if (typeof (globalThis as unknown as { CustomEvent?: unknown }).CustomEvent === 'undefined') {
  (globalThis as unknown as { CustomEvent: unknown }).CustomEvent = class CustomEvent {
    type: string;
    detail: unknown;
    constructor(type: string, params?: { detail: unknown }) {
      this.type = type;
      this.detail = params?.detail;
    }
  };
}
if (typeof (globalThis as unknown as { dispatchEvent?: unknown }).dispatchEvent === 'undefined') {
  (globalThis as unknown as { dispatchEvent: () => boolean }).dispatchEvent = () => true;
}

describe('request-offline-queue', () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  it('enqueues drafts with pending status, timestamp and id', () => {
    const draft = enqueueRequestDraft({
      title: 'Вентиляція',
      description: 'Не працює витяжка на 5 поверсі',
      category: 'general',
      photoKeys: ['photo1.jpg'],
      apartmentId: 'apt-1',
      userId: 'user-1',
      tenantId: 'tenant-1',
    });

    assert.ok(draft.id.startsWith('req-'));
    assert.equal(draft.status, 'pending');
    assert.equal(draft.userId, 'user-1');
    assert.equal(draft.tenantId, 'tenant-1');
    assert.equal(draft.title, 'Вентиляція');

    const all = listQueuedRequests();
    assert.equal(all.length, 1);
    assert.equal(all[0].id, draft.id);
  });

  it('filters drafts by user, tenant, and apartment', () => {
    enqueueRequestDraft({
      title: 'Запит 1',
      description: 'Опис 1',
      category: 'plumbing',
      photoKeys: [],
      apartmentId: 'apt-1',
      userId: 'user-1',
      tenantId: 'tenant-1',
    });
    enqueueRequestDraft({
      title: 'Запит 2',
      description: 'Опис 2',
      category: 'electric',
      photoKeys: [],
      apartmentId: 'apt-2',
      userId: 'user-2',
      tenantId: 'tenant-1',
    });
    enqueueRequestDraft({
      title: 'Запит 3',
      description: 'Опис 3',
      category: 'general',
      photoKeys: [],
      apartmentId: 'apt-1',
      userId: 'user-1',
      tenantId: 'tenant-2',
    });

    assert.equal(countQueuedRequests(), 3);
    assert.equal(countQueuedRequests({ userId: 'user-1' }), 2);
    assert.equal(countQueuedRequests({ tenantId: 'tenant-1' }), 2);
    assert.equal(countQueuedRequests({ userId: 'user-1', tenantId: 'tenant-1' }), 1);
    assert.equal(countQueuedRequests({ apartmentId: 'apt-2' }), 1);
  });

  it('updates and removes queued requests', () => {
    const draft = enqueueRequestDraft({
      title: 'Протікання',
      description: 'Капає з труби',
      category: 'plumbing',
      photoKeys: [],
    });

    updateQueuedRequest(draft.id, { status: 'failed', error: 'Network timeout' });
    let current = listQueuedRequests();
    assert.equal(current[0].status, 'failed');
    assert.equal(current[0].error, 'Network timeout');

    removeQueuedRequest(draft.id);
    current = listQueuedRequests();
    assert.equal(current.length, 0);
  });

  it('flushes successfully and removes processed drafts', async () => {
    enqueueRequestDraft({
      title: 'Запит А',
      description: 'Опис А',
      category: 'plumbing',
      photoKeys: [],
      userId: 'user-1',
    });
    enqueueRequestDraft({
      title: 'Запит Б',
      description: 'Опис Б',
      category: 'general',
      photoKeys: [],
      userId: 'user-1',
    });

    const sentTitles: string[] = [];
    const res = await flushRequestOfflineQueue(
      async (body) => {
        sentTitles.push(body.title);
      },
      { userId: 'user-1' },
    );

    assert.equal(res.sent, 2);
    assert.equal(res.failed, 0);
    assert.deepEqual(sentTitles, ['Запит А', 'Запит Б']);
    assert.equal(countQueuedRequests(), 0);
  });

  it('does NOT lose drafts enqueued concurrently during flush', async () => {
    enqueueRequestDraft({
      title: 'Перший запит',
      description: 'Початковий',
      category: 'plumbing',
      photoKeys: [],
      userId: 'user-1',
    });

    const res = await flushRequestOfflineQueue(
      async () => {
        // Simulate user adding a new draft while network request is in flight
        enqueueRequestDraft({
          title: 'Новий concurrent запит',
          description: 'Додано під час відправки',
          category: 'electrical',
          photoKeys: [],
          userId: 'user-1',
        });
      },
      { userId: 'user-1' },
    );

    assert.equal(res.sent, 1);
    assert.equal(res.failed, 0);

    // The concurrent draft must NOT be overwritten or lost!
    const remaining = listQueuedRequests();
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].title, 'Новий concurrent запит');
  });

  it('marks failed drafts with error and keeps them for retry', async () => {
    enqueueRequestDraft({
      title: 'Запит із помилкою',
      description: 'Сервер недоступний',
      category: 'heating',
      photoKeys: [],
      userId: 'user-1',
    });

    const res = await flushRequestOfflineQueue(
      async () => {
        throw new Error('Connection refused 503');
      },
      { userId: 'user-1' },
    );

    assert.equal(res.sent, 0);
    assert.equal(res.failed, 1);
    assert.equal(res.errors[0], 'Запит із помилкою: Connection refused 503');

    const remaining = listQueuedRequests();
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].status, 'failed');
    assert.equal(remaining[0].error, 'Connection refused 503');
  });

  it('scopes flush and skips other users drafts', async () => {
    enqueueRequestDraft({
      title: 'Запит Юзера 1',
      description: 'Опис 1',
      category: 'general',
      photoKeys: [],
      userId: 'user-1',
    });
    enqueueRequestDraft({
      title: 'Запит Юзера 2',
      description: 'Опис 2',
      category: 'general',
      photoKeys: [],
      userId: 'user-2',
    });

    const sentTitles: string[] = [];
    const res = await flushRequestOfflineQueue(
      async (body) => {
        sentTitles.push(body.title);
      },
      { userId: 'user-1' },
    );

    assert.equal(res.sent, 1);
    assert.deepEqual(sentTitles, ['Запит Юзера 1']);

    const remaining = listQueuedRequests();
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].title, 'Запит Юзера 2');
  });
});
