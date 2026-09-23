const enabled = () => ['true', '1', 'yes'].includes((process.env.TEXTWARE_SMS_ENABLED || '').toLowerCase());

export const normalizeSriLankanNumber = value => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 10) return `94${digits.slice(1)}`;
  return digits;
};

// Textware's HTTP gateway accepts form-style query parameters. SMS failures are
// returned to the caller so the notification service can log them without
// interrupting the transfer workflow.
export const sendTextwareSms = async ({ mobileNumber, message }) => {
  if (!enabled()) return { skipped: true, reason: 'SMS is disabled' };
  if (!process.env.TEXTWARE_SMS_URL || !process.env.TEXTWARE_SMS_USERNAME || !process.env.TEXTWARE_SMS_PASSWORD || !process.env.TEXTWARE_SMS_SENDER_ID) {
    return { skipped: true, reason: 'Textware SMS configuration is incomplete' };
  }
  const phone = normalizeSriLankanNumber(mobileNumber);
  if (phone.length < 9) return { skipped: true, reason: 'No valid mobile number' };

  const url = new URL(process.env.TEXTWARE_SMS_URL);
  url.search = new URLSearchParams({
    username: process.env.TEXTWARE_SMS_USERNAME,
    password: process.env.TEXTWARE_SMS_PASSWORD,
    src: process.env.TEXTWARE_SMS_SENDER_ID,
    dst: phone,
    msg: message
  }).toString();
  const response = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(10000) });
  const body = (await response.text()).trim();
  if (!response.ok) throw new Error(`Textware returned HTTP ${response.status}: ${body.slice(0, 200)}`);
  return { skipped: false, body };
};
