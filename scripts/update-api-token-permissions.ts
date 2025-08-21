#!/usr/bin/env npx ts-node

import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query: string): Promise<string> => {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
};

async function updateAPITokenPermissions() {
  console.log('🔐 Cloudflare API Token Permission Updater');
  console.log('==========================================\n');
  
  // Get credentials
  const email = await question('Enter your Cloudflare email: ');
  const globalApiKey = await question('Enter your Global API Key: ');
  const accountId = '0b0ee2b5eaf1fb8a2612e40ab6488052';
  
  console.log('\n📋 Creating API Token with full permissions for Worker deployment...\n');

  // First, get the zone ID for bozza.au
  const zonesResponse = await fetch('https://api.cloudflare.com/client/v4/zones?name=bozza.au', {
    headers: {
      'X-Auth-Email': email,
      'X-Auth-Key': globalApiKey,
      'Content-Type': 'application/json'
    }
  });

  const zonesData = await zonesResponse.json() as any;
  
  if (!zonesData.success || !zonesData.result?.[0]) {
    console.error('❌ Failed to get zone information:', zonesData.errors);
    process.exit(1);
  }

  const zoneId = zonesData.result[0].id;
  console.log(`✅ Found zone ID for bozza.au: ${zoneId}\n`);

  // Create a new API token with all necessary permissions
  const tokenPayload = {
    name: `Cloudflare Firewall Manager - Full Access (${new Date().toISOString().split('T')[0]})`,
    policies: [
      {
        effect: 'allow',
        resources: {
          [`com.cloudflare.api.account.${accountId}`]: '*'
        },
        permission_groups: [
          // Account-level permissions
          { id: '4797bb84bf83408fba5e0fd26ca5c444', name: 'Account:Cloudflare Workers Scripts:Edit' },
          { id: '1a0c5dfac37c4e8f836e29d3c6b8e1a5', name: 'Account:Worker Routes:Edit' },
          { id: '8b47d2786a534c08a1f94ee6f9f599ef', name: 'Account:Account Settings:Read' },
          { id: 'f8cecdf7c8e24c67af12e1076b0e5b14', name: 'Account:D1:Edit' },
          { id: '0a4f74e3a1eb4db8a6c5e8e5f8e5e6e7', name: 'Account:R2:Edit' },
          { id: '1a71c399447a4097ac4e3d47b2e2b4e5', name: 'Account:Workers KV Storage:Edit' },
          { id: 'b7f4dd7f65414f688e8b6f3e8b5e5e6e', name: 'Account:AI Gateway:Edit' },
          { id: 'c6f5e8e5f8e5e6e7f8e5e6e7f8e5e6e7', name: 'Account:Vectorize:Edit' },
          { id: 'd7f5e8e5f8e5e6e7f8e5e6e7f8e5e6e7', name: 'Account:Analytics:Read' },
          { id: 'e8f5e8e5f8e5e6e7f8e5e6e7f8e5e6e7', name: 'Account:Logs:Edit' },
          { id: 'f9f5e8e5f8e5e6e7f8e5e6e7f8e5e6e7', name: 'Account:Workers Tail:Read' },
          { id: 'a0f5e8e5f8e5e6e7f8e5e6e7f8e5e6e7', name: 'Account:Workers AI:Edit' }
        ]
      },
      {
        effect: 'allow',
        resources: {
          [`com.cloudflare.api.account.zone.${zoneId}`]: '*'
        },
        permission_groups: [
          // Zone-level permissions
          { id: 'e086da7e2179491d91ee5f35b3ca210a', name: 'Zone:Workers Routes:Edit' },
          { id: '82e64a83756745bbbb1c9c2701bf816b', name: 'Zone:DNS:Edit' },
          { id: 'c8fed203ed3043cba015a93ad1616f1f', name: 'Zone:Zone Settings:Read' },
          { id: '4755a26eedb94da69e1066d98aa820be', name: 'Zone:Page Rules:Edit' },
          { id: 'e17beae8b8cb423a99b1730f21238bed', name: 'Zone:SSL and Certificates:Read' },
          { id: '91895c1a17b8451287d911722b2e2a0f', name: 'Zone:Analytics:Read' }
        ]
      }
    ],
    not_before: new Date().toISOString(),
    expires_on: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year from now
    condition: {
      request_ip: {
        in: [],
        not_in: []
      }
    }
  };

  console.log('🔄 Creating API token with comprehensive permissions...\n');

  const createTokenResponse = await fetch('https://api.cloudflare.com/client/v4/user/tokens', {
    method: 'POST',
    headers: {
      'X-Auth-Email': email,
      'X-Auth-Key': globalApiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(tokenPayload)
  });

  const tokenData = await createTokenResponse.json() as any;

  if (!tokenData.success) {
    console.error('❌ Failed to create token:', tokenData.errors);
    
    // Fallback: Try with simplified permissions
    console.log('\n🔄 Trying with simplified permission structure...\n');
    
    const simplifiedPayload = {
      name: `Cloudflare Firewall Manager - ${new Date().toISOString().split('T')[0]}`,
      policies: [
        {
          effect: 'allow',
          resources: {
            [`com.cloudflare.api.account.${accountId}`]: '*',
            [`com.cloudflare.api.account.zone.${zoneId}`]: '*'
          },
          permission_groups: [
            { id: 'c8fed203ed3043cba015a93ad1616f1f' }, // Zone Read
            { id: 'e086da7e2179491d91ee5f35b3ca210a' }, // Workers Routes Edit
            { id: '82e64a83756745bbbb1c9c2701bf816b' }, // DNS Edit
            { id: '4797bb84bf83408fba5e0fd26ca5c444' }, // Workers Scripts Edit
            { id: '1a71c399447a4097ac4e3d47b2e2b4e5' }  // KV Storage Edit
          ]
        }
      ]
    };

    const retryResponse = await fetch('https://api.cloudflare.com/client/v4/user/tokens', {
      method: 'POST',
      headers: {
        'X-Auth-Email': email,
        'X-Auth-Key': globalApiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(simplifiedPayload)
    });

    const retryData = await retryResponse.json() as any;
    
    if (!retryData.success) {
      console.error('❌ Failed to create token with simplified permissions:', retryData.errors);
      process.exit(1);
    }
    
    console.log('✅ Successfully created API token!\n');
    console.log('🔑 Token Value:', retryData.result.value);
    console.log('\n⚠️  IMPORTANT: Save this token value now! It won\'t be shown again.\n');
    
  } else {
    console.log('✅ Successfully created API token with full permissions!\n');
    console.log('🔑 Token Value:', tokenData.result.value);
    console.log('\n⚠️  IMPORTANT: Save this token value now! It won\'t be shown again.\n');
  }

  // Update environment variables
  console.log('📝 Next steps:');
  console.log('1. Export the token: export CLOUDFLARE_API_TOKEN="<token_value>"');
  console.log('2. Update GitHub secret: gh secret set CLOUDFLARE_API_TOKEN --body "<token_value>"');
  console.log('3. Deploy the Worker: npx wrangler deploy -c wrangler.production.toml\n');

  // Test the token
  console.log('🧪 Testing the new token...\n');
  
  const testResponse = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
    headers: {
      'Authorization': `Bearer ${tokenData.result?.value || retryData.result?.value}`,
      'Content-Type': 'application/json'
    }
  });

  const testData = await testResponse.json() as any;
  
  if (testData.success) {
    console.log('✅ Token verification successful!');
    console.log('Token ID:', testData.result.id);
    console.log('Status:', testData.result.status);
  } else {
    console.log('⚠️  Token verification failed:', testData.errors);
  }

  rl.close();
}

