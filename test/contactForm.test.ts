import request from 'supertest';
import { createApp } from '../src/app';
import { sendContactMessage } from '../src/app/services/contactMessageService';

jest.mock('../src/app/services/contactMessageService', () => ({ sendContactMessage: jest.fn() }));

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
  });

  it('sends a valid message and clears submitted values after success', async () => {
    const form = { name: 'Record fan', email: 'contact156success@example.com', message: 'I noticed a problem with a record listing.', contactFaxNumber: '' };
    const response = await request(app).post('/contact').set('Origin', origin).type('form').send(form);
    expect(response.status).toBe(200);
    expect(response.text).toContain('accepted by our email provider for sending');
    expect(response.text).not.toContain(form.email);
    expect(response.text).not.toContain(form.message);
    expect(sendMock).toHaveBeenCalledWith({ name: form.name, email: form.email, message: form.message });
  });

  it('rejects invalid fields and a filled honeypot without sending', async () => {
    const invalid = await request(app).post('/contact').set('Origin', origin).type('form').send({ name: '', email: 'bad', message: 'short', contactFaxNumber: '' });
    expect(invalid.status).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();

    const bot = await request(app).post('/contact').set('Origin', origin).type('form').send({ name: '', email: 'contact156bot@example.com', message: 'A sufficiently long automated message.', contactFaxNumber: 'filled' });
    expect(bot.status).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('rejects cross-origin posts', async () => {
    const response = await request(app).post('/contact').set('Origin', 'https://outside.invalid').type('form').send({ name: '', email: 'contact156csrf@example.com', message: 'A sufficiently long contact message.', contactFaxNumber: '' });
    expect(response.status).toBe(403);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('rate limits repeated submissions for the same email and does not claim false success on failure', async () => {
    const form = { name: '', email: 'contact156cooldown@example.com', message: 'A sufficiently long contact message.', contactFaxNumber: '' };
    const first = await request(app).post('/contact').set('Origin', origin).type('form').send(form);
    expect(first.status).toBe(200);
    const second = await request(app).post('/contact').set('Origin', origin).type('form').send(form);
    expect(second.status).toBe(429);
    expect(sendMock).toHaveBeenCalledTimes(1);

    sendMock.mockRejectedValueOnce(new Error('provider failure'));
    const failure = await request(app).post('/contact').set('Origin', origin).type('form').send({ ...form, email: 'contact156failure@example.com' });
    expect(failure.status).toBe(503);
    expect(failure.text).toContain('We could not confirm that your message was sent');
    expect(failure.text).not.toContain('provider failure');
  });
});
