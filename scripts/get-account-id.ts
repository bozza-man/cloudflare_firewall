import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function getAccountId() {
  const email = process.env.CLOUDFLARE_EMAIL;
  const globalKey = process.env.CLOUDFLARE_GLOBAL_KEY;

  if (!email || !globalKey) {
    console.error(chalk.red('Error: CLOUDFLARE_EMAIL and CLOUDFLARE_GLOBAL_KEY must be set in .env'));
    process.exit(1);
  }

  try {
    const response = await axios.get('https://api.cloudflare.com/client/v4/accounts', {
      headers: {
        'X-Auth-Email': email,
        'X-Auth-Key': globalKey,
        'Content-Type': 'application/json'
      }
    });

    const accounts = response.data.result;
    
    if (accounts.length === 0) {
      console.error(chalk.red('No accounts found'));
      process.exit(1);
    }

    console.log(chalk.cyan('\nCloudflare Accounts:'));
    accounts.forEach((account: any, index: number) => {
      console.log(`\n${index + 1}. ${chalk.bold(account.name)}`);
      console.log(`   ID: ${chalk.green(account.id)}`);
      console.log(`   Type: ${account.type}`);
    });

    if (accounts.length === 1) {
      console.log(chalk.yellow(`\nAdd this to your .env file:`));
      console.log(`CLOUDFLARE_ACCOUNT_ID=${accounts[0].id}`);
    } else {
      console.log(chalk.yellow(`\nChoose the account you want to use and add this to your .env file:`));
      console.log(`CLOUDFLARE_ACCOUNT_ID=<chosen_account_id>`);
    }

  } catch (error) {
    console.error(chalk.red('Error fetching accounts:'));
    if (axios.isAxiosError(error)) {
      console.error(error.response?.data || error.message);
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}

getAccountId();