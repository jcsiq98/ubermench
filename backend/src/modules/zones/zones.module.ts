import { Module } from '@nestjs/common';
import { ZonesController } from './zones.controller';
import { ZonesService } from './zones.service';
import { GeocodingService } from './geocoding.service';

@Module({
  controllers: [ZonesController],
  providers: [ZonesService, GeocodingService],
  exports: [ZonesService, GeocodingService],
})
export class ZonesModule {}
