import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { MCPService } from '../mcp/mcp-service.js';
import { GatewayClient } from '../api/gateway-client.js';

export class MCPCommands {
  private mcpService: MCPService;
  private gatewayClient: GatewayClient;

  constructor() {
    this.mcpService = new MCPService();
    this.gatewayClient = new GatewayClient();
  }

  getCommand(): Command {
    const program = new Command('mcp')
      .description('MCP-powered observability and monitoring commands (simplified)');

    // Rule effectiveness command
    program
      .command('effectiveness')
      .description('Analyze rule effectiveness using MCP (Note: MCP servers require OAuth authentication)')
      .option('-t, --time <range>', 'Time range for analysis', '7d')
      .action(async (options) => {
        console.log(chalk.yellow('\n⚠️  MCP Integration Notice:\n'));
        console.log('MCP servers require OAuth authentication through Cloudflare.');
        console.log('When prompted, you will need to authenticate in your browser.\n');
        
        const spinner = ora('Attempting to connect to MCP observability...').start();
        
        try {
          // Try to connect to MCP
          await this.mcpService.connectObservability();
          spinner.text = 'Fetching Gateway rules...';
          const rules = await this.gatewayClient.listGatewayRules();
          
          spinner.text = 'Analyzing rule effectiveness...';
          const metrics = await this.mcpService.getRuleMetrics(rules, options.time);
          
          spinner.succeed('Analysis complete');
          
          // Display results
          console.log(chalk.bold('\n📈 Rule Effectiveness Report\n'));
          console.log(chalk.cyan(`Time Range: ${metrics.timeRange}`));
          console.log(chalk.green(`Total Allowed: ${metrics.allowedRequests.toLocaleString()}`));
          console.log(chalk.red(`Total Blocked: ${metrics.blockedRequests.toLocaleString()}`));
          
          if (metrics.ruleEffectiveness.length > 0) {
            console.log(chalk.bold('\nTop Effective Rules:'));
            metrics.ruleEffectiveness.slice(0, 5).forEach((rule, i) => {
              console.log(`  ${i + 1}. ${rule.ruleName}: ${rule.effectiveness}% effectiveness`);
            });
          }
        } catch (error: any) {
          spinner.fail('MCP connection failed');
          console.error(chalk.red('\nError:'), error.message || error);
          console.log(chalk.yellow('\nTroubleshooting:'));
          console.log('1. MCP servers require OAuth authentication');
          console.log('2. You may need to authenticate through your browser');
          console.log('3. Ensure you have the necessary permissions in your Cloudflare account');
          console.log('4. Check that mcp-remote is installed: npm install -g mcp-remote');
        } finally {
          await this.mcpService.disconnectAll();
        }
      });

    // Test MCP connection
    program
      .command('test')
      .description('Test MCP server connections')
      .action(async () => {
        console.log(chalk.cyan('🔌 Testing MCP Server Connections...\n'));
        
        const servers = [
          { name: 'Observability', connect: () => this.mcpService.connectObservability() },
          { name: 'Audit Logs', connect: () => this.mcpService.connectAuditLogs() },
          { name: 'Browser', connect: () => this.mcpService.connectBrowser() }
        ];
        
        for (const server of servers) {
          const spinner = ora(`Testing ${server.name}...`).start();
          try {
            await server.connect();
            spinner.succeed(`${server.name}: Connected ✅`);
          } catch (error) {
            spinner.fail(`${server.name}: Failed ❌`);
          }
        }
        
        await this.mcpService.disconnectAll();
        
        console.log(chalk.yellow('\n📝 Note:'));
        console.log('MCP servers require OAuth authentication.');
        console.log('Failed connections may require browser authentication.');
      });

    // Info command
    program
      .command('info')
      .description('Display information about MCP integration')
      .action(() => {
        console.log(chalk.bold('\n🔌 MCP (Model Context Protocol) Integration\n'));
        
        console.log(chalk.cyan('Available MCP Servers:'));
        console.log('  • Observability - Query logs and metrics');
        console.log('  • Audit Logs - Track Gateway changes');
        console.log('  • Browser - Test blocked sites');
        console.log('  • DNS Analytics - Analyze DNS performance');
        console.log('  • AI Gateway - Manage AI logs');
        
        console.log(chalk.yellow('\nConfiguration:'));
        console.log('  • Account ID:', process.env.CLOUDFLARE_ACCOUNT_ID || 'Not set');
        console.log('  • Zone ID:', process.env.CLOUDFLARE_ZONE_ID || 'Not set');
        console.log('  • MCP Enabled:', process.env.MCP_ENABLED !== 'false' ? 'Yes' : 'No');
        
        console.log(chalk.green('\nUsage:'));
        console.log('  npm start -- mcp test         # Test connections');
        console.log('  npm start -- mcp effectiveness # Analyze rule effectiveness');
        console.log('  npm start -- rules analyze     # Use MCP in rule analysis');
        
        console.log(chalk.gray('\nFor more information:'));
        console.log('  https://modelcontextprotocol.io/');
        console.log('  https://github.com/cloudflare/mcp-server-cloudflare');
      });

    return program;
  }
}
