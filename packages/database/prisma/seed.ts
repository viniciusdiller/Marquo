import {
  AppointmentStatus,
  PlanTier,
  PrismaClient,
  Role,
  SubscriptionStatus,
  Weekday,
} from "@prisma/client";
import * as bcrypt from "bcrypt";
import { PLAN_CATALOG } from "../../shared-types/src/index";

const prisma = new PrismaClient();

// Senha única de todos os usuários semeados — só para ambiente local/testes.
const SEED_PASSWORD = "senha123";
const BCRYPT_ROUNDS = 12;

// Preço, limite e nome dos planos vêm do CATÁLOGO ÚNICO (packages/shared-types/src/index.ts): este seed não tem valores
// próprios. Import relativo de propósito: o pacote do banco não depende de shared-types (nem o contrário).
const plans = PLAN_CATALOG.map((entry) => ({
  tier: entry.tier as PlanTier,
  name: entry.name,
  priceCents: entry.priceCents,
  maxProfessionals: entry.maxProfessionals,
}));

const WEEKDAYS_MON_TO_FRI: Weekday[] = [
  Weekday.MONDAY,
  Weekday.TUESDAY,
  Weekday.WEDNESDAY,
  Weekday.THURSDAY,
  Weekday.FRIDAY,
];

function atHour(base: Date, dayOffset: number, hour: number, minute = 0): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function seedPlans() {
  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { tier: plan.tier },
      update: {
        name: plan.name,
        priceCents: plan.priceCents,
        maxProfessionals: plan.maxProfessionals,
      },
      create: plan,
    });
  }
}

async function resetDemoTenant(slug: string) {
  // Idempotente. AppointmentItem.serviceId é onDelete: Restrict, então o cascade do
  // tenant sozinho não consegue apagar Service enquanto houver itens — removemos os
  // atendimentos (cascade nos itens) antes de dropar o tenant.
  const existing = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
  if (!existing) return;
  const where = { tenantId: existing.id };
  // Ordem importa: várias FKs são onDelete: Restrict (StockMovement->Product,
  // CommissionEntry->Professional, Ticket->User, AppointmentItem->Service), então o
  // cascade do tenant sozinho não resolve.
  await prisma.financialEntry.deleteMany({ where }); // createdBy -> User (Restrict)
  await prisma.stockMovement.deleteMany({ where });
  await prisma.commissionEntry.deleteMany({ where });
  await prisma.payment.deleteMany({ where });
  await prisma.ticket.deleteMany({ where });
  await prisma.appointment.deleteMany({ where });
  await prisma.tenant.delete({ where: { id: existing.id } });
  // Consumer é global (não cascateia do tenant) — remove o do seed pelo telefone fixo.
  await prisma.consumer.deleteMany({ where: { phone: "11955554444" } });
}

