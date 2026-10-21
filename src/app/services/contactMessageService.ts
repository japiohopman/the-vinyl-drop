export interface ContactMessageInput {
  name: string;
  email: string;
  message: string;
}

export type ContactDeliveryFailure = 'configuration' | 'delivery';

/**
 * Intentionally does not persist or log contact contents or provider responses.
 * The Resend API key is read directly from the process environment so the
 * application config parser never needs to expose or copy the secret.
 */
export class ContactMessageDeliveryError extends Error {
  constructor(public readonly reason: ContactDeliveryFailure) {
    super('The contact message could not be sent.');
    this.name = 'ContactMessageDeliveryError';
  }
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const SENDER = 'The Vinyl Drop <no-reply@thevinyldrop.nl>';
const RECIPIENT = 'yepyouknowhim@gmail.com';
const REQUEST_TIMEOUT_MS = 8_000;

export async function sendContactMessage(input: ContactMessageInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new ContactMessageDeliveryError('configuration');
  }

  const safeName = input.name.replace(/[\r\n]+/g, ' ').trim() || '(not provided)';
  const text = [
    'New message submitted through The Vinyl Drop contact form.',
    '',
    `Name: ${safeName}`,
    `Reply-to: ${input.email}`,
    '',
    'Message:',
    '--------',
    input.message,
    '',
    'This message was submitted by a website visitor. The application does not retain a support-message history.',
  ].join('\n');

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: SENDER,
        to: [RECIPIENT],
        reply_to: input.email,
        subject: 'The Vinyl Drop — contact form message',
        text,
      }),
      signal: abortController.signal,
    });

    if (!response.ok) {
      // Never read/forward the provider response body; it can contain operational data.
      throw new ContactMessageDeliveryError('delivery');
    }
  } catch (error) {
    if (error instanceof ContactMessageDeliveryError) throw error;
    throw new ContactMessageDeliveryError('delivery');
  } finally {
    clearTimeout(timeout);
  }
}
