import { EncryptionService } from './encryption.service';

/**
 * PII field definitions per model.
 * Used by services to encrypt/decrypt explicitly when reading/writing PII data.
 */
export const PII_FIELDS: Record<string, string[]> = {
  User: ['phone', 'email'],
  ProviderApplication: ['phone'],
  EmergencyContact: ['phone'],
};

export const PHOTO_URL_FIELDS: Record<string, string[]> = {
  ProviderApplication: ['inePhotoFront', 'inePhotoBack', 'selfiePhoto'],
  ServicePhoto: ['url'],
};

export function encryptPiiFields<T extends Record<string, any>>(
  data: T,
  model: string,
  encryption: EncryptionService,
): T {
  if (!encryption.isEnabled()) return data;

  const fields = [...(PII_FIELDS[model] || []), ...(PHOTO_URL_FIELDS[model] || [])];
  const result = { ...data };

  for (const field of fields) {
    if (result[field] && typeof result[field] === 'string') {
      (result as any)[field] = encryption.encrypt(result[field]);
    }
  }

  return result;
}

export function decryptPiiFields<T extends Record<string, any>>(
  data: T,
  model: string,
  encryption: EncryptionService,
): T {
  if (!encryption.isEnabled() || !data) return data;

  const fields = [...(PII_FIELDS[model] || []), ...(PHOTO_URL_FIELDS[model] || [])];
  const result = { ...data };

  for (const field of fields) {
    if (result[field] && typeof result[field] === 'string') {
      (result as any)[field] = encryption.decrypt(result[field]);
    }
  }

  return result;
}

export function decryptPiiArray<T extends Record<string, any>>(
  data: T[],
  model: string,
  encryption: EncryptionService,
): T[] {
  if (!encryption.isEnabled()) return data;
  return data.map((item) => decryptPiiFields(item, model, encryption));
}
