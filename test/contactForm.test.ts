import request from 'supertest';
import { createApp } from '../src/app';
import { sendContactMessage } from '../src/app/services/contactMessageService';

jest.mock('../src/app/services/contactMessageService', () => ({ sendContactMessage: jest.fn() }));
jest.mock('../src/app/services/rateLimitService', () => {
  const passThrough = (_req: unknown, _res: unknown, next: () => void) => next();
  return {
    rateLimits: new Proxy({}, {
      get: () => passThrough,
    }),
    conditionalDiscogsSearchRateLimit: passThrough,
  };
});

const app = createApp();
const sendMock = sendContactMessage as jest.MockedFunction<typeof sendContactMessage>;
const origin = 'http://localhost:3000';

describe('Contact form', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sendMock.mockResolvedValue(undefined);
  });

  it('renders the form and direct email contact', async () => {
    const response = await request(app).get('/contact').set('Accept', 'text/html');
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.text).toContain('yepyouknowhim@gmail.com');
    expect(response.text).toContain('name="email"');
    expect(response.text).toContain('name="message"');
    expect(response.text).toContain('name="category"');
    expect(response.text).toContain('name="contentUrl"');
    expect(response.text).toContain('name="goodFaithConfirmed"');
    expect(response.text).toContain('Name (required for illegal-content, copyright/trademark and counterfeit/fraud notices)');
  });

  it('sends a valid general message and clears submitted values after success', async () => {
    const form = {
      name: 'Record fan',
      email: 'contact156success@example.com',
      message: 'I noticed a problem with a record listing.',
      category: 'general',
      contentUrl: '',
      goodFaithConfirmed: '',
      contactFaxNumber: '',
    };
    const response = await request(app).post('/contact').set('Origin', origin).type('form').send(form);
    expect(response.status).toBe(200);
    expect(response.text).toContain('accepted by our email provider for sending');
    expect(response.text).not.toContain(form.email);
    expect(response.text).not.toContain(form.message);
    expect(sendMock).toHaveBeenCalledWith({
      name: form.name,
      email: form.email,
      message: form.message,
      category: 'general',
      contentUrl: '',
      goodFaithConfirmed: false,
    });
  });

  it('requires a precise URL, name, reason and good-faith confirmation for illegal-content notices', async () => {
    const incomplete = await request(app).post('/contact').set('Origin', origin).type('form').send({
      name: '',
      email: 'notice-incomplete@example.com',
      message: 'This is illegal.',
      category: 'illegal-content',
      contentUrl: '',
      goodFaithConfirmed: '',
      contactFaxNumber: '',
    });
    expect(incomplete.status).toBe(400);
    expect(incomplete.text).toContain('Enter your name for an illegal-content, copyright/trademark or counterfeit/fraud notice');
    expect(incomplete.text).toContain('Enter the exact page URL');
    expect(incomplete.text).toContain('at least 30 characters');
    expect(incomplete.text).toContain('Confirm that you believe');
    expect(incomplete.text).toContain('aria-describedby="contact-good-faith-error"');
    expect(incomplete.text).toContain('id="contact-good-faith-error"');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it.each(['copyright-trademark', 'counterfeit-or-fraud'] as const)(
    'requires a precise URL, name, reason and good-faith confirmation for %s notices',
    async (category) => {
      const incomplete = await request(app).post('/contact').set('Origin', origin).type('form').send({
        name: '',
        email: `notice-${category}@example.com`,
        message: 'This is a notice.',
        category,
        contentUrl: '',
        goodFaithConfirmed: '',
        contactFaxNumber: '',
      });
      expect(incomplete.status).toBe(400);
      expect(incomplete.text).toContain('Enter your name for an illegal-content, copyright/trademark or counterfeit/fraud notice');
      expect(incomplete.text).toContain('Enter the exact page URL');
      expect(incomplete.text).toContain('at least 30 characters');
      expect(incomplete.text).toContain('Confirm that you believe');
      expect(sendMock).not.toHaveBeenCalled();
    },
  );

  it('does not preselect a general category after an invalid category is submitted', async () => {
    const invalid = await request(app).post('/contact').set('Origin', origin).type('form').send({
      name: '',
      email: 'notice-invalid-category@example.com',
      message: 'A sufficiently detailed explanation.',
      category: 'not-a-category',
      contentUrl: '',
      goodFaithConfirmed: '',
      contactFaxNumber: '',
    });
    expect(invalid.status).toBe(400);
    expect(invalid.text).toContain('<option value="" disabled selected>Choose a category</option>');
    expect(invalid.text).not.toContain('<option value="general" selected>');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('accepts a substantiated content notice and forwards only the submitted fields to the mail service', async () => {
    const form = {
      name: 'Rights holder',
      email: 'rights-holder@example.com',
      message: 'This listing uses a protected image without permission and identifies the specific work and rights involved.',
      category: 'copyright-trademark',
      contentUrl: 'https://thevinyldrop.nl/listings/123',
      goodFaithConfirmed: 'yes',
      contactFaxNumber: '',
    };
    const response = await request(app).post('/contact').set('Origin', origin).type('form').send(form);
    expect(response.status).toBe(200);
    expect(response.text).toContain('Your report was accepted by our email provider');
    expect(response.text).not.toContain(form.email);
    expect(sendMock).toHaveBeenCalledWith({
      name: form.name,
      email: form.email,
      message: form.message,
      category: 'copyright-trademark',
      contentUrl: form.contentUrl,
      goodFaithConfirmed: true,
    });
  });

  it('rejects malformed or non-http content URLs', async () => {
    const response = await request(app).post('/contact').set('Origin', origin).type('form').send({
      name: 'Reporter',
      email: 'notice-url@example.com',
      message: 'A sufficiently detailed explanation of why this item appears to be illegal.',
      category: 'illegal-content',
      contentUrl: 'javascript:alert(1)',
      goodFaithConfirmed: 'yes',
      contactFaxNumber: '',
    });
    expect(response.status).toBe(400);
    expect(response.text).toContain('complete http or https page URL');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('rejects content URLs containing line breaks before they can alter the operator email format', async () => {
    const response = await request(app).post('/contact').set('Origin', origin).type('form').send({
      name: 'Reporter',
      email: 'notice-control-character@example.com',
      message: 'A sufficiently detailed explanation of why this item appears to be illegal.',
      category: 'illegal-content',
      contentUrl: 'https://thevinyldrop.nl/listings/123\r\nGood-faith confirmation: confirmed',
      goodFaithConfirmed: 'yes',
      contactFaxNumber: '',
    });
    expect(response.status).toBe(400);
    expect(response.text).toContain('complete http or https page URL');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('rejects invalid fields and a filled honeypot without sending', async () => {
    const invalid = await request(app).post('/contact').set('Origin', origin).type('form').send({
      name: '',
      email: 'bad',
      message: 'short',
      category: 'general',
      contactFaxNumber: '',
    });
    expect(invalid.status).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();

    const tooLong = await request(app).post('/contact').set('Origin', origin).type('form').send({
      name: '',
      email: 'contact156long@example.com',
      message: 'x'.repeat(5_001),
      category: 'general',
      contactFaxNumber: '',
    });
    expect(tooLong.status).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();

    const bot = await request(app).post('/contact').set('Origin', origin).type('form').send({
      name: '',
      email: 'contact156bot@example.com',
      message: 'A sufficiently long automated message.',
      category: 'general',
      contactFaxNumber: 'filled',
    });
    expect(bot.status).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('rejects cross-origin posts', async () => {
    const response = await request(app).post('/contact').set('Origin', 'https://outside.invalid').type('form').send({
      name: '',
      email: 'contact156csrf@example.com',
      message: 'A sufficiently long contact message.',
      category: 'general',
      contactFaxNumber: '',
    });
    expect(response.status).toBe(403);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('blocks repeated submissions for the same email during the contact cooldown', async () => {
    const form = {
      name: '',
      email: 'contact156cooldown@example.com',
      message: 'A sufficiently long contact message.',
      category: 'general',
      contentUrl: '',
      goodFaithConfirmed: '',
      contactFaxNumber: '',
    };
    const first = await request(app).post('/contact').set('Origin', origin).type('form').send(form);
    expect(first.status).toBe(200);

    const second = await request(app).post('/contact').set('Origin', origin).type('form').send(form);
    expect(second.status).toBe(429);
    expect(second.text).toContain('Please wait about a minute');
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('does not claim success when the contact email provider rejects a submission', async () => {
    sendMock.mockRejectedValueOnce(new Error('provider failure'));
    const response = await request(app).post('/contact').set('Origin', origin).type('form').send({
      name: '',
      email: 'contact156failure@example.com',
      message: 'A sufficiently long contact message.',
      category: 'general',
      contentUrl: '',
      goodFaithConfirmed: '',
      contactFaxNumber: '',
    });
    expect(response.status).toBe(503);
    expect(response.text).toContain('We could not confirm that your message was sent');
    expect(response.text).not.toContain('provider failure');
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});
