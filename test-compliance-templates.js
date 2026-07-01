import fs from 'fs';
import path from 'path';
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

async function runTests() {
  const templateName = `SDK Test Unsubscribe ${Date.now()}`;
  let templateId = null;

  try {
    // 1. List compliance templates
    console.log('\n--- 1. Listing compliance templates ---');
    const listRes = await client.complianceTemplates.list();
    console.log('List success! Count:', listRes.data?.templates?.length || 0);

    // 2. Create compliance template
    console.log('\n--- 2. Creating compliance template:', templateName, '---');
    const createRes = await client.complianceTemplates.create({
      name: templateName,
      type: 'unsubscribe',
      htmlContent: '<p><a href="{{unsubscribeUrl}}">Unsubscribe</a></p>',
    });
    templateId = createRes.data?.template?.templateId;
    console.log('Create success! Template ID:', templateId);
    console.log('Result:', JSON.stringify(createRes, null, 2));

    // 3. List with type filter
    console.log('\n--- 3. Listing unsubscribe templates ---');
    const filteredRes = await client.complianceTemplates.list('unsubscribe');
    console.log('Filter success! Count:', filteredRes.data?.templates?.length || 0);

    // 4. Update compliance template
    console.log('\n--- 4. Updating compliance template:', templateId, '---');
    const updateRes = await client.complianceTemplates.update(templateId, {
      name: `${templateName} (Updated)`,
      type: 'unsubscribe',
      htmlContent: '<p><a href="{{unsubscribeUrl}}">Unsubscribe from our emails</a></p>',
    });
    console.log('Update success! Result:', JSON.stringify(updateRes, null, 2));

    // 5. Get compliance template
    console.log('\n--- 5. Getting compliance template:', templateId, '---');
    const getRes = await client.complianceTemplates.get(templateId);
    console.log('Get success! Name:', getRes.data?.template?.name);

    // 6. Delete compliance template
    console.log('\n--- 6. Deleting compliance template:', templateId, '---');
    const deleteRes = await client.complianceTemplates.delete(templateId);
    console.log('Delete success! Template ID:', deleteRes.data?.templateId);

    console.log('\n======================================');
    console.log('ALL COMPLIANCE TEMPLATE OPERATIONS SUCCEEDED!');
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
