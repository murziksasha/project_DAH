/**
 * Lightweight in-process domain events (no Redis).
 * Finance / notifications can subscribe without circular Nest modules.
 */

export type DomainEventMap = {
  'payment.allocated': { paymentId: string; apartmentId: string; amount: number };
  'expense.voided': { expenseId: string; amount: number };
  'expense.created': { expenseId: string; amount: number };
  'accrual.created': { accrualId: string; period: string };
  'accrual.reversed': { accrualId: string; stornoId: string; total: number };
  'period.status_changed': {
    buildingId: string;
    period: string;
    status: string;
  };
  'backup.created': { relativePath: string; sizeBytes: number };
  'journal.reconcile_mismatch': { count: number; sample: string[] };
  'fund_transfer.created': {
    transferId: string;
    fromFundId: string;
    toFundId: string;
    amount: number;
  };
};

type Handler<T> = (payload: T) => void | Promise<void>;

class DomainEventBus {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handlers = new Map<string, Set<Handler<any>>>();

  on<K extends keyof DomainEventMap>(event: K, handler: Handler<DomainEventMap[K]>) {
    const set = this.handlers.get(event) ?? new Set();
    set.add(handler);
    this.handlers.set(event, set);
    return () => set.delete(handler);
  }

  async emit<K extends keyof DomainEventMap>(event: K, payload: DomainEventMap[K]) {
    const set = this.handlers.get(event);
    if (!set?.size) return;
    for (const h of set) {
      try {
        await h(payload);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(
          JSON.stringify({
            level: 'error',
            msg: 'domain_event_handler_failed',
            event,
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      }
    }
  }
}

/** Singleton bus for process lifetime. */
export const domainEvents = new DomainEventBus();
