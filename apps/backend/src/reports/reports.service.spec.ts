import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from './reports.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ReportsService', () => {
  let service: ReportsService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        {
          provide: PrismaService,
          useValue: {
            ticket: {
              findMany: jest.fn(),
            },
            ticketItem: {
              findMany: jest.fn(),
              aggregate: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getGeneralBalance', () => {
    it('should query tickets using tenantId to ensure isolation (Anti-IDOR)', async () => {
      jest.spyOn(prisma.ticket, 'findMany').mockResolvedValue([]);
      
      const startDate = new Date('2026-10-01');
      const endDate = new Date('2026-10-31');

      const result = await service.getGeneralBalance('tenant-1', startDate, endDate);

      expect(prisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-1',
          }),
        })
      );
      
      expect(result.totalServices).toBe(0);
    });

    it('should correctly aggregate services and products from different tickets', async () => {
      jest.spyOn(prisma.ticket, 'findMany').mockResolvedValue([
        { id: 'ticket-1', discountCents: 0, clubCoveredCents: 0, items: [] },
        { id: 'ticket-2', discountCents: 0, clubCoveredCents: 0, items: [] },
      ] as any);

      jest.spyOn(prisma.ticketItem, 'findMany').mockResolvedValue([
        { kind: 'SERVICE', quantity: 2, description: 'Corte', serviceId: 's1' },
        { kind: 'SERVICE', quantity: 1, description: 'Corte', serviceId: 's1' },
        { kind: 'SERVICE', quantity: 1, description: 'Barba', serviceId: 's2' },
        { kind: 'PRODUCT', quantity: 3, description: 'Pomada', productId: 'p1' },
      ] as any);

      const result = await service.getGeneralBalance('tenant-1', new Date(), new Date());

      expect(result).toEqual({
        totalRevenueCents: 0,
        totalTickets: 2,
        averageTicketCents: 0,
        totalServices: 4,
        mostRequestedService: { name: 'Corte', count: 3 },
        totalProducts: 3,
        mostSoldProduct: { name: 'Pomada', count: 3 },
      });
    });
  });

  describe('getClientMonthlyBalance', () => {
    it('should query tickets using BOTH tenantId and clientId to prevent cross-tenant access', async () => {
      jest.spyOn(prisma.ticket, 'findMany').mockResolvedValue([{ id: 'ticket-1' }] as any);
      jest.spyOn(prisma.ticketItem, 'aggregate').mockResolvedValue({ _sum: { quantity: 2 } } as any);

      const result = await service.getClientMonthlyBalance('tenant-1', 'client-a', 2026, 10);

      expect(prisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-1',
            clientId: 'client-a',
          }),
        })
      );
      expect(result.totalServices).toBe(2);
    });

    it('should return 0 if client belongs to another tenant or has no closed tickets', async () => {
      // Simula a segurança: se um dono pedir os dados de um cliente de outro tenant, a query findMany não achará nada no escopo dele.
      jest.spyOn(prisma.ticket, 'findMany').mockResolvedValue([]);
      
      const result = await service.getClientMonthlyBalance('tenant-1', 'client-b', 2026, 10);
      
      expect(result.totalServices).toBe(0);
      expect(prisma.ticketItem.aggregate).not.toHaveBeenCalled();
    });
  });
});
