export const TERMS_VERSION = 'beta-terms-2026-10-19-v2';

export interface RegistrationConsentRecord {
  termsVersion: string;
  termsAcceptedAt: string;
  ageAttestedAt: string;
}

export function createRegistrationConsentRecord(now = new Date()): RegistrationConsentRecord {
  const acceptedAt = now.toISOString();
  return {
    termsVersion: TERMS_VERSION,
    termsAcceptedAt: acceptedAt,
    ageAttestedAt: acceptedAt,
  };
}
