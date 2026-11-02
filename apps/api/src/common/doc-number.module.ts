import { Global, Module } from '@nestjs/common';
import { DocNumberService, DOC_NUMBER_SERVICE } from './doc-number.service';

/**
 * ماژول سراسری شماره‌گذاری اسناد — هر ماژول پولی/انباری (sales، inventory،
 * finance، tours) شماره سند را از document_series/number_counter می‌گیرد.
 * سراسری است چون PG_POOL سراسری است و چندین ماژول به آن نیاز دارند.
 */
@Global()
@Module({
  providers: [DocNumberService, { provide: DOC_NUMBER_SERVICE, useExisting: DocNumberService }],
  exports: [DocNumberService, DOC_NUMBER_SERVICE],
})
export class DocNumberModule {}
