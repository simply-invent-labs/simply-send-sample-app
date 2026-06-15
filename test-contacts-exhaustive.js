import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  SimplySendWebSetupClient,
  SimplySendHttpError,
  SimplySendValidationError
} from 'simplysend';

// Load environment variables from .env
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

if (!accountId || !wapiKey) {
  console.error('❌ Error: SIMPLYSEND_ACCOUNT_ID and SIMPLYSEND_WAPI_KEY must be set in .env');
  process.exit(1);
}

console.log('----------------------------------------------------');
console.log('      EXHAUSTIVE WEB SETUP /CONTACTS API TESTER     ');
console.log('----------------------------------------------------');
console.log('Account ID:', accountId);
console.log('API Key   :', '***');
console.log('WAPI URL  :', wapiUrl || 'default');
console.log('----------------------------------------------------');

const client = new SimplySendWebSetupClient({
  accountId,
  apiKey: wapiKey,
  ...(wapiUrl && { baseUrl: wapiUrl })
});

// Helper: secure hashed contact identifier
function getContactIdentifier(email) {
  const hashed = crypto.createHash('md5').update(email.toLowerCase().trim()).digest('hex');
  return `email_${hashed}`;
}

let testsRun = 0;
let testsPassed = 0;

function assert(condition, message) {
  testsRun++;
  if (condition) {
    testsPassed++;
    console.log(`  ✅ PASS: ${message}`);
    return true;
  } else {
    console.log(`  ❌ FAIL: ${message}`);
    return false;
  }
}