async function seedDemoTenant() {
  const slug = "salao-demo";
  await resetDemoTenant(slug);

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, BCRYPT_ROUNDS);
  const now = new Date();

  const tenant = await prisma.tenant.create({
    data: {
      name: "Salão Demo",
      slug,
      trialEndsAt: atHour(now, 30, 23, 59),
      description: "Salão de demonstração com dados de teste.",
      address: "Rua das Flores, 123 - Centro",
      businessHours: "Seg-Sex 9h-19h",
      whatsappNumber: "5511999990000",
    },
  });

  const profissionalPlan = await prisma.plan.findUniqueOrThrow({
    where: { tier: PlanTier.PROFISSIONAL },
  });
  await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      planId: profissionalPlan.id,
      // Sem provedor de pagamento no momento: a demo usa uma cortesia (concedida pela plataforma).
      courtesy: true,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: atHour(now, 30, 12),
    },
  });

  const owner = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: "dono@salaodemo.com",
      passwordHash,
      name: "Dona Marta",
      phone: "11999990001",
      role: Role.OWNER,
    },
  });

  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: "recepcao@salaodemo.com",
      passwordHash,
      name: "Rita Recepção",
      role: Role.RECEPTIONIST,
    },
  });

  const professionalsData = [
    { name: "Alex Barbeiro", email: "alex@salaodemo.com" },
    { name: "Bruna Cabeleireira", email: "bruna@salaodemo.com" },
  ];

  const professionals = [] as Array<{ id: string; name: string }>;
  for (const p of professionalsData) {
    const user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: p.email,
        passwordHash,
        name: p.name,
        role: Role.PROFESSIONAL,
      },
    });
    const professional = await prisma.professional.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        bio: `${p.name} — profissional do Salão Demo.`,
        workingHours: {
          create: WEEKDAYS_MON_TO_FRI.map((weekday) => ({
            weekday,
            startMinute: 9 * 60,
            endMinute: 19 * 60,
          })),
        },
      },
    });
    professionals.push({ id: professional.id, name: p.name });
  }

  const servicesData = [
    { name: "Corte masculino", durationMinutes: 30, priceCents: 5000 },
    { name: "Corte feminino", durationMinutes: 60, priceCents: 9000 },
    { name: "Barba", durationMinutes: 30, priceCents: 3500 },
    { name: "Coloração", durationMinutes: 90, priceCents: 18000 },
  ];

  const services = [] as Array<{ id: string; durationMinutes: number; priceCents: number }>;
  for (const s of servicesData) {
    const service = await prisma.service.create({ data: { tenantId: tenant.id, ...s } });
    services.push({ id: service.id, durationMinutes: s.durationMinutes, priceCents: s.priceCents });
    // Todo profissional atende todo serviço (dados de teste).
    for (const professional of professionals) {
      await prisma.professionalService.create({
        data: { professionalId: professional.id, serviceId: service.id },
      });
    }
  }

  const clientsData = [
    {
      name: "João Cliente",
      phone: "11988887777",
      email: "joao@example.com",
      tags: ["VIP"],
      notes: "Prefere horário da manhã.",
      birthDate: new Date("1990-05-12"),
    },
    { name: "Maria Cliente", phone: "11977776666", tags: ["coloração"] },
    { name: "Pedro Cliente", phone: "11966665555" },
  ];
  const clients = [] as Array<{ id: string; name: string; phone: string }>;
  for (const c of clientsData) {
    const client = await prisma.client.create({ data: { tenantId: tenant.id, ...c } });
    clients.push(client);
  }

  const intakeForm = await prisma.intakeForm.create({
    data: {
      tenantId: tenant.id,
      name: "Anamnese capilar",
      fields: [
        { key: "alergias", label: "Alergias conhecidas", type: "textarea", required: true },
        { key: "quimica_recente", label: "Fez química nos últimos 30 dias?", type: "boolean" },
        {
          key: "tipo_cabelo",
          label: "Tipo de cabelo",
          type: "select",
          options: ["Liso", "Ondulado", "Cacheado", "Crespo"],
        },
      ],
    },
  });

  await prisma.intakeResponse.create({
    data: {
      tenantId: tenant.id,
      formId: intakeForm.id,
      clientId: clients[0].id,
      answers: { alergias: "Nenhuma", quimica_recente: false, tipo_cabelo: "Ondulado" },
    },
  });

  // Produtos + estoque inicial (M3).
  const productsData = [
    { name: "Pomada modeladora", priceCents: 4500, costCents: 2000, stock: 20 },
    { name: "Shampoo profissional 300ml", priceCents: 6900, costCents: 3500, stock: 12 },
  ];
  for (const p of productsData) {
    const product = await prisma.product.create({
      data: {
        tenantId: tenant.id,
        name: p.name,
        priceCents: p.priceCents,
        costCents: p.costCents,
      },
    });
    await prisma.stockMovement.create({
      data: {
        tenantId: tenant.id,
        productId: product.id,
        kind: "IN",
        quantity: p.stock,
        note: "Estoque inicial",
      },
    });
  }

  // Regra de comissão: 30% em qualquer serviço para o primeiro profissional.
  await prisma.commissionRule.create({
    data: {
      tenantId: tenant.id,
      professionalId: professionals[0].id,
      base: "SERVICE",
      kind: "PERCENT",
      value: 30,
    },
  });

  // Financeiro (M4): categorias padrão + algumas despesas do mês.
  await prisma.financialCategory.createMany({
    data: [
      { tenantId: tenant.id, name: "Vendas de serviços", direction: "INCOME" },
      { tenantId: tenant.id, name: "Vendas de produtos", direction: "INCOME" },
      { tenantId: tenant.id, name: "Comissões", direction: "EXPENSE" },
      { tenantId: tenant.id, name: "Aluguel", direction: "EXPENSE" },
      { tenantId: tenant.id, name: "Fornecedores / produtos", direction: "EXPENSE" },
    ],
  });
  const aluguel = await prisma.financialCategory.findFirst({
    where: { tenantId: tenant.id, name: "Aluguel" },
  });
  await prisma.financialEntry.create({
    data: {
      tenantId: tenant.id,
      direction: "EXPENSE",
      source: "MANUAL",
      status: "PAID",
      description: "Aluguel do salão",
      amountCents: 250000,
      categoryId: aluguel!.id,
      counterparty: "Imobiliária Centro",
      dueDate: atHour(now, -5, 0),
      paidAt: atHour(now, -5, 10),
      createdByUserId: owner.id,
    },
  });
  await prisma.financialEntry.create({
    data: {
      tenantId: tenant.id,
      direction: "EXPENSE",
      source: "MANUAL",
      description: "Reposição de produtos",
      amountCents: 68000,
      counterparty: "Distribuidora Bella",
      dueDate: atHour(now, 7, 0),
      createdByUserId: owner.id,
    },
  });

  // Atendimentos: alguns futuros (CONFIRMED), um pendente (SCHEDULED via recepção), um
  // concluído e um cancelado — cobre a variedade de status para testar telas.
  const plan: Array<{
    dayOffset: number;
    hour: number;
    professionalIdx: number;
    serviceIdx: number;
    clientIdx: number;
    status: AppointmentStatus;
    source: "PUBLIC" | "STAFF";
  }> = [
    { dayOffset: 1, hour: 10, professionalIdx: 0, serviceIdx: 0, clientIdx: 0, status: AppointmentStatus.CONFIRMED, source: "PUBLIC" },
    { dayOffset: 1, hour: 14, professionalIdx: 1, serviceIdx: 1, clientIdx: 1, status: AppointmentStatus.CONFIRMED, source: "PUBLIC" },
    { dayOffset: 2, hour: 11, professionalIdx: 0, serviceIdx: 2, clientIdx: 2, status: AppointmentStatus.SCHEDULED, source: "STAFF" },
    { dayOffset: -3, hour: 15, professionalIdx: 1, serviceIdx: 3, clientIdx: 0, status: AppointmentStatus.COMPLETED, source: "PUBLIC" },
    { dayOffset: -1, hour: 9, professionalIdx: 0, serviceIdx: 0, clientIdx: 1, status: AppointmentStatus.CANCELED, source: "PUBLIC" },
  ];

  let completedAppointmentId: string | null = null;
  for (const item of plan) {
    const professional = professionals[item.professionalIdx];
    const service = services[item.serviceIdx];
    const client = clients[item.clientIdx];
    const startAt = atHour(now, item.dayOffset, item.hour);
    const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000);

    const appointment = await prisma.appointment.create({
      data: {
        tenantId: tenant.id,
        professionalId: professional.id,
        clientName: client.name,
        clientPhone: client.phone,
        clientId: client.id,
        startAt,
        endAt,
        status: item.status,
        source: item.source,
        canceledAt: item.status === AppointmentStatus.CANCELED ? now : null,
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
    if (item.status === AppointmentStatus.COMPLETED) completedAppointmentId = appointment.id;
  }

  // Marketplace (M5): categorias globais, opt-in + geo do tenant demo, um consumidor
  // global vinculado e uma avaliação no atendimento concluído.
  const categorySeed = [
    { slug: "barbearia", name: "Barbearia", position: 0 },
    { slug: "salao-de-beleza", name: "Salão de beleza", position: 1 },
    { slug: "manicure-pedicure", name: "Manicure e pedicure", position: 2 },
    { slug: "estetica", name: "Estética", position: 3 },
    { slug: "sobrancelha-cilios", name: "Sobrancelha e cílios", position: 4 },
  ];
  for (const c of categorySeed) {
    await prisma.serviceCategory.upsert({
      where: { slug: c.slug },
      update: { name: c.name, position: c.position },
      create: c,
    });
  }
  const barbearia = await prisma.serviceCategory.findUniqueOrThrow({ where: { slug: "barbearia" } });
  const salao = await prisma.serviceCategory.findUniqueOrThrow({
    where: { slug: "salao-de-beleza" },
  });

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      listedInMarketplace: true,
      city: "São Paulo",
      neighborhood: "Pinheiros",
      latitude: -23.5629,
      longitude: -46.6919,
      priceRange: 2,
      categories: {
        create: [{ categoryId: barbearia.id }, { categoryId: salao.id }],
      },
    },
  });

  const consumer = await prisma.consumer.create({
    data: {
      phone: "11955554444",
      name: "Consumidora Marketplace",
      email: "consumidor@example.com",
      consentedAt: now,
    },
  });
  const marketplaceClient = await prisma.client.create({
    data: { tenantId: tenant.id, phone: consumer.phone, name: consumer.name },
  });
  await prisma.consumerTenantLink.create({
    data: {
      consumerId: consumer.id,
      tenantId: tenant.id,
      clientId: marketplaceClient.id,
    },
  });
  if (completedAppointmentId) {
    await prisma.review.create({
      data: {
        tenantId: tenant.id,
        consumerId: consumer.id,
        appointmentId: completedAppointmentId,
        rating: 5,
        comment: "Atendimento excelente, saí super satisfeita!",
      },
    });
  }

  return { tenant, owner };
}

