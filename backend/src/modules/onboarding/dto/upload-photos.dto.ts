import { IsNotEmpty } from 'class-validator';

export class UploadPhotosDto {
  @IsNotEmpty()
  ineFront: Express.Multer.File;

  @IsNotEmpty()
  ineBack: Express.Multer.File;

  @IsNotEmpty()
  selfie: Express.Multer.File;
}

