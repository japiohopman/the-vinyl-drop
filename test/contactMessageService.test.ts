import { ContactMessageDeliveryError, sendContactMessage } from '../src/app/services/contactMessageService';

describe('contact message delivery service', () => {
  const originalApiKey = process.env.RESEND_API_KEY;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env.RESEND_API_KEY = 're_test_only_key';
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200 } as Response);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalApiKey;
  });

  it('sends plain-text mail to the fixed operator address with the submitter as reply-to', async () => {
    await sendContactMessage({
      name: 'Record fan',
      email: 'sender@example.com',
      message: 'A problem with this record listing.',
      category: 'general',
      contentUrl: '',
      goodFaithConfirmed: false,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = fetchSpy.mock.calls[0][0] as string;
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_test_only_key');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');

    const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(payload.from).toBe('The Vinyl Drop <no-reply@thevinyldrop.nl>');
    expect(payload.to).toEqual(['yepyouknowhim@gmail.com']);
    expect(payload.reply_to).toBe('sender@example.com');
    expect(payload.subject).toBe('The Vinyl Drop — General question or feedback');
    expect(payload.text).toContain('Category: General question or feedback');
    expect(payload.text).toContain('A problem with this record listing.');
    expect(payload).not.toHaveProperty('html');
  });

  it('includes the structured legal-notice details in the mail without storing them', async () => {
    await sendContactMessage({
      name: 'Rights holder',
      email: 'sender@example.com',
      message: 'This listing uses a protected image without permission and identifies the specific work and rights involved.',
      category: 'copyright-trademark',
      contentUrl: 'https://thevinyldrop.nl/listings/123',
      goodFaithConfirmed: true,
    });

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(payload.subject).toContain('Copyright or trademark concern');
    expect(payload.text).toContain('Content URL: https://thevinyldrop.nl/listings/123');
    expect(payload.text).toContain('Good-faith confirmation: confirmed');
  });

  it('fails closed when RESEND_API_KEY is missing without making a request', async () => {
    delete process.env.RESEND_API_KEY;

    await expect(sendContactMessage({
      name: '',
      email: 'sender@example.com',
      message: 'A problem with this record listing.',
      category: 'general',
      contentUrl: '',
      goodFaithConfirmed: false,
    })).rejects.toMatchObject({ reason: 'configuration' });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not expose provider response details when Resend rejects delivery', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'sensitive provider diagnostic' } as Response);

    await expect(sendContactMessage({
      name: '',
      email: 'sender@example.com',
      message: 'A problem with this record listing.',
      category: 'general',
      contentUrl: '',
      goodFaithConfirmed: false,
    })).rejects.toBeInstanceOf(ContactMessageDeliveryError);
  });
});
