import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('live')
  live() {
    return { status: 'live' };
  }

  @Get('ready')
  ready() {
    return { status: 'ready' };
  }
}
