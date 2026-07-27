/**
 * Saga Orchestration — Place Order flow
 * Steps: ReservePayment → ReserveStock → CapturePayment → Notify
 * Compensations: CancelPayment / ReleaseStock on failure
 *
 * This is an in-memory demo of the control flow used in enterprise sagas.
 */
import { randomUUID } from 'node:crypto';

type StepResult = { ok: true; data?: unknown } | { ok: false; error: string };

interface SagaContext {
  sagaId: string;
  orderId: string;
  userId: string;
  amount: number;
  sku: string;
  qty: number;
  paymentId?: string;
  reservationId?: string;
}

type Compensator = (ctx: SagaContext) => Promise<void>;

interface SagaStep {
  name: string;
  execute: (ctx: SagaContext) => Promise<StepResult>;
  compensate?: Compensator;
}

/** Simulated downstream services */
const Payment = {
  async reserve(amount: number): Promise<StepResult> {
    if (amount > 10_000) return { ok: false, error: 'limit exceeded' };
    return { ok: true, data: { paymentId: `pay_${randomUUID().slice(0, 8)}` } };
  },
  async capture(paymentId: string): Promise<StepResult> {
    if (!paymentId) return { ok: false, error: 'missing payment' };
    return { ok: true };
  },
  async cancel(paymentId: string): Promise<void> {
    console.log(` [compensate] CancelPayment ${paymentId}`);
  },
};

const Inventory = {
  stock: new Map<string, number>([['sku_widget', 5]]),
  async reserve(sku: string, qty: number): Promise<StepResult> {
    const have = this.stock.get(sku) ?? 0;
    if (have < qty) return { ok: false, error: 'insufficient stock' };
    this.stock.set(sku, have - qty);
    return { ok: true, data: { reservationId: `res_${randomUUID().slice(0, 8)}` } };
  },
  async release(sku: string, qty: number, reservationId: string): Promise<void> {
    this.stock.set(sku, (this.stock.get(sku) ?? 0) + qty);
    console.log(` [compensate] ReleaseStock ${reservationId} sku=${sku} qty=${qty}`);
  },
};

const Notify = {
  async confirmation(orderId: string): Promise<StepResult> {
    console.log(` [notify] order ${orderId} confirmed`);
    return { ok: true };
  },
};

const steps: SagaStep[] = [
  {
    name: 'ReservePayment',
    execute: async (ctx) => {
      const r = await Payment.reserve(ctx.amount);
      if (r.ok) ctx.paymentId = (r.data as { paymentId: string }).paymentId;
      return r;
    },
    compensate: async (ctx) => {
      if (ctx.paymentId) await Payment.cancel(ctx.paymentId);
    },
  },
  {
    name: 'ReserveStock',
    execute: async (ctx) => {
      const r = await Inventory.reserve(ctx.sku, ctx.qty);
      if (r.ok) ctx.reservationId = (r.data as { reservationId: string }).reservationId;
      return r;
    },
    compensate: async (ctx) => {
      if (ctx.reservationId) await Inventory.release(ctx.sku, ctx.qty, ctx.reservationId);
    },
  },
  {
    name: 'CapturePayment',
    execute: async (ctx) => Payment.capture(ctx.paymentId!),
  },
  {
    name: 'Notify',
    execute: async (ctx) => Notify.confirmation(ctx.orderId),
  },
];

async function runSaga(
  ctx: SagaContext,
): Promise<{ status: 'completed' | 'compensated'; ctx: SagaContext }> {
  const done: SagaStep[] = [];
  console.log(`\n=== Saga ${ctx.sagaId} order=${ctx.orderId} ===`);

  for (const step of steps) {
    console.log(`→ ${step.name}`);
    const result = await step.execute(ctx);
    if (!result.ok) {
      console.log(`✗ ${step.name} failed: ${result.error}`);
      for (const prev of [...done].reverse()) {
        if (prev.compensate) await prev.compensate(ctx);
      }
      return { status: 'compensated', ctx };
    }
    done.push(step);
  }
  console.log('✓ Saga completed');
  return { status: 'completed', ctx };
}

/** Demo runs */
async function main() {
  await runSaga({
    sagaId: randomUUID(),
    orderId: 'ord_ok',
    userId: 'u1',
    amount: 500,
    sku: 'sku_widget',
    qty: 1,
  });

  // จะล้มที่ ReserveStock แล้ว compensate CancelPayment
  await runSaga({
    sagaId: randomUUID(),
    orderId: 'ord_fail_stock',
    userId: 'u2',
    amount: 200,
    sku: 'sku_widget',
    qty: 100,
  });
}

main();
