import "reflect-metadata";
import { randomUUID } from "crypto";
import { ConfigService } from "@nestjs/config";
import { Role } from "@marquo/database";
import { PrismaService } from "../src/prisma/prisma.service";
import { AppointmentsService } from "../src/appointments/appointments.service";
import { AppointmentReminderService } from "../src/appointments/appointment-reminder.service";
import { ClientsService } from "../src/clients/clients.service";
import { ConsumerAuthService } from "../src/consumer-auth/consumer-auth.service";
import { AppointmentNotifierService } from "../src/email/appointment-notifier.service";
import { NotificationWorkerService } from "../src/email/notification-worker.service";
import { EmailService } from "../src/email/email.service";
import { TicketsService } from "../src/tickets/tickets.service";
import { ProductsService } from "../src/products/products.service";
import { CommissionsService } from "../src/commissions/commissions.service";
import { CashRegisterService } from "../src/cash-register/cash-register.service";
import { FinanceService } from "../src/finance/finance.service";
import { PaymentsService } from "../src/billing/payments/payments.service";
import { MercadoPagoClient } from "../src/billing/payments/mercadopago.client";
import { CouponsService } from "../src/coupons/coupons.service";
import { PlanLimitService } from "../src/billing/plan-limit.service";
import { SharedStateService } from "../src/shared-state/shared-state.service";
import { RedisThrottlerStorage } from "../src/shared-state/redis-throttler.storage";

// Explicit disposable-database opt-in. Migrations run in CI before this suite; never reset a shared DB.
if (process.env.INTEGRATION_TESTS !== "1" || !process.env.DATABASE_URL || !process.env.REDIS_URL) {
  throw new Error("Use INTEGRATION_TESTS=1 with disposable DATABASE_URL and REDIS_URL.");
}

const db = new PrismaService();
const db2 = new PrismaService();
const config = new ConfigService({ REDIS_URL: process.env.REDIS_URL, JWT_SECRET: "integration-secret-".repeat(3), FRONTEND_URL: "https://example.com" });
const email = new EmailService(new ConfigService({})); // no real email/network calls
const notifier = new AppointmentNotifierService(db, email, config);
const appointments = (p: PrismaService, n = notifier) => new AppointmentsService(p, new ClientsService(p), {} as ConsumerAuthService, n);
const tickets = (p: PrismaService) => new TicketsService(p, new ProductsService(p), new CommissionsService(p), new CashRegisterService(p), new FinanceService(p));
let tenantId: string;
let otherTenantId: string;
let userId: string;
let professionalId: string;
let serviceId: string;
let clientId: string;
const states = [new SharedStateService(config), new SharedStateService(config)];
const user = () => ({ tenantId, userId, role: Role.OWNER });
const future = (hours = 72) => new Date(Date.now() + hours * 3600_000).toISOString();
const dto = (startAt = future()) => ({ professionalId, startAt, clientId, items: [{ serviceId }], status: "CONFIRMED" as const });

beforeAll(async () => { await Promise.all([db.$connect(), db2.$connect(), ...states.map((s) => s.onModuleInit())]); });
beforeEach(async () => {
  tenantId = randomUUID(); otherTenantId = randomUUID();
  await db.tenant.createMany({ data: [tenantId, otherTenantId].map((id) => ({ id, name: "Integration", slug: id, trialEndsAt: new Date(Date.now()+86400000) })) });
  const user = await db.user.create({ data: { tenantId, email: `${randomUUID()}@example.com`, name: "Staff", passwordHash: "unused", role: "OWNER" } });
  userId = user.id;
  professionalId = (await db.professional.create({ data: { tenantId, userId } })).id;
  serviceId = (await db.service.create({ data: { tenantId, name: "Corte", durationMinutes: 30, priceCents: 1000 } })).id;
  await db.professionalService.create({ data: { professionalId, serviceId } });
  clientId = (await db.client.create({ data: { tenantId, name: "Cliente", phone: "11999998888", email: "client@example.com" } })).id;
});
afterEach(async () => {
  // Respect restrict FKs. Only delete this test's tenants, never truncate the database.
  await db.stockMovement.deleteMany({ where: { tenantId } });
  await db.financialEntry.deleteMany({ where: { tenantId } });
  await db.ticket.deleteMany({ where: { tenantId } });
  await db.appointment.deleteMany({ where: { tenantId } });
  await db.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
});
afterAll(async () => { states.forEach((s) => s.onModuleDestroy()); await Promise.all([db.$disconnect(), db2.$disconnect()]); });

