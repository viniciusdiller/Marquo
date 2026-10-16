// Cadastra a "Del Bianco Barbearia" (Saquarema/RJ) no banco LOCAL, com avaliações DE DEMONSTRAÇÃO.
//
//   pnpm --filter @marquo/database db:seed:del-bianco             cria/recria
//   pnpm --filter @marquo/database db:seed:del-bianco -- --remove  remove a barbearia e os clientes de demonstração
//
// IMPORTANTE: as avaliações e os clientes ("Cliente Demo N") são DADOS DE EXEMPLO, não opiniões de pessoas reais.
// Servem para ver o marketplace e a página da barbearia preenchidos em desenvolvimento/apresentação. Antes de colocar
// o negócio no ar para o público, rode com --remove (ou apague as avaliações): avaliação inventada exibida a clientes
// reais engana quem decide por ela. Preços, horários, telefone, e-mail do dono e coordenadas abaixo também são
// PLACEHOLDERS: troque pelos dados reais no painel (Configurações / Marketplace).
//
// Idempotente: pode rodar de novo (refaz do zero) e só mexe nesta barbearia e nos telefones de demonstração abaixo.
import { AppointmentStatus, PrismaClient, Role, Weekday } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

const SLUG = "del-bianco-barbearia";
// Senha só para desenvolvimento local (a mesma de todo o seed).
const SEED_PASSWORD = "senha123";
const BCRYPT_ROUNDS = 12;

const OWNER_EMAIL = "dono@delbiancobarbearia.com";
const BARBER_EMAIL = "barbeiro@delbiancobarbearia.com";

// Telefones fictícios (DDD 22) dos clientes de demonstração; usados para achar e remover os registros depois.
const DEMO_CONSUMERS = [
  { phone: "22977770001", name: "Cliente Demo 1", rating: 5, comment: "Corte bem feito e ambiente tranquilo. Atendimento no horário marcado." },
  { phone: "22977770002", name: "Cliente Demo 2", rating: 5, comment: "Barba alinhada, saí satisfeito. Voltaria." },
  { phone: "22977770003", name: "Cliente Demo 3", rating: 4, comment: "Bom atendimento. Só precisei esperar uns minutos além do horário." },
  { phone: "22977770004", name: "Cliente Demo 4", rating: 5, comment: "Corte e barba no capricho. Fácil de agendar pelo site." },
  { phone: "22977770005", name: "Cliente Demo 5", rating: 4, comment: "Ótimo acabamento no corte. Recomendo." },
] as const;

const WEEKDAYS: Weekday[] = [
  Weekday.MONDAY,
  Weekday.TUESDAY,
  Weekday.WEDNESDAY,
  Weekday.THURSDAY,
  Weekday.FRIDAY,
  Weekday.SATURDAY,
];

const SERVICES = [
  { name: "Corte masculino", durationMinutes: 40, priceCents: 4000 },
  { name: "Barba", durationMinutes: 30, priceCents: 3000 },
  { name: "Corte + barba", durationMinutes: 60, priceCents: 6500 },
  { name: "Sobrancelha", durationMinutes: 15, priceCents: 1500 },
];

function daysAgoAt(days: number, hour: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, 0, 0, 0);
  return date;
}

async function removeEverything() {
  const existing = await prisma.tenant.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (existing) {
    const where = { tenantId: existing.id };
    // Várias FKs são onDelete: Restrict: apaga na ordem certa antes do tenant.
    await prisma.financialEntry.deleteMany({ where });
    await prisma.stockMovement.deleteMany({ where });
    await prisma.commissionEntry.deleteMany({ where });
    await prisma.payment.deleteMany({ where });
    await prisma.ticket.deleteMany({ where });
    await prisma.appointment.deleteMany({ where });
    await prisma.tenant.delete({ where: { id: existing.id } });
  }
  // Consumer é global (não cascateia do tenant): remove só os de demonstração, pelo telefone fixo.
  await prisma.consumer.deleteMany({ where: { phone: { in: DEMO_CONSUMERS.map((c) => c.phone) } } });
}

