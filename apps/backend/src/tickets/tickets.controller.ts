import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { Role } from "@marquo/database";
import { TicketsService } from "./tickets.service";
import {
  AddPaymentDto,
  AddTicketItemDto,
  OpenTicketDto,
  SetTicketClientDto,
  SetTicketDiscountDto,
  SetTicketNoteDto,
  TicketReasonDto,
  UpdateTicketItemDto,
} from "./dto/ticket-dtos";
import { ListTicketsQueryDto } from "./dto/list-tickets-query.dto";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/types/auth-user";
import { Throttle } from "@nestjs/throttler";

import { Area } from "../access/area.decorator";
@Area("comandas")
@Controller("tickets")
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  // Sem `status` (ou OPEN): as comandas abertas, como sempre (lista simples). CLOSED/CANCELED: o histórico, paginado.
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListTicketsQueryDto) {
    if (query.status === "CLOSED" || query.status === "CANCELED") {
      return this.tickets.findFinished(user.tenantId, query.status, query);
    }
    return this.tickets.findOpen(user.tenantId, query);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.tickets.get(user.tenantId, id);
  }

  @Post()
  open(@CurrentUser() user: AuthenticatedUser, @Body() dto: OpenTicketDto) {
    return this.tickets.open(user.tenantId, user.userId, dto);
  }

  @Post(":id/items")
  addItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: AddTicketItemDto,
  ) {
    return this.tickets.addItem(user.tenantId, id, dto);
  }

  @Delete(":id/items/:itemId")
  removeItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Param("itemId") itemId: string,
  ) {
    return this.tickets.removeItem(user.tenantId, id, itemId);
  }

  @Patch(":id/items/:itemId")
  updateItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Param("itemId", new ParseUUIDPipe({ version: "4" })) itemId: string,
    @Body() dto: UpdateTicketItemDto,
  ) {
    return this.tickets.updateItem(user.tenantId, user.userId, id, itemId, dto);
  }

  @Patch(":id/note")
  setNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: SetTicketNoteDto,
  ) {
    return this.tickets.setNote(user.tenantId, id, dto);
  }

  @Patch(":id/client")
  setClient(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: SetTicketClientDto,
  ) {
    return this.tickets.setClient(user.tenantId, id, dto);
  }

  @Patch(":id/discount")
  setDiscount(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: SetTicketDiscountDto,
  ) {
    return this.tickets.setDiscount(user.tenantId, id, dto);
  }

  @Post(":id/payments")
  addPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: AddPaymentDto,
  ) {
    return this.tickets.addPayment(user.tenantId, id, dto);
  }

  // Remove (estorna) um pagamento lançado numa comanda ABERTA, com motivo no histórico. Recusado se o dinheiro entrou num caixa já fechado.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post(":id/payments/:paymentId/remove")
  removePayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Param("paymentId", new ParseUUIDPipe({ version: "4" })) paymentId: string,
    @Body() dto: TicketReasonDto,
  ) {
    return this.tickets.removePayment(user.tenantId, user.userId, id, paymentId, dto);
  }

  @Post(":id/close")
  close(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.tickets.close(user.tenantId, user.userId, id);
  }

  @Post(":id/cancel")
  cancel(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.tickets.cancel(user.tenantId, id);
  }

  // Reabre uma comanda FECHADA para corrigir: desfaz receita, comissão, baixa de estoque e uso do clube. Só o DONO (mexe em
  // dinheiro já fechado), com motivo registrado no histórico.
  @Roles(Role.OWNER)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(":id/reopen")
  reopen(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: TicketReasonDto,
  ) {
    return this.tickets.reopen(user.tenantId, user.userId, id, dto);
  }

  // Histórico de alterações (estornos, edições de item, reaberturas): só o dono.
  @Roles(Role.OWNER)
  @Get(":id/history")
  history(@CurrentUser() user: AuthenticatedUser, @Param("id", new ParseUUIDPipe({ version: "4" })) id: string) {
    return this.tickets.history(user.tenantId, id);
  }
}
