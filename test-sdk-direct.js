import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  SimplySendWebSetupClient,
  SimplySendHttpError,
  SimplySendValidationError
} from 'simplysend';

// Simple manual .env parser
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
      const cleanVal = val.replace(/^["']|["']$/g, '');
      process.env[key] = cleanVal;
    }
  });
  console.log('Loaded env configurations.');
}

const accountId = process.env.SIMPLYSEND_ACCOUNT_ID;
const wapiKey = process.env.SIMPLYSEND_WAPI_KEY;
const wapiUrl = process.env.SIMPLYSEND_WAPI_URL;

console.log('Testing with Account ID:', accountId);
console.log('Testing with API Key:', wapiKey ? '***' : 'missing');
console.log('Testing with WAPI URL:', wapiUrl);

const client = new SimplySendWebSetupClient({
  accountId,
  apiKey: wapiKey,
  ...(wapiUrl && { baseUrl: wapiUrl })
});

function getContactIdentifier(email) {
  const hashed = crypto.createHash('md5').update(email.toLowerCase().trim()).digest('hex');
  return `email_${hashed}`;
}

async function runTests() {
  const email = `test-sdk-${Date.now()}@example.com`;
  const contactIdentifier = getContactIdentifier(email);

  try {
    // 1. List contacts
    console.log('\n--- 1. Listing contacts ---');
    const contactsList = await client.contacts.listContacts({ limit: 5 });
    console.log('List contacts success! Count:', contactsList.data?.contacts?.length || 0);

    // 2. Create contact
    console.log('\n--- 2. Creating contact:', email, '---');
    const createRes = await client.contacts.createContact({
      email,
      firstName: 'SDK Direct',
      lastName: 'Runner',
      globalStatus: 'active',
      consentMethod: 'implicit_api',
      consentProof: 'Local SDK Direct script test'
    });
    console.log('Create contact success! Result:', JSON.stringify(createRes));

    // 2.5 Update contact
    console.log('\n--- 2.5 Updating contact:', contactIdentifier, '---');
    const updateRes = await client.contacts.updateContact(contactIdentifier, {
      firstName: 'SDK Direct (Updated)'
    });
    console.log('Update contact success! Result:', JSON.stringify(updateRes));

    // 3. Get contact
    console.log('\n--- 3. Getting contact details ---');
    const getRes = await client.contacts.getContact(contactIdentifier);
    console.log('Get contact success! Email:', getRes.data?.contact?.email);

    // 4. List groups
    console.log('\n--- 4. Listing subscription groups ---');
    const groupsList = await client.contacts.listSubscriberGroups();
    console.log('List groups success! Count:', groupsList.data?.groups?.length || 0);
    
    // Find or create test group
    let groupId = groupsList.data?.groups?.[0]?.groupId;
    if (!groupId) {
      console.log('\n--- 5. Creating test subscription group ---');
      const groupRes = await client.contacts.createSubscriberGroup({
        name: 'SDK Test Group Direct',
        description: 'Created by direct SDK test script'
      });
      groupId = groupRes.data?.group?.groupId;
      console.log('Group created! ID:', groupId);
    } else {
      console.log('Using existing group ID:', groupId);
    }

    // 6. Add Subscriber to group
    console.log('\n--- 6. Subscribing contact to group ---');
    const subRes = await client.contacts.addSubscriber(groupId, {
      contactIdentifier,
      email,
      isActive: true,
      consentMethod: 'implicit_api',
      consentProof: 'Local SDK Direct script test'
    });
    console.log('Add subscriber success! Status:', subRes.data?.subscriber?.isActive);

    // 7. Delete subscriber from group
    console.log('\n--- 7. Unsubscribing contact from group ---');
    const unsubRes = await client.contacts.deleteSubscriber(groupId, contactIdentifier);
    console.log('Delete subscriber success! Result:', JSON.stringify(unsubRes));

    // 8. Delete contact
    console.log('\n--- 8. Deleting contact globally ---');
    const deleteRes = await client.contacts.deleteContact(contactIdentifier);
    console.log('Delete contact success! Result:', JSON.stringify(deleteRes));

    console.log('\n======================================');
    console.log('ALL API OPERATIONS SUCCEEDED WITHOUT ERRORS!');
    console.log('======================================');
  } catch (error) {
    console.error('Test execution failed!');
    if (error instanceof SimplySendHttpError) {
      console.error(`HTTP Error (${error.statusCode}):`, error.message);
      console.error('Response details:', JSON.stringify(error.data));
    } else if (error instanceof SimplySendValidationError) {
      console.error(`Validation Error (${error.field}):`, error.message);
    } else {
      console.error(error);
    }
  }
}

runTests();
