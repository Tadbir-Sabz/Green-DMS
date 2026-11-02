import { Module } from '@nestjs/common';
import { IdentityRbacModule } from '../identity-rbac/identity-rbac.module';
import { RulesEngineController } from './rules-engine.controller';
import { RulesEngineRepository } from './rules-engine.repository';
import { RulesEngineService } from './rules-engine.service';
import { RULES_ENGINE_REPOSITORY, RULES_ENGINE_SERVICE } from './rules-engine.tokens';

/** ماژول ۳ — کنترل‌ها و قوانین جامع (Rules Engine) */
@Module({
  imports: [IdentityRbacModule],
  controllers: [RulesEngineController],
  providers: [
    RulesEngineRepository,
    { provide: RULES_ENGINE_REPOSITORY, useExisting: RulesEngineRepository },
    RulesEngineService,
    { provide: RULES_ENGINE_SERVICE, useExisting: RulesEngineService },
  ],
  exports: [RULES_ENGINE_SERVICE],
})
export class RulesEngineModule {}
