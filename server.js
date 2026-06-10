import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  SimplySendTransactionalClient,
  SimplySendMarketingClient,
  SimplySendHttpError,
  SimplySendValidationError
} from 'simplysend';

// Helper to determine directories in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple manual .env parser to keep dependencies minimal
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split(/\r?\n/).forEach((line) => {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) return;
    const index = trimmedLine.indexOf('=');
    if (index > 0) {
      const key = trimmedLine.substring(0, index).trim();
      const val = trimmedLine.substring(index + 1).trim();
      // Remove optional surrounding quotes
      const cleanVal = val.replace(/^["']|["']$/g, '');
      process.env[key] = cleanVal;
    }
  });
  console.log('Loaded configurations from local .env file.');
}

const app = express();

// Secure body parser (limit request sizes to 50kb to prevent denial of service payloads)
app.use(express.json({ limit: '50kb' }));

// Custom middleware to inject secure HTTP response headers
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com https://simplysend.email; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https://simplysend.email; script-src 'self' 'unsafe-inline'; frame-ancestors 'none';"
  );
  next();
});

// Basic, zero-dependency in-memory rate-limiter (max 30 requests per minute per IP)
const ipRequestLog = new Map();
app.use('/api/', (req, res, next) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const now = Date.now();
  const limit = 30;
  const windowMs = 60000;

  if (!ipRequestLog.has(ip)) {
    ipRequestLog.set(ip, []);
  }

  // Filter out timestamps outside the active window
  const timestamps = ipRequestLog.get(ip).filter((time) => now - time < windowMs);
  timestamps.push(now);
  ipRequestLog.set(ip, timestamps);

  if (timestamps.length > limit) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  next();
});

// Simple helper to validate email formats safely
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(email) {
  return typeof email === 'string' && EMAIL_REGEX.test(email);
}

// Serve static assets from public folder
app.use(express.static(path.join(__dirname, 'public')));

/**
 * Endpoint to send Transactional Emails (tapi)
 */
app.post('/api/send/transactional', async (req, res) => {
  const { from, to, subject, html, text, replyTo, enableClickTracking } = req.body;

  const resolvedAccountId = process.env.SIMPLYSEND_ACCOUNT_ID;
  const resolvedTapi = process.env.SIMPLYSEND_TAPI_KEY;

  if (!resolvedAccountId) {
    return res.status(500).json({ error: 'Server configuration error: SIMPLYSEND_ACCOUNT_ID environment variable is missing.' });
  }
  if (!resolvedTapi) {
    return res.status(500).json({ error: 'Server configuration error: SIMPLYSEND_TAPI_KEY environment variable is missing.' });
  }
  if (!from || !isValidEmail(from)) {
    return res.status(400).json({ error: 'Invalid sender (from) email address.' });
  }
  if (!to || !isValidEmail(to)) {
    return res.status(400).json({ error: 'Invalid recipient (to) email address.' });
  }

  try {
    const client = new SimplySendTransactionalClient({
      accountId: resolvedAccountId,
      apiKey: resolvedTapi
    });

    const response = await client.email.send({
      from,
      to,
      subject,
      html,
      ...(text && { text }),
      ...(replyTo && { replyTo }),
      ...(enableClickTracking !== undefined && { enableClickTracking })
    });

    return res.status(200).json({ success: true, messageId: response.data?.messageId });
  } catch (error) {
    console.error('Transactional send failed:', error);
    if (error instanceof SimplySendValidationError) {
      return res.status(400).json({ error: `Validation Error (${error.field}): ${error.message}` });
    }
    if (error instanceof SimplySendHttpError) {
      return res.status(error.statusCode).json({
        error: error.message,
        reasonCode: error.reasonCode,
        details: error.data
      });
    }
    return res.status(500).json({ error: error.message || 'Internal server error occurred.' });
  }
});


/**
 * Endpoint to send Marketing Emails (mapi)
 */
app.post('/api/send/marketing', async (req, res) => {
  const { from, to, subject, html, subscriptionGroupId, text, enableClickTracking } = req.body;

  const resolvedAccountId = process.env.SIMPLYSEND_ACCOUNT_ID;
  const resolvedMapi = process.env.SIMPLYSEND_MAPI_KEY;

  if (!resolvedAccountId) {
    return res.status(500).json({ error: 'Server configuration error: SIMPLYSEND_ACCOUNT_ID environment variable is missing.' });
  }
  if (!resolvedMapi) {
    return res.status(500).json({ error: 'Server configuration error: SIMPLYSEND_MAPI_KEY environment variable is missing.' });
  }
  if (!from || !isValidEmail(from)) {
    return res.status(400).json({ error: 'Invalid sender (from) email address.' });
  }
  if (!to || !isValidEmail(to)) {
    return res.status(400).json({ error: 'Invalid recipient (to) email address.' });
  }

  try {
    const client = new SimplySendMarketingClient({
      accountId: resolvedAccountId,
      apiKey: resolvedMapi
    });

    const response = await client.email.send({
      from,
      to,
      subject,
      html,
      subscriptionGroupId,
      ...(text && { text }),
      ...(enableClickTracking !== undefined && { enableClickTracking })
    });

    return res.status(200).json({ success: true, messageId: response.data?.messageId });
  } catch (error) {
    console.error('Marketing send failed:', error);
    if (error instanceof SimplySendValidationError) {
      return res.status(400).json({ error: `Validation Error (${error.field}): ${error.message}` });
    }
    if (error instanceof SimplySendHttpError) {
      return res.status(error.statusCode).json({
        error: error.message,
        reasonCode: error.reasonCode,
        details: error.data
      });
    }
    return res.status(500).json({ error: error.message || 'Internal server error occurred.' });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SimplySend sample app is running on http://localhost:${PORT}`);
});
