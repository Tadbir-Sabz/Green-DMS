import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { CurrentUser } from '../identity-rbac/auth-context.decorator';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { CreateStaffDto, ListStaffQueryDto, UpdateStaffDto } from './staff.dto';
import type { StaffRow } from './staff.repository';
import type { StaffService } from './staff.service';
import { STAFF_SERVICE } from './tokens';

/**
 * CRUD پرسنل — GET/POST /staff و GET/PATCH /staff/{id} دقیقاً مطابق openapi.yaml
 * (پیشوند /api/v1 توسط main.ts اضافه می‌شود). DELETE در قرارداد نیست؛ وضعیت
 * با status (active/inactive) تغییر می‌کند.
 *
 * احراز هویت و مجوز: همه مسیرها AuthGuard + PermissionsGuard دارند (master.staff.*)؛
 * شرکت از نشست می‌آید نه از query.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('staff')
export class StaffController {
  constructor(@Inject(STAFF_SERVICE) private readonly service: StaffService) {}

  @Get()
  @RequirePermissions('master.staff.view')
  list(
    @Query() query: ListStaffQueryDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<Page<StaffRow>> {
    return this.service.list(companyId, query);
  }

  @Get(':id')
  @RequirePermissions('master.staff.view')
  get(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
  ): Promise<StaffRow> {
    return this.service.get(companyId, id);
  }

  @Post()
  @RequirePermissions('master.staff.create')
  create(
    @Body() dto: CreateStaffDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<StaffRow> {
    return this.service.create(companyId, dto);
  }

  @Patch(':id')
  @RequirePermissions('master.staff.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateStaffDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<StaffRow> {
    return this.service.update(companyId, id, dto);
  }
}
