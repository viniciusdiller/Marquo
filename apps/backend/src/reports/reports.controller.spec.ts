import { Test, TestingModule } from '@nestjs/testing';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { Role } from '@marquo/database';

describe('ReportsController', () => {
  let controller: ReportsController;
  let service: ReportsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [
        {
          provide: ReportsService,
          useValue: {
            getGeneralBalance: jest.fn(),
            getClientMonthlyBalance: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<ReportsController>(ReportsController);
    service = module.get<ReportsService>(ReportsService);
  });

  it('should pass the authenticated user tenantId and prevent cross-tenant data access', async () => {
    const fakeUser = {
      id: 'user-1',
      tenantId: 'tenant-1',
      role: Role.OWNER,
    };

    const query = {
      startDate: '2026-10-01',
      endDate: '2026-10-31',
    };

    await controller.getGeneralBalance(fakeUser as any, query);

    expect(service.getGeneralBalance).toHaveBeenCalledWith(
      'tenant-1',
      new Date('2026-10-01'),
      new Date('2026-10-31'),
    );
  });

  it('should enforce tenant isolation regardless of which clientId is requested (Cross-Tenant Intrusion Test)', async () => {
    const fakeUser = {
      id: 'user-receptionist',
      tenantId: 'tenant-A', // Autenticado no Tenant A
      role: Role.RECEPTIONIST,
    };

    const query = {
      clientId: 'client-from-tenant-B', // Atacante tentando ver dados de um cliente de outro tenant
      year: 2026,
      month: 10,
    };

    await controller.getClientMonthlyBalance(fakeUser as any, query);

    // O controller MUST passar 'tenant-A' para o service, forçando a busca estritamente no escopo da barbearia atual.
    expect(service.getClientMonthlyBalance).toHaveBeenCalledWith(
      'tenant-A',
      'client-from-tenant-B',
      2026,
      10,
    );
  });
});
