import { z } from 'zod';

const emailSchema = z
  .string({ error: 'email is required' })
  .trim()
  .toLowerCase()
  .pipe(z.email('email must be a valid email address').max(255, 'email is too long'));

export const registerSchema = z.object({
  // The assignment specifies registration "with email and password", so name is optional.
  // When omitted, the service derives a display name from the email's local part.
  name: z
    .string({ error: 'name must be a string' })
    .trim()
    .min(2, 'name must be at least 2 characters')
    .max(100, 'name must be at most 100 characters')
    .optional(),
  email: emailSchema,
  password: z
    .string({ error: 'password is required' })
    .min(8, 'password must be at least 8 characters')
    // bcrypt only uses the first 72 bytes; reject longer input instead of truncating silently.
    .refine((v) => Buffer.byteLength(v, 'utf8') <= 72, 'password must be at most 72 bytes')
    .refine(
      (v) => /[A-Za-z]/.test(v) && /\d/.test(v),
      'password must contain at least one letter and one number',
    ),
  // NOTE: any "role" field sent by the client is stripped - public sign-ups are always STAFF.
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string({ error: 'password is required' }).min(1, 'password is required').max(1024),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
