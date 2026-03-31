import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../config/redis.service';
import { Prisma } from '@prisma/client';
import {
  WorkspaceConfigData,
  WorkspaceContextDto,
  WorkspaceService as WorkspaceServiceType,
  WorkspaceSchedule,
  WorkspaceAutoReply,
} from '../ai/ai.types';

const CACHE_PREFIX = 'workspace:';
const CACHE_TTL = 86400; // 24 hours

@Injectable()
export class WorkspaceService {
  private readonly logger = new Logger(WorkspaceService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async getWorkspaceContext(providerId: string): Promise<WorkspaceContextDto> {
    const workspace = await this.getWorkspace(providerId);
    return {
      services: (workspace.services as WorkspaceServiceType[]) || [],
      schedule: (workspace.schedule as WorkspaceSchedule) || {},
      autoReply: (workspace.autoReply as WorkspaceAutoReply) || {
        enabled: false,
        message: '',
      },
      notes: workspace.notes,
    };
  }

  async getWorkspace(providerId: string) {
    const cacheKey = `${CACHE_PREFIX}${providerId}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    let workspace = await this.prisma.workspaceProfile.findUnique({
      where: { providerId },
    });

    if (!workspace) {
      workspace = await this.prisma.workspaceProfile.create({
        data: {
          providerId,
          services: [],
          schedule: {},
          autoReply: { enabled: false, message: '' },
        },
      });
    }

    await this.redis.set(cacheKey, JSON.stringify(workspace), CACHE_TTL);
    return workspace;
  }

  async applyConfig(
    providerId: string,
    config: WorkspaceConfigData,
  ): Promise<{ success: boolean; confirmationMessage: string }> {
    const workspace = await this.getWorkspace(providerId);

    const services: WorkspaceServiceType[] =
      (workspace.services as WorkspaceServiceType[]) || [];
    const schedule: WorkspaceSchedule =
      (workspace.schedule as WorkspaceSchedule) || {};
    const autoReply: WorkspaceAutoReply =
      (workspace.autoReply as WorkspaceAutoReply) || {
        enabled: false,
        message: '',
      };

    let confirmationMessage = '';

    switch (config.action) {
      case 'add_service': {
        if (!config.serviceName) {
          return {
            success: false,
            confirmationMessage:
              '¿Qué servicio quieres agregar? Dime el nombre y el precio.',
          };
        }
        const existing = services.findIndex(
          (s) => s.name.toLowerCase() === config.serviceName!.toLowerCase(),
        );
        const unit = config.serviceUnit || 'visita';
        if (existing >= 0) {
          services[existing] = {
            name: config.serviceName,
            price: config.servicePrice || services[existing].price,
            unit,
          };
          confirmationMessage = `Actualicé ${config.serviceName}: $${services[existing].price} por ${unit}`;
        } else {
          services.push({
            name: config.serviceName,
            price: config.servicePrice || 0,
            unit,
          });
          confirmationMessage = `Agregué ${config.serviceName} a tus servicios: $${config.servicePrice || 0} por ${unit}`;
        }
        break;
      }

      case 'remove_service': {
        const idx = services.findIndex(
          (s) => s.name.toLowerCase() === config.serviceName?.toLowerCase(),
        );
        if (idx >= 0) {
          const removed = services.splice(idx, 1)[0];
          confirmationMessage = `Quité ${removed.name} de tus servicios`;
        } else {
          return {
            success: false,
            confirmationMessage: `No encontré "${config.serviceName}" en tus servicios. Escribe *"mis servicios"* para ver los que tienes.`,
          };
        }
        break;
      }

      case 'set_schedule': {
        if (config.days) schedule.days = config.days;
        if (config.timeStart) schedule.timeStart = config.timeStart;
        if (config.timeEnd) schedule.timeEnd = config.timeEnd;
        const daysStr = schedule.days?.join(', ') || 'los días que indicaste';
        confirmationMessage = `Guardé tu horario: ${daysStr} de ${schedule.timeStart || '?'} a ${schedule.timeEnd || '?'}`;
        break;
      }

      case 'set_auto_reply': {
        if (config.autoReplyEnabled !== undefined)
          autoReply.enabled = config.autoReplyEnabled;
        if (config.autoReplyMessage)
          autoReply.message = config.autoReplyMessage;
        confirmationMessage = autoReply.enabled
          ? `Respuesta automática activada: "${autoReply.message}"`
          : 'Respuesta automática desactivada';
        break;
      }

      case 'add_note': {
        await this.prisma.workspaceProfile.update({
          where: { providerId },
          data: { notes: config.note },
        });
        await this.invalidateCache(providerId);
        return { success: true, confirmationMessage: 'Guardé esa nota' };
      }

      default:
        return {
          success: false,
          confirmationMessage:
            '¿Qué quieres cambiar? Puedes configurar tus servicios, precios, horarios o respuesta automática.',
        };
    }

    await this.prisma.workspaceProfile.update({
      where: { providerId },
      data: {
        services: services as unknown as Prisma.InputJsonValue,
        schedule: schedule as unknown as Prisma.InputJsonValue,
        autoReply: autoReply as unknown as Prisma.InputJsonValue,
      },
    });

    await this.invalidateCache(providerId);

    this.logger.log(
      `Workspace updated for provider ${providerId}: action=${config.action}`,
    );

    return { success: true, confirmationMessage };
  }

  async getWorkspaceSummary(providerId: string): Promise<string> {
    const ctx = await this.getWorkspaceContext(providerId);
    const lines: string[] = ['*Tu perfil de trabajo:*\n'];

    if (ctx.services.length > 0) {
      lines.push('*Servicios:*');
      ctx.services.forEach((s) =>
        lines.push(`  • ${s.name}: $${s.price} por ${s.unit}`),
      );
    } else {
      lines.push('*Servicios:* No has configurado ninguno');
    }

    if (ctx.schedule.days?.length) {
      lines.push(
        `\n*Horario:* ${ctx.schedule.days.join(', ')}, ${ctx.schedule.timeStart} - ${ctx.schedule.timeEnd}`,
      );
    } else {
      lines.push('\n*Horario:* No configurado');
    }

    if (ctx.autoReply.enabled) {
      lines.push(`\n*Respuesta automática:* "${ctx.autoReply.message}"`);
    }

    if (ctx.notes) {
      lines.push(`\n*Notas:* ${ctx.notes}`);
    }

    lines.push(
      '\nPara cambiar algo, solo dímelo. Ejemplo: _"cobro 900 de plomería"_ o _"ya no trabajo los domingos"_.',
    );

    return lines.join('\n');
  }

  private async invalidateCache(providerId: string): Promise<void> {
    await this.redis.del(`${CACHE_PREFIX}${providerId}`);
  }
}