// ─────────────────────────────────────────────
// Marketplace (M5): mais alguns negócios de demonstração, cobrindo as 5 categorias e 3
// cidades diferentes, pra /descobrir ter algo real pra filtrar em vez de um resultado só.
// Mais leve que seedDemoTenant (sem financeiro/estoque/comissão) — o ponto aqui é a
// listagem do marketplace, não o operacional completo.
// ─────────────────────────────────────────────

interface MarketplaceDemoDef {
  slug: string;
  name: string;
  description: string;
  address: string;
  businessHours: string;
  city: string;
  neighborhood: string;
  latitude: number;
  longitude: number;
  priceRange: number;
  categorySlugs: string[];
  ownerEmail: string;
  ownerName: string;
  professionals: Array<{ name: string; email: string }>;
  services: Array<{ name: string; durationMinutes: number; priceCents: number }>;
  review: { rating: number; comment: string };
}

const marketplaceDemoDefs: MarketplaceDemoDef[] = [
  {
    slug: "barbearia-vintage",
    name: "Barbearia Vintage",
    description: "Barbearia clássica com corte navalhado, barboterapia e ambiente descontraído.",
    address: "Rua Harmonia, 456 - Vila Madalena",
    businessHours: "Seg-Sáb 9h-20h",
    city: "São Paulo",
    neighborhood: "Vila Madalena",
    latitude: -23.5505,
    longitude: -46.6907,
    priceRange: 2,
    categorySlugs: ["barbearia"],
    ownerEmail: "dono@barbeariavintage.com",
    ownerName: "Diego Ferreira",
    professionals: [{ name: "Diego Ferreira", email: "diego@barbeariavintage.com" }],
    services: [
      { name: "Corte masculino", durationMinutes: 40, priceCents: 6000 },
      { name: "Barba desenhada", durationMinutes: 30, priceCents: 4000 },
      { name: "Corte + Barba", durationMinutes: 60, priceCents: 9000 },
    ],
    review: { rating: 5, comment: "Melhor barbearia da região, corte impecável e ambiente muito bom." },
  },
  {
    slug: "studio-bella-hair",
    name: "Studio Bella Hair",
    description: "Cabeleireiro completo: corte, coloração e tratamentos capilares.",
    address: "Av. Brigadeiro Faria Lima, 2100 - Itaim Bibi",
    businessHours: "Ter-Sáb 9h-19h",
    city: "São Paulo",
    neighborhood: "Itaim Bibi",
    latitude: -23.5852,
    longitude: -46.6787,
    priceRange: 3,
    categorySlugs: ["salao-de-beleza"],
    ownerEmail: "dono@studiobellahair.com",
    ownerName: "Camila Rocha",
    professionals: [
      { name: "Camila Rocha", email: "camila@studiobellahair.com" },
      { name: "Lorena Alves", email: "lorena@studiobellahair.com" },
    ],
    services: [
      { name: "Corte feminino", durationMinutes: 60, priceCents: 12000 },
      { name: "Coloração", durationMinutes: 120, priceCents: 25000 },
      { name: "Escova", durationMinutes: 45, priceCents: 8000 },
      { name: "Hidratação", durationMinutes: 50, priceCents: 9500 },
    ],
    review: { rating: 5, comment: "Profissionais super atenciosas, resultado ficou perfeito." },
  },
  {
    slug: "nail-express",
    name: "Nail Express",
    description: "Manicure e pedicure com esmaltação em gel e nail art.",
    address: "Av. Nossa Senhora de Copacabana, 800 - Copacabana",
    businessHours: "Seg-Sáb 9h-19h",
    city: "Rio de Janeiro",
    neighborhood: "Copacabana",
    latitude: -22.9711,
    longitude: -43.1822,
    priceRange: 1,
    categorySlugs: ["manicure-pedicure"],
    ownerEmail: "dono@nailexpress.com",
    ownerName: "Patrícia Souza",
    professionals: [{ name: "Patrícia Souza", email: "patricia@nailexpress.com" }],
    services: [
      { name: "Manicure", durationMinutes: 40, priceCents: 3500 },
      { name: "Pedicure", durationMinutes: 45, priceCents: 4000 },
      { name: "Esmaltação em gel", durationMinutes: 60, priceCents: 6500 },
    ],
    review: { rating: 4, comment: "Rápido, capricho no acabamento. Só a espera que às vezes atrasa um pouco." },
  },
  {
    slug: "espaco-zen-estetica",
    name: "Espaço Zen Estética",
    description: "Limpeza de pele, massagem relaxante e tratamentos faciais.",
    address: "Rua Visconde de Pirajá, 500 - Ipanema",
    businessHours: "Seg-Sex 10h-19h",
    city: "Rio de Janeiro",
    neighborhood: "Ipanema",
    latitude: -22.9838,
    longitude: -43.2043,
    priceRange: 3,
    categorySlugs: ["estetica"],
    ownerEmail: "dono@espacozen.com",
    ownerName: "Renata Lima",
    professionals: [{ name: "Renata Lima", email: "renata@espacozen.com" }],
    services: [
      { name: "Limpeza de pele", durationMinutes: 60, priceCents: 15000 },
      { name: "Massagem relaxante", durationMinutes: 50, priceCents: 14000 },
      { name: "Drenagem linfática", durationMinutes: 60, priceCents: 16000 },
    ],
    review: { rating: 5, comment: "Ambiente super relaxante, saí de lá renovada." },
  },
  {
    slug: "sobrancelha-design",
    name: "Sobrancelha Design",
    description: "Design de sobrancelhas com henna e extensão de cílios.",
    address: "Rua Pium-í, 90 - Savassi",
    businessHours: "Ter-Sáb 10h-18h",
    city: "Belo Horizonte",
    neighborhood: "Savassi",
    latitude: -19.9385,
    longitude: -43.9367,
    priceRange: 2,
    categorySlugs: ["sobrancelha-cilios"],
    ownerEmail: "dono@sobrancelhadesign.com",
    ownerName: "Fernanda Costa",
    professionals: [{ name: "Fernanda Costa", email: "fernanda@sobrancelhadesign.com" }],
    services: [
      { name: "Design com henna", durationMinutes: 30, priceCents: 5000 },
      { name: "Extensão de cílios (fio a fio)", durationMinutes: 90, priceCents: 18000 },
    ],
    review: { rating: 5, comment: "Fernanda é uma artista, minhas sobrancelhas nunca ficaram tão boas." },
  },
  {
    slug: "charme-e-cia",
    name: "Charme & Cia",
    description: "Salão de beleza e manicure em um só lugar, atendimento de família.",
    address: "Av. Ibirapuera, 3000 - Moema",
    businessHours: "Seg-Sáb 9h-20h",
    city: "São Paulo",
    neighborhood: "Moema",
    latitude: -23.5975,
    longitude: -46.664,
    priceRange: 2,
    categorySlugs: ["salao-de-beleza", "manicure-pedicure"],
    ownerEmail: "dono@charmeecia.com",
    ownerName: "Juliana Prado",
    professionals: [{ name: "Juliana Prado", email: "juliana@charmeecia.com" }],
    services: [
      { name: "Corte feminino", durationMinutes: 60, priceCents: 9000 },
      { name: "Manicure", durationMinutes: 40, priceCents: 3000 },
      { name: "Escova", durationMinutes: 45, priceCents: 7000 },
    ],
    review: { rating: 4, comment: "Bom custo-benefício, atendimento simpático." },
  },
];

