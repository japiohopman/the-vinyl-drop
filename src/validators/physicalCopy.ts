import { z } from 'zod';
import { conditionGradeSchema } from './condition';

export const physicalCopySchema = z.object({
  releaseId: z.string().uuid('Invalid release ID'),
  ownerId: z.string().uuid('Invalid owner ID'),
  mediaCondition: conditionGradeSchema,
  sleeveCondition: conditionGradeSchema,
  notes: z.string().trim().max(1000, 'Notes cannot exceed 1000 characters').nullable().optional(),
});

export const createPhysicalCopySchema = physicalCopySchema;

export const updatePhysicalCopySchema = z.object({
  mediaCondition: conditionGradeSchema.optional(),
  sleeveCondition: conditionGradeSchema.optional(),
  notes: z.string().trim().max(1000, 'Notes cannot exceed 1000 characters').nullable().optional(),
});

export type PhysicalCopyInput = z.input<typeof physicalCopySchema>;
export type CreatePhysicalCopyInput = z.input<typeof createPhysicalCopySchema>;
export type UpdatePhysicalCopyInput = z.input<typeof updatePhysicalCopySchema>;
