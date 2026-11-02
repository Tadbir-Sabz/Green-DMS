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
import { CreatePersonDto, ListPersonsQueryDto, UpdatePersonDto } from './person.dto';
import type { PersonRow } from './person.repository';
import type { PersonService } from './person.service';
import { PERSON_SERVICE } from './tokens';

/**
 * CRUD اشخاص — GET/POST /persons و GET/PATCH /persons/{id} دقیقاً مطابق
 * openapi.yaml (پیشوند /api/v1 توسط main.ts اضافه می‌شود). در قرارداد
 * DELETE نیست چون شخصِ مرجعِ مشتری/پرسنل است؛ غیرفعال‌سازی با is_active انجام می‌شود.
 *
 * احراز هویت و مجوز: همه مسیرها AuthGuard + PermissionsGuard دارند و هر کدام
 * مجوز خودش را می‌خواهد (master.person.*)؛ شرکت از نشست می‌آید نه از query.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('persons')
export class PersonController {
  constructor(@Inject(PERSON_SERVICE) private readonly service: PersonService) {}

  @Get()
  @RequirePermissions('master.person.view')
  list(
    @Query() query: ListPersonsQueryDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<Page<PersonRow>> {
    return this.service.list(companyId, query);
  }

  @Get(':id')
  @RequirePermissions('master.person.view')
  get(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
  ): Promise<PersonRow> {
    return this.service.get(companyId, id);
  }

  @Post()
  @RequirePermissions('master.person.create')
  create(
    @Body() dto: CreatePersonDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<PersonRow> {
    return this.service.create(companyId, dto);
  }

  @Patch(':id')
  @RequirePermissions('master.person.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePersonDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<PersonRow> {
    return this.service.update(companyId, id, dto);
  }
}
