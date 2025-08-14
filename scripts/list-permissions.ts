import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function listPermissions() {
  const email = process.env.CLOUDFLARE_EMAIL;
  const globalKey = process.env.CLOUDFLARE_GLOBAL_KEY;

  if (!email || !globalKey) {
    console.error(chalk.red('Error: CLOUDFLARE_EMAIL and CLOUDFLARE_GLOBAL_KEY must be set in .env'));
    process.exit(1);
  }

  try {
    const response = await axios.get('https://api.cloudflare.com/client/v4/user/tokens/permission_groups', {
      headers: {
        'X-Auth-Email': email,
        'X-Auth-Key': globalKey,
        'Content-Type': 'application/json'
      }
    });

    const permissionGroups = response.data.result;
    
    console.log(chalk.cyan('\nAll Available Permission Groups:'));
    console.log(chalk.gray('=' .repeat(80)));
    
    // Group permissions by category
    const categories: Record<string, any[]> = {};
    
    permissionGroups.forEach((pg: any) => {
      const category = pg.name.split(':')[0] || 'Other';
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push(pg);
    });
    
    // Display Zero Trust permissions first
    if (categories['Zero Trust']) {
      console.log(chalk.yellow('\n🔐 Zero Trust Permissions:'));
      categories['Zero Trust'].forEach((pg: any) => {
        console.log(`  ${chalk.green(pg.id)} - ${chalk.bold(pg.name)}`);
      });
    }
    
    // Display Account level Zero Trust permissions
    if (categories['Account']) {
      const accountZeroTrust = categories['Account'].filter((pg: any) => 
        pg.name.includes('Zero Trust') || pg.name.includes('Gateway')
      );
      
      if (accountZeroTrust.length > 0) {
        console.log(chalk.yellow('\n🏢 Account Level Zero Trust/Gateway Permissions:'));
        accountZeroTrust.forEach((pg: any) => {
          console.log(`  ${chalk.green(pg.id)} - ${chalk.bold(pg.name)}`);
        });
      }
    }
    
    // Search for any Gateway-related permissions
    const gatewayPermissions = permissionGroups.filter((pg: any) => 
      pg.name.toLowerCase().includes('gateway') || 
      pg.name.toLowerCase().includes('zero trust')
    );
    
    if (gatewayPermissions.length > 0) {
      console.log(chalk.yellow('\n🌐 All Gateway/Zero Trust Related Permissions:'));
      gatewayPermissions.forEach((pg: any) => {
        console.log(`  ${chalk.green(pg.id)} - ${chalk.bold(pg.name)}`);
      });
    }

    // Display other categories
    Object.keys(categories).sort().forEach(category => {
      if (category !== 'Zero Trust' && category !== 'Account') {
        const filtered = categories[category].filter((pg: any) => 
          !pg.name.includes('Zero Trust') && !pg.name.includes('Gateway')
        );
        
        if (filtered.length > 0) {
          console.log(chalk.blue(`\n${category}:`));
          filtered.slice(0, 5).forEach((pg: any) => {
            console.log(`  ${pg.id} - ${pg.name}`);
          });
          if (filtered.length > 5) {
            console.log(`  ... and ${filtered.length - 5} more`);
          }
        }
      }
    });

  } catch (error) {
    console.error(chalk.red('Error fetching permission groups:'));
    if (axios.isAxiosError(error)) {
      console.error(error.response?.data || error.message);
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}

listPermissions();