// Um único consumidor global reaproveitado nas avaliações de todos os negócios de demo —
// não precisa de um consumidor por tenant só pra popular uma nota.
const MARKETPLACE_DEMO_CONSUMER_PHONE = "11944443333";

async function seedMarketplaceDemoTenant(def: MarketplaceDemoDef, consumerId: string) {
  await resetDemoTenant(def.slug);

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, BCRYPT_ROUNDS);
  const now = new Date();

  const tenant = await prisma.tenant.create({
    data: {
      name: def.name,
      slug: def.slug,
      trialEndsAt: atHour(now, 30, 23, 59),
      description: def.description,
      address: def.address,
      businessHours: def.businessHours,
    },
  });

  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: def.ownerEmail,
      passwordHash,
      name: def.ownerName,
      // Telefone fictício estável (só para a demo mostrar o contato no painel da plataforma).
      phone: `1198888${String(def.slug.length * 137 % 10000).padStart(4, "0")}`,
      role: Role.OWNER,
    },
  });

  const professionals = [] as Array<{ id: string }>;
  for (const p of def.professionals) {
    const user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: p.email,
        passwordHash,
        name: p.name,
        role: Role.PROFESSIONAL,
      },
    });
    const professional = await prisma.professional.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        workingHours: {
          create: WEEKDAYS_MON_TO_FRI.map((weekday) => ({
            weekday,
            startMinute: 9 * 60,
            endMinute: 19 * 60,
          })),
        },
      },
    });
    professionals.push({ id: professional.id });
  }

  const services = [] as Array<{ id: string; durationMinutes: number; priceCents: number }>;
  for (const s of def.services) {
    const service = await prisma.service.create({ data: { tenantId: tenant.id, ...s } });
    services.push({ id: service.id, durationMinutes: s.durationMinutes, priceCents: s.priceCents });
    for (const professional of professionals) {
      await prisma.professionalService.create({
        data: { professionalId: professional.id, serviceId: service.id },
      });
    }
  }

  const categoryRows = await prisma.serviceCategory.findMany({
    where: { slug: { in: def.categorySlugs } },
  });
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      listedInMarketplace: true,
      city: def.city,
      neighborhood: def.neighborhood,
      latitude: def.latitude,
      longitude: def.longitude,
      priceRange: def.priceRange,
      categories: { create: categoryRows.map((c) => ({ categoryId: c.id })) },
    },
  });

  // Uma visita concluída + avaliação, pra a nota aparecer nos cards do marketplace.
  const client = await prisma.client.create({
    data: { tenantId: tenant.id, phone: MARKETPLACE_DEMO_CONSUMER_PHONE, name: "Consumidor Demo" },
  });
  await prisma.consumerTenantLink.create({
    data: { consumerId, tenantId: tenant.id, clientId: client.id },
  });
  const firstService = services[0];
  const startAt = atHour(now, -4, 11);
  const appointment = await prisma.appointment.create({
    data: {
      tenantId: tenant.id,
      professionalId: professionals[0].id,
      clientName: client.name,
      clientPhone: client.phone,
      clientId: client.id,
      startAt,
      endAt: new Date(startAt.getTime() + firstService.durationMinutes * 60_000),
      status: AppointmentStatus.COMPLETED,
      source: "PUBLIC",
      items: {
        create: {
          serviceId: firstService.id,
          position: 0,
          durationMinutes: firstService.durationMinutes,
          priceCentsSnapshot: firstService.priceCents,
        },
      },
    },
  });
  await prisma.review.create({
    data: {
      tenantId: tenant.id,
      consumerId,
      appointmentId: appointment.id,
      rating: def.review.rating,
      comment: def.review.comment,
    },
  });

  return tenant;
}

