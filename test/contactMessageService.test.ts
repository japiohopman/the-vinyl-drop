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
    expect(payload.subject).toBe('The Vinyl Drop — contact form message');
    expect(payload.text).toContain('A problem with this record listing.');
    expect(payload).not.toHaveProperty('html');
  });

  it('fails closed when RESEND_API_KEY is missing without making a request', async () => {
    delete process.env.RESEND_API_KEY;

    await expect(sendContactMessage({
      name: '',
      email: 'sender@example.com',
      message: 'A problem with this record listing.',
    })).rejects.toMatchObject({ reason: 'configuration' });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not expose provider response details when Resend rejects delivery', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'sensitive provider diagnostic' } as Response);

    await expect(sendContactMessage({
      name: '',
      email: 'sender@example.com',
      message: 'A problem with this record listing.',
    })).rejects.toBeInstanceOf(ContactMessageDeliveryError);
  });
});
