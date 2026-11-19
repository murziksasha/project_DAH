import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  countQueuedMeterReadings,
  enqueueMeterReading,
  flushMeterOfflineQueue,
  listQueuedMeterReadings,
} from './meter-offline-queue';

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

describe('meter-offline-queue', () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  it('enqueues readings and dedupes same meter+period+apartment with latest value', () => {
    enqueueMeterReading({
      meterId: 'meter-1',
      meterName: 'Холодна вода',
      apartmentId: 'apt-1',
      period: '2026-08',
      value: 120.5,
    });

    assert.equal(countQueuedMeterReadings('apt-1'), 1);

    // Enqueue updated value for same period
    enqueueMeterReading({
      meterId: 'meter-1',
      meterName: 'Холодна вода',
      apartmentId: 'apt-1',
      period: '2026-08',
      value: 123.0,
    });

    const list = listQueuedMeterReadings('apt-1');
    assert.equal(list.length, 1);
    assert.equal(list[0].value, 123.0);
  });

  it('flushes successfully and removes uploaded readings', async () => {
    enqueueMeterReading({
      meterId: 'meter-1',
      meterName: 'Холодна вода',
      apartmentId: 'apt-1',
      period: '2026-08',
      value: 120.5,
    });

    const posted: Array<{ meterId: string; body: any }> = [];
    const poster = async (meterId: string, body: any) => {
      posted.push({ meterId, body });
    };

    const res = await flushMeterOfflineQueue(poster, { apartmentId: 'apt-1' });
    assert.equal(res.sent, 1);
    assert.equal(res.failed, 0);
    assert.equal(posted.length, 1);
    assert.equal(posted[0].meterId, 'meter-1');
    assert.equal(posted[0].body.value, 120.5);
    assert.equal(countQueuedMeterReadings('apt-1'), 0);
  });

  it('does NOT lose readings enqueued concurrently during flush', async () => {
    enqueueMeterReading({
      meterId: 'meter-1',
      meterName: 'Холодна вода',
      apartmentId: 'apt-1',
      period: '2026-08',
      value: 100,
    });

    const poster = async (_meterId: string, _body: any) => {
      // Simulate delay during which another reading is enqueued
      await new Promise((r) => setTimeout(r, 10));
      enqueueMeterReading({
        meterId: 'meter-2',
        meterName: 'Гаряча вода',
        apartmentId: 'apt-1',
        period: '2026-08',
        value: 50,
      });
    };

    const res = await flushMeterOfflineQueue(poster);
    assert.equal(res.sent, 1);

    // The concurrently added meter-2 reading MUST still be in the queue!
    const remaining = listQueuedMeterReadings();
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].meterId, 'meter-2');
  });

  it('retains readings that failed upload for retry', async () => {
    enqueueMeterReading({
      meterId: 'meter-fail',
      meterName: 'Електроенергія',
      apartmentId: 'apt-1',
      period: '2026-08',
      value: 450,
    });

    const poster = async () => {
      throw new Error('Network timeout');
    };

    const res = await flushMeterOfflineQueue(poster);
    assert.equal(res.sent, 0);
    assert.equal(res.failed, 1);
    assert.equal(res.errors.length, 1);
    assert.ok(res.errors[0].includes('Network timeout'));

    // Reading must still be in queue
    assert.equal(countQueuedMeterReadings(), 1);
  });
});