async function seedMarketplaceDemos() {
  const consumer = await prisma.consumer.upsert({
    where: { phone: MARKETPLACE_DEMO_CONSUMER_PHONE },
    update: {},
    create: {
      phone: MARKETPLACE_DEMO_CONSUMER_PHONE,
      name: "Consumidor Demo",
      consentedAt: new Date(),
    },
  });

  for (const def of marketplaceDemoDefs) {
    await seedMarketplaceDemoTenant(def, consumer.id);
  }
}

async function main() {
  await seedPlans();
  const { tenant } = await seedDemoTenant();
  await seedMarketplaceDemos();
  console.log(`Seed concluído.`);
  console.log(`  Tenant demo: /${tenant.slug}`);
  console.log(`  Login dono:      dono@salaodemo.com / ${SEED_PASSWORD}`);
  console.log(`  Login recepção:  recepcao@salaodemo.com / ${SEED_PASSWORD}`);
  console.log(`  Login profissional: alex@salaodemo.com / ${SEED_PASSWORD}`);
  console.log(`  + ${marketplaceDemoDefs.length} negócios de demonstração no marketplace (/descobrir):`);
  for (const d of marketplaceDemoDefs) {
    console.log(`    /${d.slug} — login dono: ${d.ownerEmail} / ${SEED_PASSWORD}`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
