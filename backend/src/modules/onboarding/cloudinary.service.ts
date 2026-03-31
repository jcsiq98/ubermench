import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);
  private readonly isConfigured: boolean;

  constructor(private config: ConfigService) {
    const cloudName = this.config.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.config.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.config.get<string>('CLOUDINARY_API_SECRET');

    if (cloudName && apiKey && apiSecret) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
      });
      this.isConfigured = true;
      this.logger.log('Cloudinary configured successfully');
    } else {
      this.isConfigured = false;
      this.logger.warn(
        'Cloudinary not configured — photo uploads will be disabled. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET',
      );
    }
  }

  /**
   * Upload a photo to Cloudinary
   * @param file Buffer or base64 string
   * @param folder Folder path in Cloudinary (e.g., 'verification/ine')
   * @param publicId Optional public ID for the image
   * @returns URL of the uploaded image
   */
  async uploadPhoto(
    file: Buffer | string,
    folder: string = 'verification',
    publicId?: string,
  ): Promise<string> {
    if (!this.isConfigured) {
      const placeholder = `https://placeholder.dev/cloudinary/${folder}/${publicId || 'photo'}.jpg`;
      this.logger.warn(
        `Cloudinary not configured — returning dev placeholder: ${placeholder}`,
      );
      return placeholder;
    }

    try {
      const uploadOptions: any = {
        folder,
        resource_type: 'image',
        // Secure: true for HTTPS URLs
        secure: true,
        // Transformation: limit size and format
        transformation: [
          { width: 2000, height: 2000, crop: 'limit' },
          { quality: 'auto:good' },
          { format: 'jpg' },
        ],
      };

      if (publicId) {
        uploadOptions.public_id = publicId;
      }

      let uploadResult;
      if (Buffer.isBuffer(file)) {
        // Upload from buffer
        uploadResult = await new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            uploadOptions,
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            },
          );
          uploadStream.end(file);
        });
      } else {
        // Upload from base64 string
        uploadResult = await cloudinary.uploader.upload(file, uploadOptions);
      }

      const url = (uploadResult as any).secure_url;
      this.logger.log(`Photo uploaded to Cloudinary: ${url}`);
      return url;
    } catch (error: any) {
      this.logger.error(`Cloudinary upload failed: ${error.message}`, error.stack);
      throw new Error(`Failed to upload photo: ${error.message}`);
    }
  }

  /**
   * Delete a photo from Cloudinary
   */
  async deletePhoto(publicId: string): Promise<void> {
    if (!this.isConfigured) {
      return;
    }

    try {
      await cloudinary.uploader.destroy(publicId);
      this.logger.log(`Photo deleted from Cloudinary: ${publicId}`);
    } catch (error: any) {
      this.logger.error(`Cloudinary delete failed: ${error.message}`);
      // Don't throw — deletion is best effort
    }
  }
}

