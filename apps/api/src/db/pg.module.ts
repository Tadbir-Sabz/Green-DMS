import { Module } from '@nestjs/common';
import { Pool } from 'pg';

export const PG_POOL = 'PG_POOL';

@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: () => new Pool(),
    },
  ],
  exports: [PG_POOL],
})
export class PgModule {}
