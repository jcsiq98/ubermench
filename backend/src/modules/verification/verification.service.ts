import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * Automated verification pipeline (3 layers):
 *
 * 1. Face match >90% + INE valid → auto-approve as Tier 2
 * 2. Face match 70-90%           → manual review queue
 * 3. Face match <70% or INE invalid → auto-reject + notify
 *
 * Supports Truora and MetaMap as providers. Falls back to
 * manual review when no provider is configured.
 */

const AUTO_APPROVE_THRESHOLD = 90;
const MANUAL_REVIEW_THRESHOLD = 70;

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);
  private readonly provider: string;
  private readonly apiKey: string | undefined;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private eventEmitter: EventEmitter2,
  ) {
    this.provider =
      this.config.get<string>('VERIFICATION_PROVIDER') || 'manual';
    this.apiKey = this.config.get<string>('VERIFICATION_API_KEY');
  }

  /**
   * Start the verification pipeline for an application that has submitted docs.
   */
  async startVerification(applicationId: string) {
    const application = await this.prisma.providerApplication.findUnique({
      where: { id: applicationId },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    if (application.verificationStatus !== 'DOCS_SUBMITTED') {
      throw new BadRequestException(
        `Cannot verify application with status ${application.verificationStatus}`,
      );
    }

    if (
      !application.inePhotoFront ||
      !application.inePhotoBack ||
      !application.selfiePhoto
    ) {
      throw new BadRequestException('Missing verification documents');
    }

    // Mark as in progress
    await this.prisma.providerApplication.update({
      where: { id: applicationId },
      data: { verificationStatus: 'VERIFICATION_IN_PROGRESS' },
    });

    if (this.provider === 'truora' && this.apiKey) {
      return this.verifyWithTruora(application);
    } else if (this.provider === 'metamap' && this.apiKey) {
      return this.verifyWithMetaMap(application);
    } else {
      // No external provider configured — send to manual review
      this.logger.log(
        `No verification provider configured — application ${applicationId} sent to manual review`,
      );
      await this.prisma.providerApplication.update({
        where: { id: applicationId },
        data: { verificationStatus: 'DOCS_SUBMITTED' },
      });

      await this.recordResult(applicationId, {
        provider: 'manual',
        faceMatchScore: null,
        ineValid: null,
        livenessScore: null,
        decision: 'manual_review',
      });

      return {
        status: 'manual_review',
        message: 'No automated provider configured — sent to admin review',
      };
    }
  }

  /**
   * Handle webhook callback from verification provider (async result).
   */
  async handleWebhook(
    provider: string,
    payload: any,
  ) {
    this.logger.log(`Verification webhook received from ${provider}`);

    let applicationId: string;
    let faceMatchScore: number;
    let ineValid: boolean;
    let livenessScore: number;

    if (provider === 'truora') {
      applicationId = payload.metadata?.application_id;
      faceMatchScore = (payload.face_match?.score ?? 0) * 100;
      ineValid = payload.document_validation?.valid ?? false;
      livenessScore = (payload.liveness?.score ?? 0) * 100;
    } else if (provider === 'metamap') {
      applicationId = payload.metadata?.applicationId;
      faceMatchScore = payload.steps?.faceMatch?.data?.score ?? 0;
      ineValid = payload.steps?.documentValidation?.data?.valid ?? false;
      livenessScore = payload.steps?.liveness?.data?.score ?? 0;
    } else {
      this.logger.warn(`Unknown verification provider: ${provider}`);
      return { received: true };
    }

    if (!applicationId) {
      this.logger.warn('Webhook missing application ID');
      return { received: true };
    }

    const application = await this.prisma.providerApplication.findUnique({
      where: { id: applicationId },
    });

    if (!application) {
      this.logger.warn(`Application ${applicationId} not found for webhook`);
      return { received: true };
    }

    await this.processVerificationResult(applicationId, {
      faceMatchScore,
      ineValid,
      livenessScore,
      rawResponse: payload,
      provider,
    });

    return { received: true };
  }

  /**
   * Process the verification result and make a decision.
   */
  async processVerificationResult(
    applicationId: string,
    result: {
      faceMatchScore: number;
      ineValid: boolean;
      livenessScore: number;
      rawResponse?: any;
      provider: string;
    },
  ) {
    const { faceMatchScore, ineValid, livenessScore, rawResponse, provider } =
      result;

    let decision: string;

    if (faceMatchScore >= AUTO_APPROVE_THRESHOLD && ineValid) {
      decision = 'auto_approved';
    } else if (faceMatchScore >= MANUAL_REVIEW_THRESHOLD) {
      decision = 'manual_review';
    } else {
      decision = 'auto_rejected';
    }

    // Record the result
    await this.recordResult(applicationId, {
      provider,
      faceMatchScore,
      ineValid,
      livenessScore,
      decision,
      rawResponse,
    });

    const application = await this.prisma.providerApplication.findUnique({
      where: { id: applicationId },
    });

    if (!application) return;

    if (decision === 'auto_approved') {
      this.logger.log(
        `Application ${applicationId} auto-approved (face: ${faceMatchScore}%, INE: valid)`,
      );

      // Emit approval event — AdminService handles the actual creation
      this.eventEmitter.emit('verification.auto_approved', {
        applicationId,
        phone: application.phone,
        name: application.name,
        tier: 2,
        faceMatchScore,
      });
    } else if (decision === 'auto_rejected') {
      this.logger.log(
        `Application ${applicationId} auto-rejected (face: ${faceMatchScore}%, INE: ${ineValid})`,
      );

      await this.prisma.providerApplication.update({
        where: { id: applicationId },
        data: {
          verificationStatus: 'REJECTED',
          rejectionReason: this.buildRejectionReason(
            faceMatchScore,
            ineValid,
          ),
          reviewedAt: new Date(),
          reviewedBy: 'system',
        },
      });

      this.eventEmitter.emit('application.rejected', {
        phone: application.phone,
        name: application.name,
        reason: this.buildRejectionReason(faceMatchScore, ineValid),
      });
    } else {
      // Manual review — put back in DOCS_SUBMITTED
      this.logger.log(
        `Application ${applicationId} needs manual review (face: ${faceMatchScore}%)`,
      );

      await this.prisma.providerApplication.update({
        where: { id: applicationId },
        data: { verificationStatus: 'DOCS_SUBMITTED' },
      });
    }

    return { decision, faceMatchScore, ineValid };
  }

  async getVerificationResults(applicationId: string) {
    return this.prisma.verificationResult.findMany({
      where: { applicationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getVerificationMetrics() {
    const [total, autoApproved, manualReview, autoRejected] =
      await Promise.all([
        this.prisma.verificationResult.count(),
        this.prisma.verificationResult.count({
          where: { decision: 'auto_approved' },
        }),
        this.prisma.verificationResult.count({
          where: { decision: 'manual_review' },
        }),
        this.prisma.verificationResult.count({
          where: { decision: 'auto_rejected' },
        }),
      ]);

    const avgFaceMatch = await this.prisma.verificationResult.aggregate({
      _avg: { faceMatchScore: true },
      where: { faceMatchScore: { not: null } },
    });

    return {
      total,
      autoApproved,
      manualReview,
      autoRejected,
      autoApprovalRate: total > 0 ? (autoApproved / total) * 100 : 0,
      avgFaceMatchScore: avgFaceMatch._avg.faceMatchScore ?? 0,
    };
  }

  private async recordResult(
    applicationId: string,
    data: {
      provider: string;
      faceMatchScore: number | null;
      ineValid: boolean | null;
      livenessScore: number | null;
      decision: string;
      rawResponse?: any;
      externalId?: string;
    },
  ) {
    return this.prisma.verificationResult.create({
      data: {
        applicationId,
        provider: data.provider,
        faceMatchScore: data.faceMatchScore,
        ineValid: data.ineValid,
        livenessScore: data.livenessScore,
        decision: data.decision,
        rawResponse: data.rawResponse || null,
        externalId: data.externalId,
        processedAt: new Date(),
      },
    });
  }

  private buildRejectionReason(
    faceMatchScore: number,
    ineValid: boolean,
  ): string {
    const reasons: string[] = [];

    if (faceMatchScore < MANUAL_REVIEW_THRESHOLD) {
      reasons.push(
        `La foto selfie no coincide suficientemente con la foto del INE (${Math.round(faceMatchScore)}% de coincidencia)`,
      );
    }

    if (!ineValid) {
      reasons.push('El INE no pudo ser validado');
    }

    return reasons.length > 0
      ? reasons.join('. ') + '.'
      : 'Verificación automática no aprobada.';
  }

  // Truora integration
  private async verifyWithTruora(application: any) {
    try {
      const axios = (await import('axios')).default;
      const response = await axios.post(
        'https://api.truora.com/v1/checks',
        {
          type: 'identity',
          country: 'MX',
          document_type: 'national-id',
          front_image: application.inePhotoFront,
          back_image: application.inePhotoBack,
          selfie_image: application.selfiePhoto,
          metadata: { application_id: application.id },
        },
        {
          headers: {
            'Truora-API-Key': this.apiKey,
            'Content-Type': 'application/json',
          },
        },
      );

      this.logger.log(
        `Truora check started for application ${application.id}: ${response.data.check_id}`,
      );

      await this.recordResult(application.id, {
        provider: 'truora',
        faceMatchScore: null,
        ineValid: null,
        livenessScore: null,
        decision: 'pending',
        externalId: response.data.check_id,
      });

      return {
        status: 'processing',
        externalId: response.data.check_id,
        message: 'Verification started — result will arrive via webhook',
      };
    } catch (error: any) {
      this.logger.error(
        `Truora verification failed: ${error.message}`,
      );
      // Fallback to manual review
      await this.prisma.providerApplication.update({
        where: { id: application.id },
        data: { verificationStatus: 'DOCS_SUBMITTED' },
      });
      return {
        status: 'manual_review',
        message: 'Automated verification failed — sent to manual review',
      };
    }
  }

  // MetaMap integration
  private async verifyWithMetaMap(application: any) {
    try {
      const axios = (await import('axios')).default;
      const response = await axios.post(
        'https://api.getmati.com/v2/verifications',
        {
          flowId: this.config.get<string>('METAMAP_FLOW_ID'),
          metadata: { applicationId: application.id },
          documentPhotos: [
            { type: 'front', url: application.inePhotoFront },
            { type: 'back', url: application.inePhotoBack },
          ],
          selfiePhoto: { url: application.selfiePhoto },
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      this.logger.log(
        `MetaMap verification started for application ${application.id}: ${response.data.id}`,
      );

      await this.recordResult(application.id, {
        provider: 'metamap',
        faceMatchScore: null,
        ineValid: null,
        livenessScore: null,
        decision: 'pending',
        externalId: response.data.id,
      });

      return {
        status: 'processing',
        externalId: response.data.id,
        message: 'Verification started — result will arrive via webhook',
      };
    } catch (error: any) {
      this.logger.error(
        `MetaMap verification failed: ${error.message}`,
      );
      await this.prisma.providerApplication.update({
        where: { id: application.id },
        data: { verificationStatus: 'DOCS_SUBMITTED' },
      });
      return {
        status: 'manual_review',
        message: 'Automated verification failed — sent to manual review',
      };
    }
  }
}