it("only one simultaneous booking succeeds, with notifications committed exactly once", async () => {
  const sameSlot = dto();
  const results = await Promise.allSettled([appointments(db).createByStaff(user(), sameSlot), appointments(db2).createByStaff(user(), sameSlot)]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(await db.appointment.count({ where: { tenantId } })).toBe(1);
  expect(await db.notificationOutbox.count({ where: { tenantId, event: "CREATED" } })).toBe(2);
});

it("rolls back the appointment if its outbox write fails", async () => {
  const broken = new AppointmentNotifierService(db, email, config);
  jest.spyOn(broken, "enqueue").mockRejectedValueOnce(new Error("outbox unavailable"));
  await expect(appointments(db, broken).createByStaff(user(), dto())).rejects.toThrow("outbox unavailable");
  expect(await db.appointment.count({ where: { tenantId } })).toBe(0);
});

it("isolates reads and writes between tenants", async () => {
  await expect(new ClientsService(db).getDetail(otherTenantId, clientId)).rejects.toThrow();
  await expect(new ClientsService(db).update(otherTenantId, clientId, { name: "Changed" })).rejects.toThrow();
  await expect(appointments(db).createByStaff({ ...user(), tenantId: otherTenantId }, dto())).rejects.toThrow();
  const ticket = await tickets(db).open(tenantId, userId, { clientId });
  await expect(tickets(db2).setDiscount(otherTenantId, ticket.id, { discountCents: 0 })).rejects.toThrow();
  expect((await db.client.findUniqueOrThrow({ where: { id: clientId } })).name).toBe("Cliente");
});

it("closing a ticket concurrently records only one stock debit and one income entry", async () => {
  const product = await db.product.create({ data: { tenantId, name: "Produto", priceCents: 1000 } });
  await db.stockMovement.create({ data: { tenantId, productId: product.id, kind: "IN", quantity: 10 } });
  const ticket = await tickets(db).open(tenantId, userId, {});
  await tickets(db).addItem(tenantId, ticket.id, { kind: "PRODUCT", productId: product.id, quantity: 2 });
  await tickets(db).addPayment(tenantId, ticket.id, { method: "PIX", amountCents: 2000 });
  const results = await Promise.allSettled([tickets(db).close(tenantId, userId, ticket.id), tickets(db2).close(tenantId, userId, ticket.id)]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(await db.stockMovement.count({ where: { tenantId, kind: "SALE" } })).toBe(1);
  expect((await db.stockMovement.aggregate({ where: { tenantId }, _sum: { quantity: true } }))._sum.quantity).toBe(8);
  expect(await db.financialEntry.count({ where: { tenantId, source: "TICKET" } })).toBe(1);
});

it("replaying a confirmed Pix payment concurrently grants one billing period", async () => {
  const plan = await db.plan.findUniqueOrThrow({ where: { tier: "ESSENCIAL" } });
  const attempt = await db.billingAttempt.create({ data: { tenantId, planId: plan.id, method: "PIX_MONTHLY", listPriceCents: 1000, discountCents: 0, chargeCents: 1000, providerRef: "123" } });
  // Only the external provider is stubbed. Transactions, locks and subscription writes use PostgreSQL.
  const mp = { getPayment: async () => ({ id: 123, external_reference: attempt.id, status: "approved", transaction_amount: 10 }) } as unknown as MercadoPagoClient;
  const payments = (p: PrismaService) => new PaymentsService(p, mp, config, new CouponsService(), new PlanLimitService(p));
  await Promise.all([payments(db).syncAttempt(attempt.id), payments(db2).syncAttempt(attempt.id)]);
  const first = await db.subscription.findUniqueOrThrow({ where: { tenantId } });
  await payments(db).syncAttempt(attempt.id);
  const second = await db.subscription.findUniqueOrThrow({ where: { tenantId } });
  expect(second.currentPeriodEnd).toEqual(first.currentPeriodEnd);
  expect(await db.subscription.count({ where: { tenantId } })).toBe(1);
  expect((await db.billingAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).status).toBe("APPROVED");
});

it("two workers claim disjoint jobs; a crashed lease is recovered with the same idempotency key", async () => {
  const appointment = await appointments(db).createByStaff(user(), dto());
  const send = jest.fn().mockResolvedValue(true);
  const sender = { isConfigured: () => true, send } as unknown as EmailService;
  const a = new NotificationWorkerService(db, sender), b = new NotificationWorkerService(db2, sender);
  const [first, second] = await Promise.all([a.claimBatch(), b.claimBatch()]);
  expect(new Set([...first, ...second].map((j) => j.id)).size).toBe(first.length+second.length);
  expect(first.length+second.length).toBe(2);
  const job = [...first, ...second][0];
  await db.notificationOutbox.update({ where: { id: job.id }, data: { lockedUntil: new Date(0) } });
  const [recovered] = await b.claimBatch();
  expect(recovered.id).toBe(job.id);
  expect(recovered.lockToken).not.toBe(job.lockToken);
  await b.process(recovered);
  expect(send).toHaveBeenCalledWith(expect.any(Object), `marquo-notification/${job.id}`);
  expect((await db.notificationOutbox.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("SENT");
  expect(await db.appointment.findUnique({ where: { id: appointment.id } })).not.toBeNull();
});

it("reminders retry failures, marking sent only after success; scans do not duplicate jobs", async () => {
  const appointment = await appointments(db).createByStaff(user(), dto(future(12)));
  await db.notificationOutbox.deleteMany({ where: { tenantId } });
  // Existing/legacy appointment not yet reminded.
  await db.appointment.update({ where: { id: appointment.id }, data: { reminderSentAt: null } });
  const scanner = new AppointmentReminderService(db, notifier);
  await Promise.all([scanner.sendDueReminders(new Date()), scanner.sendDueReminders(new Date())]);
  expect(await db.notificationOutbox.count({ where: { tenantId, event: "REMINDER" } })).toBe(1);
  const send = jest.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
  const worker = new NotificationWorkerService(db, { isConfigured: () => true, send } as unknown as EmailService);
  const [job] = await worker.claimBatch();
  await worker.process(job);
  expect((await db.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).reminderSentAt).toBeNull();
  expect((await db.notificationOutbox.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("PENDING");
  await db.notificationOutbox.update({ where: { id: job.id }, data: { availableAt: new Date(0) } });
  const [retry] = await worker.claimBatch();
  await worker.process(retry);
  expect(send.mock.calls[0][1]).toBe(send.mock.calls[1][1]);
  expect((await db.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).reminderSentAt).not.toBeNull();
});

it("skips a reminder after cancellation or reschedule", async () => {
  const appointment = await appointments(db).createByStaff(user(), dto(future(12)));
  await db.notificationOutbox.deleteMany({ where: { tenantId } });
  await db.appointment.update({ where: { id: appointment.id }, data: { reminderSentAt: null } });
  await new AppointmentReminderService(db, notifier).sendDueReminders(new Date());
  await db.appointment.update({ where: { id: appointment.id }, data: { rescheduledCount: { increment: 1 } } });
  const send = jest.fn();
  const worker = new NotificationWorkerService(db, { send } as unknown as EmailService);
  const [job] = await worker.claimBatch(); await worker.process(job);
  expect(send).not.toHaveBeenCalled();
  expect((await db.notificationOutbox.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("SKIPPED");
});

it("shares atomic code consumption, cooldown, replay protection and lockout across Redis clients", async () => {
  const key = randomUUID();
  const code = await states[0].issueCode("integration", key, 60000, 60000);
  expect(await states[1].issueCode("integration", key, 60000, 60000)).toBeNull();
  const checks = await Promise.all(states.map((s) => s.checkCode("integration", key, code!)));
  expect(checks.sort()).toEqual(["expired", "ok"]);
  expect((await Promise.all(states.map((s) => s.claim("integration-replay", key, 10000)))).sort()).toEqual([false, true]);
  await Promise.all(Array.from({ length: 5 }, (_, i) => states[i%2].registerFailure(key)));
  expect(await states[1].isLocked(key)).toBe(true);
  await states[0].clear("platform-lockout", key);
  expect(await states[1].isLocked(key)).toBe(false);
});

it("shares rate limits across Redis clients and expires replay claims", async () => {
  const key = randomUUID();
  const stores = states.map((s) => new RedisThrottlerStorage(s));
  const results = await Promise.all(Array.from({ length: 6 }, (_, i) => stores[i%2].increment(key, 10000, 5, 10000, "integration")));
  expect(results.map((r) => r.totalHits).sort()).toEqual([1,2,3,4,5,6]);
  expect(results.filter((r) => r.isBlocked)).toHaveLength(1);
  expect(await states[0].claim("integration-expiry", key, 20)).toBe(true);
  await new Promise((resolve) => setTimeout(resolve, 40));
  expect(await states[1].claim("integration-expiry", key, 20)).toBe(true);
});
