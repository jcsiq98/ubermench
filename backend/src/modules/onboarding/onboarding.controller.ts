import {
  Controller,
  Post,
  Get,
  Param,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
  UnauthorizedException,
  UploadedFile,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Public } from '../../common/decorators/public.decorator';
import { OnboardingService } from './onboarding.service';
import { memoryStorage } from 'multer';

// Configure multer for memory storage
const multerOptions = {
  storage: memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max per file
  },
  fileFilter: (req: any, file: Express.Multer.File, cb: any) => {
    // Accept only images
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new BadRequestException('Only image files are allowed'), false);
    }
  },
};

@Controller('api/onboarding')
@Public() // All endpoints are public (no auth required)
export class OnboardingController {
  constructor(private onboardingService: OnboardingService) {}

  /**
   * Verify a token and return application info
   * GET /api/onboarding/verify/:token
   */
  @Get('verify/:token')
  async verifyToken(@Param('token') token: string) {
    try {
      const info = await this.onboardingService.verifyToken(token);
      return {
        success: true,
        applicationId: info.applicationId,
        phone: info.phone,
        name: info.name,
      };
    } catch (error: any) {
      throw new UnauthorizedException(error.message || 'Invalid token');
    }
  }

  /**
   * Upload verification photos
   * POST /api/onboarding/verify/:token/photos
   * Expects form-data with fields: ineFront, ineBack, selfie
   */
  @Post('verify/:token/photos')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'ineFront', maxCount: 1 },
        { name: 'ineBack', maxCount: 1 },
        { name: 'selfie', maxCount: 1 },
      ],
      multerOptions,
    ),
  )
  async uploadPhotos(
    @Param('token') token: string,
    @UploadedFiles()
    files: {
      ineFront?: Express.Multer.File[];
      ineBack?: Express.Multer.File[];
      selfie?: Express.Multer.File[];
    },
  ) {
    // Verify token first
    const info = await this.onboardingService.verifyToken(token);

    // Validate all files are present
    if (!files.ineFront || !files.ineFront[0]) {
      throw new BadRequestException('INE front photo is required');
    }
    if (!files.ineBack || !files.ineBack[0]) {
      throw new BadRequestException('INE back photo is required');
    }
    if (!files.selfie || !files.selfie[0]) {
      throw new BadRequestException('Selfie photo is required');
    }

    await this.onboardingService.uploadVerificationPhotos(
      info.applicationId,
      files.ineFront[0],
      files.ineBack[0],
      files.selfie[0],
    );

    return {
      success: true,
      message: 'Photos uploaded successfully. Your application is under review.',
    };
  }
}

