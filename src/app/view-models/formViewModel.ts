import { z } from 'zod';

export interface FormErrorSummary {
  message?: string;
  errors: string[];
}

export interface FormFieldInput {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'email' | 'password' | 'search' | 'url';
  value?: string | number;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  helpText?: string;
  autocomplete?: string;
  id?: string;
}

export interface FormSelectOption {
  value: string;
  label: string;
  selected?: boolean;
}

export interface FormSelectInput {
  name: string;
  label: string;
  options: FormSelectOption[];
  value?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  helpText?: string;
  id?: string;
}

export interface FormTextareaInput {
  name: string;
  label: string;
  value?: string;
  rows?: number;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  helpText?: string;
  id?: string;
}

export interface FormViewModel<T = Record<string, string>> {
  values: T;
  fieldErrors: Record<string, string>;
  generalErrors: string[];
  isSubmitted?: boolean;
  isSuccess?: boolean;
  successMessage?: string;
}

/**
 * Format Zod validation errors into field errors and general form errors.
 */
export function formatZodFormErrors<T = Record<string, string>>(
  error: z.ZodError,
  values: T
): FormViewModel<T> {
  const fieldErrors: Record<string, string> = {};
  const generalErrors: string[] = [];

  for (const issue of error.issues) {
    if (issue.path.length > 0) {
      const fieldName = String(issue.path[0]);
      if (!fieldErrors[fieldName]) {
        fieldErrors[fieldName] = issue.message;
      }
    } else {
      generalErrors.push(issue.message);
    }
  }

  return {
    values,
    fieldErrors,
    generalErrors,
    isSubmitted: true,
    isSuccess: false,
  };
}

/**
 * Demo Zod Schema for Listing Drop Form validation.
 */
export const demoListingFormSchema = z.object({
  title: z.string().trim().min(1, 'Album title is required').max(100, 'Title is too long'),
  artist: z.string().trim().min(1, 'Artist name is required').max(100, 'Artist is too long'),
  price: z
    .string()
    .trim()
    .refine((val) => !val || !isNaN(Number(val)), 'Price must be a valid number')
    .refine((val) => !val || Number(val) >= 0, 'Price cannot be negative'),
  mediaCondition: z.enum(['M', 'NM', 'VG+', 'VG', 'VG-', 'G+', 'G', 'F', 'P'], {
    errorMap: () => ({ message: 'Please select a valid media condition' }),
  }),
  description: z.string().trim().max(500, 'Description cannot exceed 500 characters').optional(),
  acceptTerms: z.literal('on', {
    errorMap: () => ({ message: 'You must confirm the listing accuracy' }),
  }),
});

export type DemoListingFormData = z.infer<typeof demoListingFormSchema>;
