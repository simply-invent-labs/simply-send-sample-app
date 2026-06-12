import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

/**
 * Computes the secure MD5 contactIdentifier format required by SimplySend SDK: channel:md5(normalizedValue)
 */
function getContactIdentifier(input) {
  if (typeof input !== 'string') return '';
  const val = input.trim();
  if (val.startsWith('email_') || val.startsWith('phone_')) {
    return val; // already a secure identifier
  }
  if (val.includes('@')) {
    const hashed = crypto.createHash('md5').update(val.toLowerCase()).digest('hex');
    return `email_${hashed}`;
  }
  // assume phone
  const cleanPhone = val.replace(/[\s().-]/g, '');
  const hashed = crypto.createHash('md5').update(cleanPhone).digest('hex');
  return `phone_${hashed}`;
}

import {
  SimplySendTransactionalClient,
  SimplySendMarketingClient,
  SimplySendWebSetupClient,
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
  const limit = 60; // Increased to 60 for local testing and developer ease
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
 * Helper to instantiate SimplySendWebSetupClient using env credentials
 */
function getWebSetupClient() {
  const resolvedAccountId = process.env.SIMPLYSEND_ACCOUNT_ID;
  const resolvedWapi = process.env.SIMPLYSEND_WAPI_KEY;
  const resolvedWapiUrl = process.env.SIMPLYSEND_WAPI_URL;

  if (!resolvedAccountId) {
    throw new Error('Server configuration error: SIMPLYSEND_ACCOUNT_ID environment variable is missing.');
  }
  if (!resolvedWapi) {
    throw new Error('Server configuration error: SIMPLYSEND_WAPI_KEY environment variable is missing.');
  }

  return new SimplySendWebSetupClient({
    accountId: resolvedAccountId,
    apiKey: resolvedWapi,
    ...(resolvedWapiUrl && { baseUrl: resolvedWapiUrl })
  });
}

/**
 * Endpoints for Contacts Directory
 */
  app.get('/api/contacts', async (req, res) => {
  try {
    const client = getWebSetupClient();
    const { limit, search, status, lastKey } = req.query;
    const response = await client.contacts.listContacts({
      ...(limit && { limit: parseInt(limit) }),
      ...(search && { search }),
      ...(status && { status }),
      ...(lastKey && { lastKey })
    });
    return res.status(200).json(response);
  } catch (error) {
    console.error('List contacts failed:', error);
    if (error instanceof SimplySendValidationError) {
      return res.status(400).json({ error: `Validation Error (${error.field}): ${error.message}` });
    }
    if (error instanceof SimplySendHttpError) {
      return res.status(error.statusCode).json({ error: error.message, reasonCode: error.reasonCode, details: error.data });
    }
    return res.status(500).json({ error: error.message || 'Internal server error.' });
  }
});

app.get('/api/contacts/:email', async (req, res) => {
  try {
    const client = getWebSetupClient();
    const { email } = req.params;
    const contactIdentifier = getContactIdentifier(email);
    const response = await client.contacts.getContact(contactIdentifier);
    return res.status(200).json(response);
  } catch (error) {
    console.error('Get contact failed:', error);
    if (error instanceof SimplySendValidationError) {
      return res.status(400).json({ error: `Validation Error (${error.field}): ${error.message}` });
    }
    if (error instanceof SimplySendHttpError) {
      return res.status(error.statusCode).json({ error: error.message, reasonCode: error.reasonCode, details: error.data });
    }
    return res.status(500).json({ error: error.message || 'Internal server error.' });
  }
});

app.post('/api/contacts', async (req, res) => {
  try {
    const client = getWebSetupClient();
    const { email, firstName, lastName, phone, globalStatus, consentMethod, consentProof, metadata } = req.body;
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid or missing email address.' });
    }
    const contactIdentifier = getContactIdentifier(email);
    const response = await client.contacts.updateContact(contactIdentifier, {
      email,
      ...(firstName !== undefined && { firstName }),
      ...(lastName !== undefined && { lastName }),
      ...(phone !== undefined && { phone }),
      ...(globalStatus !== undefined && { globalStatus }),
      ...(consentMethod !== undefined && { consentMethod }),
      ...(consentProof !== undefined && { consentProof }),
      ...(metadata !== undefined && { metadata })
    });
    return res.status(200).json(response);
  } catch (error) {
    console.error('Create/Update contact failed:', error);
    if (error instanceof SimplySendValidationError) {
      return res.status(400).json({ error: `Validation Error (${error.field}): ${error.message}` });
    }
    if (error instanceof SimplySendHttpError) {
      return res.status(error.statusCode).json({ error: error.message, reasonCode: error.reasonCode, details: error.data });
    }
    return res.status(500).json({ error: error.message || 'Internal server error.' });
  }
});

