/**
 * CDC event sketch — simulating Debezium-style change events
 * feeding a real-time notifier (loose coupling)
 */
export interface CdcEvent {
  op: 'c' | 'u' | 'd'; // create, update, delete
  source: { table: string; ts_ms: number };
  after?: Record<string, unknown> | null;
  before?: Record<string, unknown> | null;
  eventId: string;
}

type Handler = (e: CdcEvent) => void;

const handlers = new Map<string, Handler[]>();
const seen = new Set<string>(); // inbox dedupe

export function onTable(table: string, handler: Handler) {
  if (!handlers.has(table)) handlers.set(table, []);
  handlers.get(table)!.push(handler);
}

export function publishCdc(event: CdcEvent) {
  if (seen.has(event.eventId)) {
    console.log('skip duplicate', event.eventId);
    return;
  }
  seen.add(event.eventId);
  for (const h of handlers.get(event.source.table) ?? []) h(event);
}

/** Example wiring */
onTable('orders', (e) => {
  if (e.op === 'u' && e.after?.status === 'shipped') {
    console.log(`[ws-notifier] push order.shipped to room:order:${e.after.id}`);
  }
});

publishCdc({
  eventId: 'evt_1',
  op: 'u',
  source: { table: 'orders', ts_ms: Date.now() },
  before: { id: 'ord_1', status: 'paid' },
  after: { id: 'ord_1', status: 'shipped' },
});

// replay duplicate — should skip
publishCdc({
  eventId: 'evt_1',
  op: 'u',
  source: { table: 'orders', ts_ms: Date.now() },
  after: { id: 'ord_1', status: 'shipped' },
});
