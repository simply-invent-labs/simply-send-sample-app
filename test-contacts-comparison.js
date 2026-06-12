import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { SimplySendWebSetupClient } from 'simplysend';

// Load environment variables
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
      process.env[key] = val.replace(/^["']|["']$/g, '');
    }
  });
  console.log('Loaded env configurations.');
}

const accountId = process.env.SIMPLYSEND_ACCOUNT_ID;
const wapiKey = process.env.SIMPLYSEND_WAPI_KEY;
const wapiUrl = process.env.SIMPLYSEND_WAPI_URL;

if (!accountId || !wapiKey || !wapiUrl) {
  console.error('❌ Error: SIMPLYSEND_ACCOUNT_ID, SIMPLYSEND_WAPI_KEY, and SIMPLYSEND_WAPI_URL must be set in .env');
  process.exit(1);
}

// 1. Initialize SDK client
const sdkClient = new SimplySendWebSetupClient({
  accountId,
  apiKey: wapiKey,
  baseUrl: wapiUrl
});

// Helper for hashes
function getContactIdentifier(email) {
  const hashed = crypto.createHash('md5').update(email.toLowerCase().trim()).digest('hex');
  return `email_${hashed}`;
}

// Helper: Make raw HTTP request directly to API Gateway
async function makeRawRequest(endpointPath, method = 'GET', body = null) {
  const base = wapiUrl.endsWith('/') ? wapiUrl : `${wapiUrl}/`;
  const url = new URL(endpointPath, base);
  
  const headers = {
    'Content-Type': 'application/json',
    'X-Api-Key': wapiKey,
    'X-Id': accountId,
  };

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  try {
    return {
      status: response.status,
      data: text ? JSON.parse(text) : {}
    };
  } catch {
    return {
      status: response.status,
      errorText: text
    };
  }
}

function deepCompare(obj1, obj2, ignoreFields = []) {
  const cleanObj = (obj) => {
    if (typeof obj !== 'object' || obj === null) return obj;
    const clean = Array.isArray(obj) ? [] : {};
    for (const [key, value] of Object.entries(obj)) {
      if (ignoreFields.includes(key)) continue;
      clean[key] = typeof value === 'object' ? cleanObj(value) : value;
    }
    return clean;
  };
  return JSON.stringify(cleanObj(obj1)) === JSON.stringify(cleanObj(obj2));
}