async function create() {
  await removeEverything();

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, BCRYPT_ROUNDS);
  const barbearia = await prisma.serviceCategory.findUniqueOrThrow({ where: { slug: "barbearia" } });

  const tenant = await prisma.tenant.create({
    data: {
      name: "Del Bianco Barbearia",
      slug: SLUG,
      description: "Barbearia no Centro de Saquarema, na Rua Coronel Madureira. Cortes, barba e acabamentos.",
      address: "Rua Coronel Madureira - Centro, Saquarema - RJ",
      // Teste de 30 dias (como as demais demos); sem assinatura.
      trialEndsAt: daysAgoAt(-30, 23),
      listedInMarketplace: true,
      city: "Saquarema",
      neighborhood: "Centro",
      // Coordenadas APROXIMADAS do centro de Saquarema: ajuste no painel para o ponto exato da barbearia.
      latitude: -22.9205,
      longitude: -42.5098,
      priceRange: 2,
      categories: { create: [{ categoryId: barbearia.id }] },
    },
  });

  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: OWNER_EMAIL,
      passwordHash,
      name: "Dono Del Bianco",
      phone: "22988887777",
      role: Role.OWNER,
    },
  });

  const barberUser = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: BARBER_EMAIL,
      passwordHash,
      name: "Del Bianco",
      role: Role.PROFESSIONAL,
    },
  });
  const professional = await prisma.professional.create({
    data: {
      tenantId: tenant.id,
      userId: barberUser.id,
      workingHours: {
        create: WEEKDAYS.map((weekday) => ({ weekday, startMinute: 9 * 60, endMinute: 19 * 60 })),
      },
    },
  });

  const services: Array<{ id: string; durationMinutes: number; priceCents: number }> = [];
  for (const s of SERVICES) {
    const service = await prisma.service.create({ data: { tenantId: tenant.id, ...s } });
    services.push({ id: service.id, durationMinutes: s.durationMinutes, priceCents: s.priceCents });
    await prisma.professionalService.create({ data: { professionalId: professional.id, serviceId: service.id } });
  }

  // Uma visita CONCLUÍDA por avaliação (cada Review exige o seu próprio atendimento) e um cliente de demonstração
  // por avaliação, em dias diferentes.
  for (const [index, demo] of DEMO_CONSUMERS.entries()) {
    const consumer = await prisma.consumer.create({
      data: { phone: demo.phone, name: demo.name, consentedAt: new Date() },
    });
    const client = await prisma.client.create({
      data: { tenantId: tenant.id, phone: demo.phone, name: demo.name },
    });
    await prisma.consumerTenantLink.create({
      data: { consumerId: consumer.id, tenantId: tenant.id, clientId: client.id },
    });

    const service = services[index % services.length];
    const startAt = daysAgoAt(2 + index * 3, 10 + (index % 4));
    const appointment = await prisma.appointment.create({
      data: {
        tenantId: tenant.id,
        professionalId: professional.id,
        clientName: client.name,
        clientPhone: client.phone,
        clientId: client.id,
        startAt,
        endAt: new Date(startAt.getTime() + service.durationMinutes * 60_000),
        status: AppointmentStatus.COMPLETED,
        source: "PUBLIC",
        items: {
          create: {
            serviceId: service.id,
            position: 0,
            durationMinutes: service.durationMinutes,
            priceCentsSnapshot: service.priceCents,
          },
        },
      },
    });
    await prisma.review.create({
      data: {
        tenantId: tenant.id,
        consumerId: consumer.id,
        appointmentId: appointment.id,
        rating: demo.rating,
        comment: demo.comment,
        createdAt: new Date(startAt.getTime() + 3 * 3_600_000),
      },
    });
  }

  const average = DEMO_CONSUMERS.reduce((sum, c) => sum + c.rating, 0) / DEMO_CONSUMERS.length;
  console.log(`Del Bianco Barbearia criada: /${SLUG}`);
  console.log(`  ${DEMO_CONSUMERS.length} avaliações DE DEMONSTRAÇÃO (média ${average.toFixed(1)}).`);
  console.log(`  Login do dono: ${OWNER_EMAIL} / ${SEED_PASSWORD} (placeholder: troque pelo e-mail real do dono)`);
}

async function main() {
  if (process.argv.includes("--remove")) {
    await removeEverything();
    console.log("Del Bianco Barbearia e os clientes de demonstração foram removidos.");
    return;
  }
  await create();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
