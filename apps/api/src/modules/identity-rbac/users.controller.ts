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
import { USERS_SERVICE } from './tokens';
import { CreateUserDto, ListUsersQueryDto, UpdateUserDto } from './users.dto';
import type { UserRow } from './users.repository';
import type { UsersService } from './users.service';

/**
 * CRUD کاربران — GET/POST /users و GET/PATCH/DELETE /users/{id} طبق openapi.yaml.
 * گاردها: ورود (AuthGuard) + مجوز admin.user.manage (PermissionsGuard)؛
 * شرکت از نشست می‌آید نه از query — داده چندشرکتی با توکن دیگر قابل دسترسی نیست.
 * DELETE طبق قرارداد حذف فیزیکی نیست: غیرفعال‌سازی + ابطال نشست‌های باز.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('users')
export class UsersController {
  constructor(@Inject(USERS_SERVICE) private readonly service: UsersService) {}

  @Get()
  @RequirePermissions('admin.user.manage')
  list(
    @Query() query: ListUsersQueryDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<Page<UserRow>> {
    return this.service.list(companyId, query);
  }

  @Get(':id')
  @RequirePermissions('admin.user.manage')
  get(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
  ): Promise<UserRow> {
    return this.service.get(companyId, id);
  }

  @Post()
  @RequirePermissions('admin.user.manage')
  create(
    @Body() dto: CreateUserDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<UserRow> {
    return this.service.create(companyId, dto);
  }

  @Patch(':id')
  @RequirePermissions('admin.user.manage')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') currentUserId: string,
  ): Promise<UserRow> {
    return this.service.update(companyId, id, dto, currentUserId);
  }

  @Delete(':id')
  @RequirePermissions('admin.user.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') currentUserId: string,
  ): Promise<void> {
    await this.service.remove(companyId, id, currentUserId);
  }
}
