import { Injectable, Logger } from '@nestjs/common';
import { Contact, ContactSource } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import {
  normalizeContactPhone,
  formatPhoneForDisplay,
} from '../../common/utils/phone.utils';

export interface SaveContactDto {
  providerId: string;
  name: string;
  phone?: string;
  notes?: string;
  source?: ContactSource;
  timezone?: string;
}

export interface LinkClientDto {
  providerId: string;
  clientName?: string;
  clientPhone?: string;
  source: ContactSource;
  timezone?: string;
}

export interface LinkClientResult {
  contactId?: string;
  clientName?: string;
  clientPhone?: string;
}

export type ClientSendResolution =
  | { status: 'ok'; contact: Contact; phone: string }
  | { status: 'need_phone'; clientName: string; contactId?: string }
  | { status: 'disambiguate'; clientName: string; candidates: Contact[] }
  | { status: 'not_found'; clientName?: string };

@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name);

  constructor(
    private prisma: PrismaService,
    private aiService: AiService,
  ) {}

  async saveContact(dto: SaveContactDto): Promise<Contact> {
    const name = dto.name.trim();
    if (!name) {
      throw new Error('Contact name is required');
    }

    const phone = dto.phone
      ? normalizeContactPhone(dto.phone, dto.timezone)
      : null;

    if (dto.phone && !phone) {
      throw new Error('Invalid phone number');
    }

    if (phone) {
      return this.upsertByPhone(dto.providerId, phone, {
        name,
        notes: dto.notes,
        source: dto.source ?? ContactSource.MANUAL,
      });
    }

    const existing = await this.prisma.contact.findFirst({
      where: {
        providerId: dto.providerId,
        name: { equals: name, mode: 'insensitive' },
        phone: null,
      },
    });

    if (existing) {
      return this.prisma.contact.update({
        where: { id: existing.id },
        data: {
          notes: dto.notes ?? existing.notes,
          lastUsedAt: new Date(),
        },
      });
    }

    return this.prisma.contact.create({
      data: {
        providerId: dto.providerId,
        name,
        notes: dto.notes,
        source: dto.source ?? ContactSource.MANUAL,
        lastUsedAt: new Date(),
      },
    });
  }

  async upsertByPhone(
    providerId: string,
    phone: string,
    opts: { name: string; notes?: string; source: ContactSource },
  ): Promise<Contact> {
    const normalized = normalizeContactPhone(phone) ?? phone;

    const existing = await this.prisma.contact.findUnique({
      where: {
        providerId_phone: { providerId, phone: normalized },
      },
    });

    if (existing) {
      const name =
        existing.name.trim().length >= opts.name.trim().length
          ? existing.name
          : opts.name.trim();

      return this.prisma.contact.update({
        where: { id: existing.id },
        data: {
          name,
          notes: opts.notes ?? existing.notes,
          lastUsedAt: new Date(),
        },
      });
    }

    return this.prisma.contact.create({
      data: {
        providerId,
        name: opts.name.trim(),
        phone: normalized,
        notes: opts.notes,
        source: opts.source,
        lastUsedAt: new Date(),
      },
    });
  }

  async linkFromTransaction(dto: LinkClientDto): Promise<LinkClientResult> {
    const name = dto.clientName?.trim();
    const phone = dto.clientPhone
      ? normalizeContactPhone(dto.clientPhone, dto.timezone)
      : undefined;

    if (phone) {
      const contact = await this.upsertByPhone(dto.providerId, phone, {
        name: name || 'Cliente',
        source: dto.source,
      });
      return {
        contactId: contact.id,
        clientName: contact.name,
        clientPhone: contact.phone ?? phone,
      };
    }

    if (name) {
      return { clientName: name };
    }

    return {};
  }

  async findByName(providerId: string, name: string): Promise<Contact[]> {
    const trimmed = name.trim();
    if (!trimmed) return [];

    return this.prisma.contact.findMany({
      where: {
        providerId,
        name: { contains: trimmed, mode: 'insensitive' },
      },
      orderBy: [{ lastUsedAt: 'desc' }, { updatedAt: 'desc' }],
      take: 10,
    });
  }

  async findById(providerId: string, contactId: string): Promise<Contact | null> {
    return this.prisma.contact.findFirst({
      where: { id: contactId, providerId },
    });
  }

  async listContacts(providerId: string, limit = 20): Promise<Contact[]> {
    return this.prisma.contact.findMany({
      where: { providerId },
      orderBy: [{ lastUsedAt: 'desc' }, { name: 'asc' }],
      take: limit,
    });
  }

  async resolveClientForSend(
    providerId: string,
    opts: {
      clientName?: string;
      clientPhone?: string;
      contactId?: string;
      timezone?: string;
    },
  ): Promise<ClientSendResolution> {
    if (opts.contactId) {
      const contact = await this.findById(providerId, opts.contactId);
      if (contact?.phone) {
        return { status: 'ok', contact, phone: contact.phone };
      }
      if (contact) {
        return {
          status: 'need_phone',
          clientName: contact.name,
          contactId: contact.id,
        };
      }
    }

    const phone = opts.clientPhone
      ? normalizeContactPhone(opts.clientPhone, opts.timezone)
      : undefined;

    if (phone) {
      const contact = await this.prisma.contact.findUnique({
        where: { providerId_phone: { providerId, phone } },
      });
      if (contact) {
        return { status: 'ok', contact, phone: contact.phone! };
      }
      if (opts.clientName) {
        const created = await this.upsertByPhone(providerId, phone, {
          name: opts.clientName,
          source: ContactSource.PAYMENT_LINK,
        });
        return { status: 'ok', contact: created, phone };
      }
    }

    const name = opts.clientName?.trim();
    if (!name) {
      return { status: 'not_found' };
    }

    const matches = await this.findByName(providerId, name);

    if (matches.length === 0) {
      const fromAppointments = await this.findNamesFromAppointments(providerId, name);
      if (fromAppointments.length === 1 && fromAppointments[0].phone) {
        const contact = await this.upsertByPhone(
          providerId,
          fromAppointments[0].phone,
          { name: fromAppointments[0].name, source: ContactSource.APPOINTMENT },
        );
        return { status: 'ok', contact, phone: contact.phone! };
      }
      return { status: 'not_found', clientName: name };
    }

    if (matches.length === 1) {
      const contact = matches[0];
      if (contact.phone) {
        return { status: 'ok', contact, phone: contact.phone };
      }
      return { status: 'need_phone', clientName: contact.name, contactId: contact.id };
    }

    const withPhone = matches.filter((c) => c.phone);
    if (withPhone.length === 1) {
      return { status: 'ok', contact: withPhone[0], phone: withPhone[0].phone! };
    }

    const fuzzy = await this.fuzzyPickContact(name, matches);
    if (fuzzy?.phone) {
      return { status: 'ok', contact: fuzzy, phone: fuzzy.phone };
    }

    return { status: 'disambiguate', clientName: name, candidates: matches.slice(0, 5) };
  }

  async updateContactPhone(
    providerId: string,
    contactId: string,
    rawPhone: string,
    timezone?: string,
  ): Promise<Contact> {
    const phone = normalizeContactPhone(rawPhone, timezone);
    if (!phone) {
      throw new Error('Invalid phone number');
    }

    const contact = await this.findById(providerId, contactId);
    if (!contact) {
      throw new Error('Contact not found');
    }

    const existing = await this.prisma.contact.findUnique({
      where: { providerId_phone: { providerId, phone } },
    });

    if (existing && existing.id !== contactId) {
      throw new Error('PHONE_ALREADY_USED');
    }

    return this.prisma.contact.update({
      where: { id: contactId },
      data: { phone, lastUsedAt: new Date() },
    });
  }

  async touchContact(contactId: string): Promise<void> {
    await this.prisma.contact
      .update({
        where: { id: contactId },
        data: { lastUsedAt: new Date() },
      })
      .catch((err) =>
        this.logger.warn(`touchContact failed for ${contactId}: ${err.message}`),
      );
  }

  formatContactList(contacts: Contact[]): string {
    if (contacts.length === 0) {
      return 'No tienes clientes guardados todavía.';
    }

    return contacts
      .map((c, i) => {
        const phone = c.phone ? formatPhoneForDisplay(c.phone) : 'sin teléfono';
        return `${i + 1}. *${c.name}* — ${phone}`;
      })
      .join('\n');
  }

  formatDisambiguationOptions(candidates: Contact[]): string {
    return candidates
      .map((c, i) => {
        const phone = c.phone ? formatPhoneForDisplay(c.phone) : 'sin teléfono';
        return `${i + 1}. *${c.name}* — ${phone}`;
      })
      .join('\n');
  }

  private async fuzzyPickContact(
    query: string,
    candidates: Contact[],
  ): Promise<Contact | null> {
    if (candidates.length <= 1) return candidates[0] ?? null;

    try {
      const options = candidates.map((c) => c.name);
      const matched = await this.aiService.matchToList(query, options);
      if (!matched) return null;
      return candidates.find((c) => c.name === matched) ?? null;
    } catch {
      return null;
    }
  }

  private async findNamesFromAppointments(
    providerId: string,
    name: string,
  ): Promise<{ name: string; phone: string }[]> {
    const rows = await this.prisma.appointment.findMany({
      where: {
        providerId,
        clientName: { contains: name, mode: 'insensitive' },
        clientPhone: { not: null },
      },
      select: { clientName: true, clientPhone: true },
      orderBy: { scheduledAt: 'desc' },
      take: 5,
    });

    const seen = new Set<string>();
    const out: { name: string; phone: string }[] = [];

    for (const row of rows) {
      if (!row.clientPhone || !row.clientName) continue;
      const phone = normalizeContactPhone(row.clientPhone);
      if (!phone || seen.has(phone)) continue;
      seen.add(phone);
      out.push({ name: row.clientName, phone });
    }

    return out;
  }
}
