import { z } from 'zod';
import { conditionGradeSchema } from './condition';
import { SPECIAL_PRESSING_CHARACTERISTICS } from '../db/schema/enums';

const specialPressingCharacteristicsSchema = z.preprocess(
  (value) => Array.isArray(value) ? value : typeof value === 'string' && value.trim() ? [value] : [],
  z.array(z.enum(SPECIAL_PRESSING_CHARACTERISTICS))
    .max(SPECIAL_PRESSING_CHARACTERISTICS.length)
    .refine((values) => new Set(values).size === values.length, 'Choose each Special Pressing characteristic only once.')
);

export const physicalCopySchema = z.object({
  releaseId: z.string().uuid('Invalid release ID'),
  ownerId: z.string().uuid('Invalid owner ID'),
  mediaCondition: conditionGradeSchema,
  sleeveCondition: conditionGradeSchema,
  notes: z.string().trim().max(1000, 'Notes cannot exceed 1000 characters').nullable().optional(),
  specialPressing: z.boolean().default(false),
  specialPressingCharacteristics: specialPressingCharacteristicsSchema.default([]),
  specialPressingDetails: z.string().trim().max(1000, 'Special Pressing details cannot exceed 1000 characters').nullable().optional(),
}).superRefine((data, context) => {
  if (data.specialPressing && data.specialPressingCharacteristics.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['specialPressingCharacteristics'], message: 'Choose at least one Special Pressing characteristic.' });
  }
  if (!data.specialPressing && (data.specialPressingCharacteristics.length > 0 || Boolean(data.specialPressingDetails?.trim()))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['specialPressing'], message: 'Special Pressing details require Special Pressing to be selected.' });
  }
});

export const createPhysicalCopySchema = physicalCopySchema;

export const updatePhysicalCopySchema = z.object({
  mediaCondition: conditionGradeSchema.optional(),
  sleeveCondition: conditionGradeSchema.optional(),
  notes: z.string().trim().max(1000, 'Notes cannot exceed 1000 characters').nullable().optional(),
  specialPressing: z.boolean().optional(),
  specialPressingCharacteristics: specialPressingCharacteristicsSchema.optional(),
  specialPressingDetails: z.string().trim().max(1000, 'Special Pressing details cannot exceed 1000 characters').nullable().optional(),
}).superRefine((data, context) => {
  const includesSpecialPressing = data.specialPressing !== undefined ||
    data.specialPressingCharacteristics !== undefined || data.specialPressingDetails !== undefined;
  if (!includesSpecialPressing) return;
  const selected = data.specialPressingCharacteristics || [];
  if (data.specialPressing === true && selected.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['specialPressingCharacteristics'], message: 'Choose at least one Special Pressing characteristic.' });
  }
  if (data.specialPressing === false && (selected.length > 0 || Boolean(data.specialPressingDetails?.trim()))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['specialPressing'], message: 'Special Pressing details require Special Pressing to be selected.' });
  }
});

export type PhysicalCopyInput = z.input<typeof physicalCopySchema>;
export type CreatePhysicalCopyInput = z.input<typeof createPhysicalCopySchema>;
export type UpdatePhysicalCopyInput = z.input<typeof updatePhysicalCopySchema>;