async function runExhaustiveTests() {
  const uniqueId = Math.floor(Math.random() * 10000);
  const email = `exhaustive-test-${uniqueId}@example.com`;
  const contactIdentifier = getContactIdentifier(email);
  
  const malformedEmail = `malformed-email-${uniqueId}`;
  
  const groupName = `Exhaustive Group ${uniqueId}`;
  const updatedGroupName = `Exhaustive Group Mod ${uniqueId}`;
  let groupId = null;

  try {
    // =========================================================================
    // SECTION 1: CONTACTS - POSITIVE CASES
    // =========================================================================
    console.log('\n--- SECTION 1: Contacts - Positive Scenarios ---');

    // 1. Create contact
    console.log(`1.1 Creating new directory contact (${email})...`);
    const createRes = await client.contacts.createContact({
      email,
      firstName: 'Exhaustive',
      lastName: 'Positive',
      globalStatus: 'active',
      consentMethod: 'implicit_api',
      consentDetails: 'Manual integration test runner'
    });
    assert(createRes.success === true, 'contacts.createContact() returns success: true');
    assert(createRes.data?.contact?.email === email, 'Created contact contains correct email');

    // 2. Fetch created contact
    console.log(`1.2 Querying contact details (${contactIdentifier})...`);
    const getRes = await client.contacts.getContact(contactIdentifier);
    assert(getRes.success === true, 'contacts.getContact() returns success: true');
    assert(getRes.data?.contact?.email === email, 'Queried contact matches expected email');
    assert(getRes.data?.contact?.firstName === 'Exhaustive', 'Queried contact has correct first name');

    // 3. Update contact details using update (PUT)
    console.log(`1.3 Updating contact fields via contacts.updateContact()...`);
    const updateRes = await client.contacts.updateContact(contactIdentifier, {
      email,
      firstName: 'Exhaustive-Updated',
      lastName: 'Positive-Updated',
      globalStatus: 'unsubscribed',
      customFields: { customField: 'test-value' }
    });
    assert(updateRes.success === true, 'contacts.updateContact() returns success: true');

    // 4. Verify updates
    console.log('1.4 Querying updated contact details...');
    const getModRes = await client.contacts.getContact(contactIdentifier);
    assert(getModRes.data?.contact?.firstName === 'Exhaustive-Updated', 'Updated first name matches');
    assert(getModRes.data?.contact?.globalStatus === 'unsubscribed', 'Updated status is unsubscribed');
    assert(getModRes.data?.contact?.customFields?.customField === 'test-value', 'Updated customFields is correct');

    // 5. List contacts
    console.log('1.5 Listing contacts from directory...');
    const listRes = await client.contacts.listContacts({ limit: 5 });
    assert(listRes.success === true, 'contacts.listContacts() returns success: true');
    assert(Array.isArray(listRes.data?.contacts), 'contacts.listContacts() returns an array in data.contacts');

    // =========================================================================
    // SECTION 2: CONTACTS - NEGATIVE & EDGE CASES
    // =========================================================================
    console.log('\n--- SECTION 2: Contacts - Negative & Edge Scenarios ---');

    // 1. Fetch non-existent contact
    console.log('2.1 Querying non-existent contact (should return 404)...');
    try {
      await client.contacts.getContact('email_00000000000000000000000000000000');
      assert(false, 'contacts.getContact() for non-existent contact should have thrown');
    } catch (err) {
      if (err instanceof SimplySendHttpError) {
        assert(err.statusCode === 404, 'contacts.getContact() for non-existent contact throws SimplySendHttpError with status 404');
      } else {
        assert(false, `Expected SimplySendHttpError, got: ${err.message}`);
      }
    }

    // 2. Fetch malformed identifier (locally validated)
    console.log('2.2 Querying malformed identifier without colon (should throw locally)...');
    try {
      await client.contacts.getContact('emailwithoutcolon');
      assert(false, 'contacts.getContact() with malformed identifier should have thrown locally');
    } catch (err) {
      if (err instanceof SimplySendValidationError) {
        assert(err.field === 'contactIdentifier', 'Throws SimplySendValidationError on field contactIdentifier');
        assert(err.message.includes('must be a secure hashed value'), 'Validation message matches rule');
      } else {
        assert(false, `Expected SimplySendValidationError, got: ${err.message}`);
      }
    }

    // 3. Create contact without required fields (locally validated)
    console.log('2.3 Creating contact without email or phone (should throw locally)...');
    try {
      await client.contacts.createContact({ firstName: 'NoEmail' });
      assert(false, 'contacts.createContact() without email/phone should have thrown locally');
    } catch (err) {
      if (err instanceof SimplySendValidationError) {
        assert(err.field === 'email', 'Throws SimplySendValidationError on field email');
      } else {
        assert(false, `Expected SimplySendValidationError, got: ${err.message}`);
      }
    }

    // 4. Create duplicate contact (should return 409)
    console.log('2.4 Creating duplicate directory contact (should fail with 409)...');
    try {
      await client.contacts.createContact({
        email,
        consentMethod: 'implicit_api'
      });
      assert(false, 'contacts.createContact() for duplicate contact should have thrown');
    } catch (err) {
      if (err instanceof SimplySendHttpError) {
        console.log('    [DEBUG] err.statusCode:', err.statusCode);
        console.log('    [DEBUG] err.body:', JSON.stringify(err.body));
        assert(err.statusCode === 409, 'contacts.createContact() for duplicate contact throws SimplySendHttpError with status 409');
        assert(err.body?.error?.code === 'CONTACT_ALREADY_EXISTS', 'Returns CONTACT_ALREADY_EXISTS code');
      } else {
        assert(false, `Expected SimplySendHttpError, got: ${err.message}`);
      }
    }

    // 5. Update non-existent contact (should return 404)
    console.log('2.5 Updating non-existent contact (should fail with 404)...');
    try {
      await client.contacts.updateContact('email_00000000000000000000000000000000', {
        firstName: 'DoesNotExist'
      });
      assert(false, 'contacts.updateContact() for non-existent contact should have thrown');
    } catch (err) {
      if (err instanceof SimplySendHttpError) {
        assert(err.statusCode === 404, 'contacts.updateContact() for non-existent contact throws SimplySendHttpError with status 404');
        assert(err.body?.error?.code === 'CONTACT_NOT_FOUND', 'Returns CONTACT_NOT_FOUND code');
      } else {
        assert(false, `Expected SimplySendHttpError, got: ${err.message}`);
      }
    }

    // =========================================================================
    // SECTION 3: SUBSCRIPTION GROUPS - POSITIVE CASES
    // =========================================================================
    console.log('\n--- SECTION 3: Subscription Groups - Positive Scenarios ---');

    // 1. Create subscription group
    console.log(`3.1 Creating new subscription group (${groupName})...`);
    const createGroupRes = await client.contacts.createSubscriberGroup({
      name: groupName,
      description: 'Exhaustive positive group description'
    });
    assert(createGroupRes.success === true, 'contacts.createSubscriberGroup() returns success: true');
    groupId = createGroupRes.data?.group?.groupId;
    assert(typeof groupId === 'string', 'Created group returns a valid groupId string');

    // 2. Fetch created group details
    console.log(`3.2 Querying group details (groupId: ${groupId})...`);
    const getGroupRes = await client.contacts.getSubscriberGroup(groupId);
    assert(getGroupRes.success === true, 'contacts.getSubscriberGroup() returns success: true');
    assert(getGroupRes.data?.group?.name === groupName, 'Queried group has correct name');

    // 3. Update group properties
    console.log('3.3 Updating group details...');
    const updateGroupRes = await client.contacts.updateSubscriberGroup(groupId, {
      name: updatedGroupName,
      description: 'Modified exhaustive group description'
    });
    assert(updateGroupRes.success === true, 'contacts.updateSubscriberGroup() returns success: true');

    // 4. Verify group updates
    console.log('3.4 Querying updated group details...');
    const getGroupModRes = await client.contacts.getSubscriberGroup(groupId);
    assert(getGroupModRes.data?.group?.name === updatedGroupName, 'Updated group name matches');
    assert(getGroupModRes.data?.group?.description === 'Modified exhaustive group description', 'Updated group description matches');

    // 5. List subscription groups
    console.log('3.5 Listing subscription groups...');
    const listGroupsRes = await client.contacts.listSubscriberGroups();
    assert(listGroupsRes.success === true, 'contacts.listSubscriberGroups() returns success: true');
    assert(Array.isArray(listGroupsRes.data?.groups), 'contacts.listSubscriberGroups() returns an array in data.groups');
    const groupFound = listGroupsRes.data?.groups?.some(g => g.groupId === groupId);
    assert(groupFound === true, 'Created group is present in the listed groups');

    // =========================================================================
    // SECTION 4: SUBSCRIPTION GROUPS - NEGATIVE CASES
    // =========================================================================
    console.log('\n--- SECTION 4: Subscription Groups - Negative Scenarios ---');

    // 1. Fetch non-existent group
    console.log('4.1 Querying non-existent group (should return 404)...');
    try {
      await client.contacts.getSubscriberGroup('group_nonexistent_123456789');
      assert(false, 'contacts.getSubscriberGroup() for non-existent group should have failed');
    } catch (err) {
      if (err instanceof SimplySendHttpError) {
        assert(err.statusCode === 404, 'contacts.getSubscriberGroup() for non-existent group returns 404');
      } else {
        assert(false, `Expected SimplySendHttpError, got: ${err.message}`);
      }
    }

    // 2. Create group without required fields (locally validated)
    console.log('4.2 Creating group without name (should throw locally)...');
    try {
      await client.contacts.createSubscriberGroup({ description: 'NoName' });
      assert(false, 'contacts.createSubscriberGroup() without name should have failed locally');
    } catch (err) {
      if (err instanceof SimplySendValidationError) {
        assert(err.field === 'name', 'Throws SimplySendValidationError on field name');
      } else {
        assert(false, `Expected SimplySendValidationError, got: ${err.message}`);
      }
    }

    // =========================================================================
    // SECTION 5: SUBSCRIBERS (MEMBERSHIPS) - POSITIVE CASES
    // =========================================================================
    console.log('\n--- SECTION 5: Subscribers (Memberships) - Positive Scenarios ---');

    // 1. Subscribe contact to group
    console.log(`5.1 Subscribing contact ${email} to group ${updatedGroupName}...`);
    const addSubRes = await client.contacts.addSubscriber(groupId, {
      contactIdentifier,
      email,
      isActive: true,
      consentMethod: 'implicit_api',
      consentDetails: 'Manual integration test runner subscriber'
    });
    assert(addSubRes.success === true, 'contacts.addSubscriber() returns success: true');
    assert(addSubRes.data?.subscriber?.isActive === true, 'Subscriber isActive field is true');

    // 2. Fetch subscriber details
    console.log('5.2 Querying subscriber details...');
    const getSubRes = await client.contacts.getSubscriber(groupId, contactIdentifier);
    assert(getSubRes.success === true, 'contacts.getSubscriber() returns success: true');
    assert(getSubRes.data?.email === email, 'Subscriber record contains correct email');

    // 3. List subscribers in group
    console.log('5.3 Listing subscribers in the group...');
    const listSubRes = await client.contacts.listSubscribers(groupId, { limit: 5 });
    assert(listSubRes.success === true, 'contacts.listSubscribers() returns success: true');
    assert(listSubRes.data?.subscribers?.length > 0, 'Subscribers list is not empty');
    const subFound = listSubRes.data?.subscribers?.some(s => s.contactIdentifier === contactIdentifier);
    assert(subFound === true, 'Subscribed contact is present in subscribers list');

    // 4. Update subscriber consent/status (PATCH)
    console.log('5.4 Updating subscriber status to inactive via contacts.updateSubscriber()...');
    const updateSubRes = await client.contacts.updateSubscriber(groupId, contactIdentifier, {
      isActive: false,
      consentDetails: 'Updated manual integration test runner subscriber'
    });
    assert(updateSubRes.success === true, 'contacts.updateSubscriber() returns success: true');

    // 5. Verify subscriber updates
    console.log('5.5 Verifying subscriber inactivation...');
    const getSubModRes = await client.contacts.getSubscriber(groupId, contactIdentifier);
    assert(getSubModRes.data?.isActive === false, 'Subscriber status updated to false');

    // 6. Delete subscriber from group (unsubscribe)
    console.log('5.6 Deleting subscriber from group (unsubscribing)...');
    const deleteSubRes = await client.contacts.deleteSubscriber(groupId, contactIdentifier);
    assert(deleteSubRes.success === true, 'contacts.deleteSubscriber() returns success: true');

    // =========================================================================
    // SECTION 6: SUBSCRIBERS (MEMBERSHIPS) - NEGATIVE Scenarios
    // =========================================================================
    console.log('\n--- SECTION 6: Subscribers (Memberships) - Negative Scenarios ---');

    // 1. Fetch deleted subscriber details (should return 404)
    console.log('6.1 Querying deleted subscriber (should return 404)...');
    try {
      await client.contacts.getSubscriber(groupId, contactIdentifier);
      assert(false, 'contacts.getSubscriber() for deleted subscriber should have failed');
    } catch (err) {
      if (err instanceof SimplySendHttpError) {
        assert(err.statusCode === 404, 'contacts.getSubscriber() for deleted subscriber returns 404');
      } else {
        assert(false, `Expected SimplySendHttpError, got: ${err.message}`);
      }
    }

    // 2. Add subscriber to non-existent group (should return 404)
    console.log('6.2 Adding subscriber to non-existent group (should fail with 404)...');
    try {
      await client.contacts.addSubscriber('group_nonexistent_123456789', {
        contactIdentifier,
        email,
        isActive: true
      });
      assert(false, 'contacts.addSubscriber() to non-existent group should have failed');
    } catch (err) {
      if (err instanceof SimplySendHttpError) {
        assert(err.statusCode === 404, 'contacts.addSubscriber() to non-existent group returns 404');
      } else {
        assert(false, `Expected SimplySendHttpError, got: ${err.message}`);
      }
    }

    // 3. Add subscriber that does not exist in Contacts Directory first (should return 404)
    const nonexistentEmail = `nonexistent-directory-contact-${uniqueId}@example.com`;
    const nonexistentIdentifier = getContactIdentifier(nonexistentEmail);
    console.log(`6.3 Subscribing non-existent directory contact (${nonexistentEmail}) to group (should return 404)...`);
    try {
      await client.contacts.addSubscriber(groupId, {
        contactIdentifier: nonexistentIdentifier,
        email: nonexistentEmail,
        isActive: true,
        consentMethod: 'implicit_api'
      });
      assert(false, 'contacts.addSubscriber() for non-directory contact should have failed');
    } catch (err) {
      if (err instanceof SimplySendHttpError) {
        assert(err.statusCode === 404, 'contacts.addSubscriber() for non-directory contact returns 404');
        assert(err.body?.error?.code === 'CONTACT_NOT_FOUND' || err.body?.error?.message?.toLowerCase().includes('exist') || err.message.toLowerCase().includes('not found'), 'Returns expected error code or message');
      } else {
        assert(false, `Expected SimplySendHttpError, got: ${err.message}`);
      }
    }

  } finally {
    // =========================================================================
    // SECTION 7: CLEANUP & POST-CLEANUP VERIFICATION
    // =========================================================================
    console.log('\n--- SECTION 7: Cleanup & Post-Cleanup Verification ---');

    // 1. Delete subscription group
    if (groupId) {
      console.log(`7.1 Deleting subscription group (groupId: ${groupId})...`);
      const deleteGroupRes = await client.contacts.deleteSubscriberGroup(groupId);
      assert(deleteGroupRes.success === true, 'contacts.deleteSubscriberGroup() returns success: true');

      // Verify deletion
      console.log('7.2 Verifying group deletion (polling for 404)...');
      let deleted = false;
      for (let attempt = 1; attempt <= 10; attempt++) {
        try {
          const checkGroup = await client.contacts.getSubscriberGroup(groupId);
          console.log(`    [Poll #${attempt}] Group still exists (status: ${checkGroup.data?.group?.importStatus || 'none'}). Waiting 1s...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (err) {
          if (err instanceof SimplySendHttpError && err.statusCode === 404) {
            deleted = true;
            break;
          }
          throw err;
        }
      }
      assert(deleted === true, 'getSubscriberGroup() eventually returns 404 (deleted successfully)');
    }

    // 2. Delete contact globally
    console.log(`7.3 Deleting directory contact (${contactIdentifier})...`);
    const deleteContactRes = await client.contacts.deleteContact(contactIdentifier);
    assert(deleteContactRes.success === true, 'contacts.deleteContact() returns success: true');

    // Verify deletion
    console.log('7.4 Verifying contact deletion (should return 404)...');
    try {
      await client.contacts.getContact(contactIdentifier);
      assert(false, 'contacts.getContact() after deletion should have thrown');
    } catch (err) {
      if (err instanceof SimplySendHttpError) {
        assert(err.statusCode === 404, 'contacts.getContact() for deleted contact returns 404');
      }
    }
    
    console.log('----------------------------------------------------');
    console.log(`EXHAUSTIVE TEST RESULTS: ${testsPassed} / ${testsRun} ASSERTIONS PASSED`);
    console.log('----------------------------------------------------');
    
    if (testsPassed === testsRun) {
      console.log('🎉 ALL TESTS COMPLETED SUCCESSFULLY!');
    } else {
      console.error('❌ SOME TESTS FAILED! PLEASE REVIEW LOGS.');
      process.exit(1);
    }
  }
}

runExhaustiveTests().catch((err) => {
  console.error('❌ Unexpected runner failure:', err);
  process.exit(1);
});
