import { z } from 'zod';
import { ListingPhotoEditorState } from '../domain/listingPhotoEditor';

const cornerSchema = z.object({
  x: z.number().finite().nonnegative(),
  y: z.number().finite().nonnegative(),
}).strict();

const adjustmentsSchema = z.object({
  exposure: z.number().min(-2).max(2),
  blackPoint: z.number().min(0).max(80),
  shadows: z.number().min(-100).max(100),
  contrast: z.number().min(-100).max(100),
  highlights: z.number().min(-100).max(100),
  whitePoint: z.number().min(160).max(255),
  gamma: z.number().min(0.5).max(2),
  temperature: z.number().min(-100).max(100),
  tint: z.number().min(-100).max(100),
  saturation: z.number().min(-100).max(100),
}).strict();

export const listingPhotoEditorStateSchema = z.object({
  version: z.literal(1),
  sourceWidth: z.number().int().min(2).max(2048),
  sourceHeight: z.number().int().min(2).max(2048),
  corners: z.tuple([cornerSchema, cornerSchema, cornerSchema, cornerSchema]),
  adjustments: adjustmentsSchema,
}).strict().superRefine((state, context) => {
  const { corners, sourceWidth, sourceHeight } = state;

  corners.forEach((corner, index) => {
    if (corner.x > sourceWidth || corner.y > sourceHeight) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['corners', index],
        message: 'Editor corners must remain inside the original photo.',
      });
    }
  });

  let direction = 0;
  let twiceArea = 0;
  for (let index = 0; index < corners.length; index += 1) {
    const current = corners[index];
    const next = corners[(index + 1) % corners.length];
    const afterNext = corners[(index + 2) % corners.length];
    const cross = (next.x - current.x) * (afterNext.y - next.y) -
      (next.y - current.y) * (afterNext.x - next.x);
    if (Math.abs(cross) < 0.01) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['corners'],
        message: 'Editor corners must form a complete quadrilateral.',
      });
      break;
    }
    const nextDirection = Math.sign(cross);
    if (direction !== 0 && nextDirection !== direction) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['corners'],
        message: 'Editor corners must remain in perimeter order.',
      });
      break;
    }
    direction = nextDirection;
    twiceArea += current.x * next.y - next.x * current.y;
  }

  if (Math.abs(twiceArea) < sourceWidth * sourceHeight * 0.02) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['corners'],
      message: 'Editor selection is too small to save.',
    });
  }
});

export type ValidatedListingPhotoEditorState = z.infer<typeof listingPhotoEditorStateSchema>;

export function parseListingPhotoEditorState(value: unknown): ListingPhotoEditorState | null {
  const parsed = listingPhotoEditorStateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
