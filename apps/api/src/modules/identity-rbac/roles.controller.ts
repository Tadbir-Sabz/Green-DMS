import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { CurrentUser } from './auth-context.decorator';
import { AuthGuard } from './auth.guard';
import { PermissionsGuard } from './permissions.guard';
import { RequirePermissions } from './require-permissions.decorator';
import { ROLES_SERVICE } from './tokens';
import { CreateRoleDto, ListRolesQueryDto, UpdateRoleDto } from './roles.dto';
import type { RoleRow } from './roles.repository';
import type { RolesService } from './roles.service';

/**
 * CRUD نقش‌ها و نگاشت مجوزهایشان — GET/POST /roles و GET/PATCH/DELETE /roles/{id}
 * طبق openapi.yaml. مجوزها (permission) CRUD جدا ندارند؛ از طریق
 * permission_codes روی نقش خوانده/نوشته می‌شوند (ضمیمه H — RBAC الگومحور).
 * گاردها: ورود + مجوز admin.role.manage.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('roles')
export class RolesController {
  constructor(@Inject(ROLES_SERVICE) private readonly service: RolesService) {}

  @Get()
  @RequirePermissions('admin.role.manage')
  list(
    @Query() query: ListRolesQueryDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<Page<RoleRow>> {
    return this.service.list(companyId, query);
  }

  @Get(':id')
  @RequirePermissions('admin.role.manage')
  get(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
  ): Promise<RoleRow> {
    return this.service.get(companyId, id);
  }

  @Post()
  @RequirePermissions('admin.role.manage')
  create(
    @Body() dto: CreateRoleDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<RoleRow> {
    return this.service.create(companyId, dto);
  }

  @Patch(':id')
  @RequirePermissions('admin.role.manage')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<RoleRow> {
    return this.service.update(companyId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('admin.role.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
  ): Promise<void> {
    await this.service.remove(companyId, id);
  }
}