app.delete('/api/contacts/:email', async (req, res) => {
  try {
    const client = getWebSetupClient();
    const { email } = req.params;
    const contactIdentifier = getContactIdentifier(email);
    const response = await client.contacts.deleteContact(contactIdentifier);
    return res.status(200).json(response);
  } catch (error) {
    console.error('Delete contact failed:', error);
    if (error instanceof SimplySendValidationError) {
      return res.status(400).json({ error: `Validation Error (${error.field}): ${error.message}` });
    }
    if (error instanceof SimplySendHttpError) {
      return res.status(error.statusCode).json({ error: error.message, reasonCode: error.reasonCode, details: error.data });
    }
    return res.status(500).json({ error: error.message || 'Internal server error.' });
  }
});

/**
 * Endpoints for Subscription Groups (lists)
 */
app.get('/api/groups', async (req, res) => {
  try {
    const client = getWebSetupClient();
    const response = await client.contacts.listSubscriberGroups();
    return res.status(200).json(response);
  } catch (error) {
    console.error('List subscription groups failed:', error);
    if (error instanceof SimplySendHttpError) {
      return res.status(error.statusCode).json({ error: error.message, reasonCode: error.reasonCode, details: error.data });
    }
    return res.status(500).json({ error: error.message || 'Internal server error.' });
  }
});

app.post('/api/groups', async (req, res) => {
  try {
    const client = getWebSetupClient();
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Subscription Group Name (name) is required.' });
    }
    const response = await client.contacts.createSubscriberGroup({ name, description });
    return res.status(201).json(response);
  } catch (error) {
    console.error('Create subscription group failed:', error);
    if (error instanceof SimplySendValidationError) {
      return res.status(400).json({ error: `Validation Error (${error.field}): ${error.message}` });
    }
    if (error instanceof SimplySendHttpError) {
      return res.status(error.statusCode).json({ error: error.message, reasonCode: error.reasonCode, details: error.data });
    }
    return res.status(500).json({ error: error.message || 'Internal server error.' });
  }
});

/**
 * Endpoints for Subscribers (Group Memberships)
 */
app.get('/api/groups/:groupId/subscribers', async (req, res) => {
  try {
    const client = getWebSetupClient();
    const { groupId } = req.params;
    const { limit, search, isActive, lastKey } = req.query;
    const response = await client.contacts.listSubscribers(groupId, {
      ...(limit && { limit: parseInt(limit) }),
      ...(search && { search }),
      ...(isActive !== undefined && { isActive }),
      ...(lastKey && { lastKey })
    });
    return res.status(200).json(response);
  } catch (error) {
    console.error('List subscribers failed:', error);
    if (error instanceof SimplySendValidationError) {
      return res.status(400).json({ error: `Validation Error (${error.field}): ${error.message}` });
    }
    if (error instanceof SimplySendHttpError) {
      return res.status(error.statusCode).json({ error: error.message, reasonCode: error.reasonCode, details: error.data });
    }
    return res.status(500).json({ error: error.message || 'Internal server error.' });
  }
});

app.post('/api/groups/:groupId/subscribers', async (req, res) => {
  try {
    const client = getWebSetupClient();
    const { groupId } = req.params;
    const { email, isActive, consentMethod, consentProof } = req.body;
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid or missing email address.' });
    }
    const contactIdentifier = getContactIdentifier(email);
    const response = await client.contacts.addSubscriber(groupId, contactIdentifier, {
      email,
      isActive: isActive !== false,
      ...(consentMethod && { consentMethod }),
      ...(consentProof && { consentProof })
    });
    return res.status(201).json(response);
  } catch (error) {
    console.error('Add subscriber failed:', error);
    if (error instanceof SimplySendValidationError) {
      return res.status(400).json({ error: `Validation Error (${error.field}): ${error.message}` });
    }
    if (error instanceof SimplySendHttpError) {
      return res.status(error.statusCode).json({ error: error.message, reasonCode: error.reasonCode, details: error.data });
    }
    return res.status(500).json({ error: error.message || 'Internal server error.' });
  }
});

app.delete('/api/groups/:groupId/subscribers/:email', async (req, res) => {
  try {
    const client = getWebSetupClient();
    const { groupId, email } = req.params;
    const contactIdentifier = getContactIdentifier(email);
    const response = await client.contacts.deleteSubscriber(groupId, contactIdentifier);
    return res.status(200).json(response);
  } catch (error) {
    console.error('Delete subscriber failed:', error);
    if (error instanceof SimplySendValidationError) {
      return res.status(400).json({ error: `Validation Error (${error.field}): ${error.message}` });
    }
    if (error instanceof SimplySendHttpError) {
      return res.status(error.statusCode).json({ error: error.message, reasonCode: error.reasonCode, details: error.data });
    }
    return res.status(500).json({ error: error.message || 'Internal server error.' });
  }
});

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
    const resolvedTapiUrl = process.env.SIMPLYSEND_TAPI_URL;
    const client = new SimplySendTransactionalClient({
      accountId: resolvedAccountId,
      apiKey: resolvedTapi,
      ...(resolvedTapiUrl && { baseUrl: resolvedTapiUrl })
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
    const resolvedMapiUrl = process.env.SIMPLYSEND_MAPI_URL;
    const client = new SimplySendMarketingClient({
      accountId: resolvedAccountId,
      apiKey: resolvedMapi,
      ...(resolvedMapiUrl && { baseUrl: resolvedMapiUrl })
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
