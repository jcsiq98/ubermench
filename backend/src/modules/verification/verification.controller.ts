import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { VerificationService } from './verification.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Verification')
@Controller('api')
export class VerificationController {
  constructor(private service: VerificationService) {}

  @Post('admin/verification/:applicationId/start')
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Start automated verification for an application' })
  async startVerification(@Param('applicationId') applicationId: string) {
    return this.service.startVerification(applicationId);
  }

  @Get('admin/verification/:applicationId/results')
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get verification results for an application' })
  async getResults(@Param('applicationId') applicationId: string) {
    return this.service.getVerificationResults(applicationId);
  }

  @Get('admin/verification/metrics')
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get verification pipeline metrics' })
  async getMetrics() {
    return this.service.getVerificationMetrics();
  }

  @Post('webhook/verification/truora')
  @Public()
  @ApiOperation({ summary: 'Truora webhook callback' })
  async truoraWebhook(@Body() payload: any) {
    return this.service.handleWebhook('truora', payload);
  }

  @Post('webhook/verification/metamap')
  @Public()
  @ApiOperation({ summary: 'MetaMap webhook callback' })
  async metamapWebhook(@Body() payload: any) {
    return this.service.handleWebhook('metamap', payload);
  }
}