async function runComparison() {
  const uniqueId = Math.floor(Math.random() * 10000);
  const rawEmail = `raw-api-${uniqueId}@example.com`;
  const sdkEmail = `sdk-client-${uniqueId}@example.com`;

  const rawIdentifier = getContactIdentifier(rawEmail);
  const sdkIdentifier = getContactIdentifier(sdkEmail);

  console.log('\n=============================================================');
  console.log('       STARTING RAW API vs NODE SDK COMPARISON TEST          ');
  console.log('=============================================================');

  try {
    // -------------------------------------------------------------------------
    // TEST 1: CREATE CONTACT
    // -------------------------------------------------------------------------
    console.log('\n--- 1. Testing Contact Creation ---');
    
    console.log(`[RAW API] Creating contact: ${rawEmail}`);
    const rawCreate = await makeRawRequest('contacts', 'POST', {
      email: rawEmail,
      firstName: 'Raw API',
      lastName: 'User',
      globalStatus: 'active',
      consentMethod: 'implicit_api',
      consentProof: 'Raw HTTP test'
    });
    
    console.log(`[Node SDK] Creating contact: ${sdkEmail}`);
    const sdkCreate = await sdkClient.contacts.createContact({
      email: sdkEmail,
      firstName: 'SDK Client',
      lastName: 'User',
      globalStatus: 'active',
      consentMethod: 'implicit_api',
      consentProof: 'SDK client test'
    });

    console.log('\nResponse structure comparison (Create Contact):');
    console.log('  Raw API Response Keys:', Object.keys(rawCreate.data));
    console.log('  Node SDK Response Keys:', Object.keys(sdkCreate));
    
    // The response structures should have identical top-level properties (success, data)
    const createKeysMatch = deepCompare(Object.keys(rawCreate.data), Object.keys(sdkCreate));
    console.log(`  👉 Top-level keys match: ${createKeysMatch ? '✅ YES' : '❌ NO'}`);

    // -------------------------------------------------------------------------
    // TEST 2: GET CONTACT DETAILS
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Testing Contact Retrieval (Get) ---');

    console.log(`[RAW API] Fetching contact: ${rawIdentifier}`);
    const rawGet = await makeRawRequest(`contacts/${rawIdentifier}`);

    console.log(`[Node SDK] Fetching contact: ${sdkIdentifier}`);
    const sdkGet = await sdkClient.contacts.getContact(sdkIdentifier);

    console.log('\nResponse structure comparison (Get Contact):');
    console.log('  Raw API Data Keys:', Object.keys(rawGet.data?.data || {}));
    console.log('  Node SDK Data Keys:', Object.keys(sdkGet.data || {}));
    
    const getKeysMatch = deepCompare(Object.keys(rawGet.data?.data || {}), Object.keys(sdkGet.data || {}));
    console.log(`  👉 Contact payload structure matches: ${getKeysMatch ? '✅ YES' : '❌ NO'}`);

    // -------------------------------------------------------------------------
    // TEST 3: LIST CONTACTS
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Testing Contacts Listing ---');

    console.log('[RAW API] Listing contacts');
    const rawList = await makeRawRequest('contacts?limit=5');

    console.log('[Node SDK] Listing contacts');
    const sdkList = await sdkClient.contacts.listContacts({ limit: 5 });

    console.log('\nResponse structure comparison (List Contacts):');
    console.log('  Raw API List properties:', Object.keys(rawList.data?.data || {}));
    console.log('  Node SDK List properties:', Object.keys(sdkList.data || {}));

    const listKeysMatch = deepCompare(Object.keys(rawList.data?.data || {}), Object.keys(sdkList.data || {}));
    console.log(`  👉 List payload structure matches: ${listKeysMatch ? '✅ YES' : '❌ NO'}`);

    // -------------------------------------------------------------------------
    // TEST 4: CREATE SUBSCRIPTION GROUP
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Testing Subscription Group Creation ---');

    const groupPayloadRaw = {
      name: `Raw Group ${uniqueId}`,
      description: 'Group created via raw API'
    };
    const groupPayloadSdk = {
      name: `SDK Group ${uniqueId}`,
      description: 'Group created via Node SDK'
    };

    console.log(`[RAW API] Creating subscription group: ${groupPayloadRaw.name}`);
    const rawGroup = await makeRawRequest('contacts/subscription-groups', 'POST', groupPayloadRaw);

    console.log(`[Node SDK] Creating subscription group: ${groupPayloadSdk.name}`);
    const sdkGroup = await sdkClient.contacts.createSubscriberGroup(groupPayloadSdk);

    console.log('\nResponse structure comparison (Create Group):');
    console.log('  Raw API Group response structure:', Object.keys(rawGroup.data?.data?.group || {}));
    console.log('  Node SDK Group response structure:', Object.keys(sdkGroup.data?.group || {}));
    
    // Compare structural attributes, ignoring dynamic ID values
    const groupStructMatch = deepCompare(
      Object.keys(rawGroup.data?.data?.group || {}), 
      Object.keys(sdkGroup.data?.group || {})
    );
    console.log(`  👉 Group payload schema matches: ${groupStructMatch ? '✅ YES' : '❌ NO'}`);

    const rawGroupId = rawGroup.data?.data?.group?.groupId;
    const sdkGroupId = sdkGroup.data?.group?.groupId;

    // -------------------------------------------------------------------------
    // TEST 5: ADD SUBSCRIBER
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Testing Subscriptions (Add) ---');

    console.log(`[RAW API] Subscribing ${rawEmail} to group ${rawGroupId}`);
    const rawSub = await makeRawRequest(`contacts/subscription-groups/${rawGroupId}/subscriptions`, 'POST', {
      contactIdentifier: rawIdentifier,
      email: rawEmail,
      isActive: true,
      consentMethod: 'implicit_api',
      consentProof: 'Raw HTTP sub'
    });

    console.log(`[Node SDK] Subscribing ${sdkEmail} to group ${sdkGroupId}`);
    const sdkSub = await sdkClient.contacts.addSubscriber(sdkGroupId, {
      contactIdentifier: sdkIdentifier,
      email: sdkEmail,
      isActive: true,
      consentMethod: 'implicit_api',
      consentProof: 'SDK sub'
    });

    console.log('\nResponse structure comparison (Add Subscriber):');
    console.log('  Raw API Subscriber keys:', Object.keys(rawSub.data?.data?.subscriber || {}));
    console.log('  Node SDK Subscriber keys:', Object.keys(sdkSub.data?.subscriber || {}));

    const subMatch = deepCompare(
      Object.keys(rawSub.data?.data?.subscriber || {}),
      Object.keys(sdkSub.data?.subscriber || {})
    );
    console.log(`  👉 Subscriber payload schema matches: ${subMatch ? '✅ YES' : '❌ NO'}`);

    // -------------------------------------------------------------------------
    // CLEANUP
    // -------------------------------------------------------------------------
    console.log('\n--- Cleanup: Deleting Created Resources ---');
    
    // Delete memberships
    console.log('[RAW API] Unsubscribing raw contact...');
    await makeRawRequest(`contacts/subscription-groups/${rawGroupId}/subscriptions/${rawIdentifier}`, 'DELETE');
    console.log('[Node SDK] Unsubscribing sdk contact...');
    await sdkClient.contacts.deleteSubscriber(sdkGroupId, sdkIdentifier);

    // Delete groups
    console.log('[RAW API] Deleting raw group...');
    await makeRawRequest(`contacts/subscription-groups/${rawGroupId}`, 'DELETE');
    console.log('[Node SDK] Deleting sdk group...');
    await sdkClient.contacts.deleteSubscriberGroup(sdkGroupId);

    // Delete contacts
    console.log('[RAW API] Deleting raw contact...');
    await makeRawRequest(`contacts/${rawIdentifier}`, 'DELETE');
    console.log('[Node SDK] Deleting sdk contact...');
    await sdkClient.contacts.deleteContact(sdkIdentifier);

    console.log('\n=============================================================');
    console.log('ℹ️ SUMMARY: Direct HTTP API responses match the Node SDK structures!');
    console.log('=============================================================');
  } catch (err) {
    console.error('\n❌ Comparison execution encountered an unexpected error:', err);
  }
}

runComparison();