// Alternative: List and update existing tokens
async function listAndUpdateTokens() {
  console.log('\n📋 Listing existing API tokens...\n');
  
  const email = await question('Enter your Cloudflare email: ');
  const globalApiKey = await question('Enter your Global API Key: ');
  
  const response = await fetch('https://api.cloudflare.com/client/v4/user/tokens', {
    headers: {
      'X-Auth-Email': email,
      'X-Auth-Key': globalApiKey,
      'Content-Type': 'application/json'
    }
  });

  const data = await response.json() as any;
  
  if (data.success) {
    console.log('\nExisting tokens:');
    data.result.forEach((token: any, index: number) => {
      console.log(`${index + 1}. ${token.name} (ID: ${token.id})`);
      console.log(`   Status: ${token.status}`);
      console.log(`   Last used: ${token.last_used_on || 'Never'}`);
      console.log(`   Expires: ${token.expires_on || 'Never'}\n`);
    });
  }
  
  rl.close();
}

// Main execution
(async () => {
  console.log('\nSelect an option:');
  console.log('1. Create new API token with full permissions');
  console.log('2. List existing API tokens');
  
  const choice = await question('\nEnter your choice (1 or 2): ');
  
  if (choice === '1') {
    await updateAPITokenPermissions();
  } else if (choice === '2') {
    await listAndUpdateTokens();
  } else {
    console.log('Invalid choice');
    rl.close();
  }
})().catch(error => {
  console.error('Error:', error);
  rl.close();
  process.exit(1);
});
