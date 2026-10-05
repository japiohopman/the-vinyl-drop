import { z } from 'zod';

export const createCommentSchema = z.object({
  content: z
    .string({ required_error: 'Comment text is required' })
    .trim()
    .min(1, 'Comment cannot be empty')
    .max(1000, 'Comment must be 1000 characters or less'),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;
