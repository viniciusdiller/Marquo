import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { Role } from "@marquo/database";
import { ProductsService } from "./products.service";
import { CreateProductDto } from "./dto/create-product.dto";
import { UpdateProductDto } from "./dto/update-product.dto";
import { AdjustStockDto } from "./dto/adjust-stock.dto";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/types/auth-user";
import { PaginationQueryDto } from "../common/pagination/pagination-query.dto";

@Roles(Role.OWNER, Role.RECEPTIONIST)
@Controller("products")
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query("includeInactive") includeInactive?: string) {
    return this.products.list(user.tenantId, includeInactive === "true");
  }

  @Get(":id")
  detail(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.products.getOrThrow(user.tenantId, id);
  }

  @Get(":id/movements")
  movements(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.products.listMovements(user.tenantId, id, query);
  }

  @Roles(Role.OWNER)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateProductDto) {
    return this.products.create(user.tenantId, dto);
  }

  @Roles(Role.OWNER)
  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.update(user.tenantId, id, dto);
  }

  @Post(":id/stock")
  adjustStock(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: AdjustStockDto,
  ) {
    return this.products.adjustStock(user.tenantId, id, dto);
  }
}
