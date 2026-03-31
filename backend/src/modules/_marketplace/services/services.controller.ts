import {
  Controller,
  Get,
  Param,
  Query,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ServicesService } from './services.service';
import { Public } from '../../../common/decorators/public.decorator';

@ApiTags('Services')
@Controller('api/services')
export class ServicesController {
  constructor(private servicesService: ServicesService) {}

  @Get('categories')
  @Public()
  @ApiOperation({ summary: 'List all active service categories' })
  async getCategories() {
    return this.servicesService.getCategories();
  }

  @Get('providers')
  @Public()
  @ApiOperation({ summary: 'List providers by category' })
  @ApiQuery({ name: 'category', required: false, description: 'Category slug (e.g. plumbing)' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async getProviders(
    @Query('category') category?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.servicesService.getProvidersByCategory(
      category || '',
      limit ? parseInt(limit, 10) : 20,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  @Get('providers/:id')
  @Public()
  @ApiOperation({ summary: 'Get provider detail with reviews' })
  async getProviderDetail(@Param('id') id: string) {
    const provider = await this.servicesService.getProviderDetail(id);
    if (!provider) throw new NotFoundException('Provider not found');
    return provider;
  }
}
