#!/usr/bin/env node
/**
 * Project Guardian - Autonomous Agent Entry Point
 * CLI interface for starting, stopping, and managing the guardian agent
 */

import { program } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import * as readline from 'readline';
import { Guardian } from './core/Guardian.js';
import { StateManager } from './core/StateManager.js';
import { ReportGenerator } from './tasks/ReportGenerator.js';
import { CopilotQueue } from './tasks/CopilotQueue.js';
import { PromptGenerator } from './tasks/PromptGenerator.js';
import { DirectiveManager } from './tasks/TaskDirective.js';
import { E2EAuditTaskRunner } from './tasks/E2EAuditTaskRunner.js';
import { DEFAULT_CONFIG, type AgentConfig } from './core/types.js';

const VERSION = '1.1.0';

program
  .name('guardian')
  .description('Project Guardian - Autonomous project health agent')
  .version(VERSION);

program
  .option('-d, --daemon', 'Run as background daemon')
  .option('-s, --stop', 'Stop running daemon')
  .option('--status', 'Show guardian status')
  .option('-r, --report', 'Generate and display report')
  .option('-q, --process-queue', 'Process Copilot queue')
  .option('--scan', 'Run single scan and exit')
  .option('--ci', 'CI mode (fail on guardrail violations)')
  .option('--no-auto-fix', 'Disable automatic fixes')
  .option('--no-auto-stage', 'Disable automatic git staging')
  .option('--watch-interval <ms>', 'File watch interval in ms', '30000')
  .option('--scan-interval <ms>', 'Full scan interval in ms', '300000')
  .option('--project <path>', 'Project root path')
  // New task and prompt options
  .option('-t, --task <command>', 'Create and process a task directive (e.g., "fix typescript errors")')
  .option('-g, --generate-prompts', 'Generate Copilot-ready prompts for all issues')
  .option('-i, --interactive', 'Interactive mode for task selection')
  .option('--list-prompts', 'List all generated prompts')
  .option('--show-prompt <id>', 'Show a specific prompt by filename')
  .option('--clear-prompts', 'Clear all generated prompts')
  .option('--suggest', 'Show suggested tasks based on current issues')
  // E2E Quality & Coherence Audit
  .option('--e2e-audit', 'Run end-to-end quality and coherence audit of the CSG pipeline');

program.parse();

const options = program.opts();

async function main(): Promise<void> {
  const projectRoot = options.project || process.cwd();
  
  const config: Partial<AgentConfig> = {
    projectRoot,
    autoFix: options.autoFix !== false,
    autoStage: options.autoStage !== false,
    watchInterval: parseInt(options.watchInterval, 10),
    scanInterval: parseInt(options.scanInterval, 10),
  };

  // Ensure agent directories exist
  const agentDirs = [
    path.join(projectRoot, 'agent', 'reports'),
    path.join(projectRoot, 'agent', 'queue'),
    path.join(projectRoot, 'agent', 'logs'),
    path.join(projectRoot, 'agent', '.state'),
    path.join(projectRoot, 'agent', 'prompts'),
    path.join(projectRoot, 'agent', 'directives'),
  ];
  for (const dir of agentDirs) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (options.stop) {
    await stopDaemon(projectRoot);
    return;
  }

  if (options.status) {
    await showStatus(projectRoot, config);
    return;
  }

  if (options.report) {
    await generateReport(projectRoot, config);
    return;
  }

  if (options.processQueue) {
    await processQueue(projectRoot, config);
    return;
  }

  if (options.scan) {
    await runSingleScan(config, { ci: options.ci === true });
    return;
  }

  // New command handlers
  if (options.task) {
    await handleTask(config, options.task);
    return;
  }

  if (options.generatePrompts) {
    await generatePrompts(config);
    return;
  }

  if (options.interactive) {
    await interactiveMode(config);
    return;
  }

  if (options.listPrompts) {
    await listPrompts(config);
    return;
  }

  if (options.showPrompt) {
    await showPrompt(config, options.showPrompt);
    return;
  }

  if (options.clearPrompts) {
    await clearPrompts(config);
    return;
  }

  if (options.suggest) {
    await showSuggestions(config);
    return;
  }

  if (options.e2eAudit) {
    await runE2EAudit(config);
    return;
  }

  // Default: start guardian
  await startGuardian(config, options.daemon);
}

async function startGuardian(config: Partial<AgentConfig>, daemon: boolean): Promise<void> {
  const guardian = new Guardian(config);

  // Setup signal handlers
  const shutdown = async () => {
    console.log('\nShutting down...');
    await guardian.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Handle uncaught errors
  process.on('uncaughtException', async (error) => {
    console.error('Uncaught exception:', error);
    await guardian.stop();
    process.exit(1);
  });

  process.on('unhandledRejection', async (reason) => {
    console.error('Unhandled rejection:', reason);
  });

  const started = await guardian.start();
  
  if (!started) {
    process.exit(1);
  }

  if (daemon) {
    console.log('Guardian running in daemon mode. Use --stop to stop.');
    // Keep process running
    await new Promise(() => {});
  } else {
    console.log('\nPress Ctrl+C to stop the guardian.\n');
    // Keep process running
    await new Promise(() => {});
  }
}

async function stopDaemon(projectRoot: string): Promise<void> {
  const lockPath = path.join(projectRoot, DEFAULT_CONFIG.lockFile);
  
  if (!fs.existsSync(lockPath)) {
    console.log('No guardian instance running.');
    return;
  }

  try {
    const lockData = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
    const pid = lockData.pid;

    console.log(`Stopping guardian (PID: ${pid})...`);
    
    try {
      process.kill(pid, 'SIGTERM');
      console.log('Stop signal sent.');
      
      // Wait a bit and check if it stopped
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      try {
        process.kill(pid, 0);
        console.log('Process still running. Sending SIGKILL...');
        process.kill(pid, 'SIGKILL');
      } catch {
        // Process is gone
      }
    } catch (e) {
      console.log('Process not found. Cleaning up lock file.');
    }

    // Clean up lock file
    if (fs.existsSync(lockPath)) {
      fs.unlinkSync(lockPath);
    }
    
    console.log('Guardian stopped.');
  } catch (error) {
    console.error('Error stopping guardian:', error);
    // Clean up stale lock
    if (fs.existsSync(lockPath)) {
      fs.unlinkSync(lockPath);
    }
  }
}

async function showStatus(_projectRoot: string, config: Partial<AgentConfig>): Promise<void> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const stateManager = new StateManager(fullConfig);
  const state = stateManager.loadAgentState();
  const issues = stateManager.getUnresolvedIssues();

  console.log('\n' + '═'.repeat(60));
  console.log('  PROJECT GUARDIAN STATUS');
  console.log('═'.repeat(60));

  if (state?.isRunning) {
    // Check if process is actually running
    let isActuallyRunning = false;
    if (state.pid) {
      try {
        process.kill(state.pid, 0);
        isActuallyRunning = true;
      } catch {
        isActuallyRunning = false;
      }
    }

    if (isActuallyRunning) {
      console.log(`\n  🟢 Status: RUNNING (PID: ${state.pid})`);
      console.log(`  ⏱️  Started: ${state.startedAt?.toISOString() || 'Unknown'}`);
      console.log(`  🔍 Last scan: ${state.lastScan?.toISOString() || 'Never'}`);
      console.log(`  📊 Last report: ${state.lastReport?.toISOString() || 'Never'}`);
    } else {
      console.log('\n  🟡 Status: STALE (process not running)');
      console.log('  Run --stop to clean up lock file');
    }
  } else {
    console.log('\n  🔴 Status: STOPPED');
  }

  console.log('\n  📊 ISSUES SUMMARY');
  console.log('  ' + '─'.repeat(40));
  console.log(`  Total: ${issues.length}`);
  console.log(`  🚨 Critical: ${issues.filter(i => i.severity === 'critical').length}`);
  console.log(`  ⚠️  High: ${issues.filter(i => i.severity === 'high').length}`);
  console.log(`  📝 Medium: ${issues.filter(i => i.severity === 'medium').length}`);
  console.log(`  ℹ️  Low: ${issues.filter(i => i.severity === 'low').length}`);

  console.log('\n' + '═'.repeat(60) + '\n');
}

async function generateReport(_projectRoot: string, config: Partial<AgentConfig>): Promise<void> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const stateManager = new StateManager(fullConfig);
  const reportGenerator = new ReportGenerator(fullConfig, stateManager);

  const report = await reportGenerator.getLatestReport();
  
  if (report) {
    reportGenerator.printReport(report);
  } else {
    console.log('No report found. Run a scan first.');
  }
}

async function processQueue(_projectRoot: string, config: Partial<AgentConfig>): Promise<void> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const stateManager = new StateManager(fullConfig);
  const copilotQueue = new CopilotQueue(fullConfig, stateManager);

  const result = await copilotQueue.processQueue();
  console.log(`\nQueue processing complete:`);
  console.log(`  Processed: ${result.processed}`);
  console.log(`  Failed: ${result.failed}`);
}

async function runSingleScan(
  config: Partial<AgentConfig>,
  options?: {
    ci?: boolean;
  }
): Promise<void> {
  const ciMode = options?.ci === true;
  const fullConfig: AgentConfig = { ...DEFAULT_CONFIG, ...config } as AgentConfig;

  if (ciMode) {
    // Ensure the scan reflects only the current working tree, not stale cached issues.
    const issuesPath = path.join(fullConfig.projectRoot, 'agent', '.state', 'issues.json');
    try {
      if (fs.existsSync(issuesPath)) {
        fs.unlinkSync(issuesPath);
      }
    } catch {
      // best-effort cleanup
    }
  }

  const playwrightLockPath = path.join(fullConfig.projectRoot, fullConfig.playwrightLockFile);
  const createdPlaywrightLock = ciMode && !fs.existsSync(playwrightLockPath);
  if (createdPlaywrightLock) {
    // Skip running Vitest via Guardian (CI already runs it elsewhere).
    try {
      fs.writeFileSync(
        playwrightLockPath,
        JSON.stringify({ pid: process.pid, timestamp: new Date().toISOString() }, null, 2),
        'utf-8'
      );
    } catch {
      // best-effort
    }
  }

  const guardian = new Guardian(config);
  
  console.log('Running single scan...\n');
  await guardian.runFullScan();
  await guardian.generateReport();
  
  console.log('\nScan complete.');

  if (ciMode) {
    const stateManager = new StateManager(fullConfig);
    const unresolved = stateManager.getUnresolvedIssues();

    const guardrailViolations = unresolved.filter((issue) => {
      if (issue.severity !== 'high' && issue.severity !== 'critical') return false;
      return (
        issue.id.startsWith('no-direct-comfyui-') ||
        issue.id.startsWith('no-direct-llm-') ||
        issue.id.startsWith('pipeline-orchestration-')
      );
    });

    if (guardrailViolations.length > 0) {
      console.error(`\nGuardian CI mode: FAIL (${guardrailViolations.length} guardrail violation(s))`);
      for (const issue of guardrailViolations.slice(0, 20)) {
        console.error(`- ${issue.file}:${issue.line ?? 1} ${issue.id}: ${issue.message}`);
      }
      if (guardrailViolations.length > 20) {
        console.error(`... and ${guardrailViolations.length - 20} more`);
      }
      process.exitCode = 1;
    } else {
      console.log('\nGuardian CI mode: PASS (no guardrail violations)');
    }

    if (createdPlaywrightLock) {
      try {
        if (fs.existsSync(playwrightLockPath)) {
          fs.unlinkSync(playwrightLockPath);
        }
      } catch {
        // best-effort cleanup
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// NEW TASK AND PROMPT HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Handle a task directive command
 */
async function handleTask(config: Partial<AgentConfig>, taskCommand: string): Promise<void> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const directiveManager = new DirectiveManager(fullConfig);

  console.log('\n' + '═'.repeat(60));
  console.log('  TASK DIRECTIVE');
  console.log('═'.repeat(60));
  console.log(`\n  Command: "${taskCommand}"\n`);

  // Parse and create directive
  const directive = directiveManager.createFromCommand(taskCommand);
  
  if (!directive) {
    console.log('  ❌ Could not parse task command.');
    console.log('\n  Examples:');
    console.log('    --task "fix typescript errors"');
    console.log('    --task "fix typescript errors in services/"');
    console.log('    --task "fill test gaps"');
    console.log('    --task "improve performance in components/"');
    console.log('\n' + '═'.repeat(60) + '\n');
    return;
  }

  console.log(`  ✅ Created directive: ${directive.id}`);
  console.log(`  📋 Type: ${directive.type}`);
  console.log(`  📝 Title: ${directive.title}`);
  console.log(`  📄 Description: ${directive.description}`);

  // Process directive (find issues and generate prompts)
  console.log('\n  Processing...');
  const prompts = await directiveManager.processDirective(directive.id);

  if (prompts.length === 0) {
    console.log('  ℹ️  No matching issues found.');
  } else {
    console.log(`\n  ✅ Generated ${prompts.length} prompts`);
    console.log('\n  📁 Prompt files:');
    for (const p of prompts.slice(0, 5)) {
      console.log(`     - agent/prompts/${p.targetFormat}/${p.filename}`);
    }
    if (prompts.length > 5) {
      console.log(`     ... and ${prompts.length - 5} more`);
    }

    // Ask user what to do next
    console.log('\n  📋 NEXT STEPS:');
    console.log('     1. View prompts: npm run guardian -- --list-prompts');
    console.log('     2. Copy a prompt: Get-Content "agent/prompts/chat/<file>.md" | Set-Clipboard');
    console.log('     3. Interactive mode: npm run guardian -- --interactive');
  }

  console.log('\n' + '═'.repeat(60) + '\n');
}

/**
 * Generate prompts for all unresolved issues
 */
async function generatePrompts(config: Partial<AgentConfig>): Promise<void> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const stateManager = new StateManager(fullConfig);
  const promptGenerator = new PromptGenerator(fullConfig);

  console.log('\n' + '═'.repeat(60));
  console.log('  GENERATING COPILOT PROMPTS');
  console.log('═'.repeat(60) + '\n');

  const issues = stateManager.getUnresolvedIssues();
  
  if (issues.length === 0) {
    console.log('  ✅ No unresolved issues. Project is healthy!');
    console.log('\n' + '═'.repeat(60) + '\n');
    return;
  }

  console.log(`  Found ${issues.length} unresolved issues`);
  console.log('  Generating prompts...\n');

  const prompts = promptGenerator.generatePrompts(issues);

  console.log(`  ✅ Generated ${prompts.length} prompts\n`);
  
  // Group by category
  const byCategory: Record<string, number> = {};
  for (const p of prompts) {
    byCategory[p.category] = (byCategory[p.category] || 0) + 1;
  }

  console.log('  📊 BY CATEGORY:');
  for (const [cat, count] of Object.entries(byCategory)) {
    console.log(`     ${cat}: ${count}`);
  }

  console.log('\n  📁 OUTPUT:');
  console.log('     Chat prompts: agent/prompts/chat/');
  console.log('     CLI prompts:  agent/prompts/cli/');
  console.log('     Index:        agent/prompts/INDEX.md');

  console.log('\n  📋 USAGE:');
  console.log('     • Copy to clipboard: Get-Content "agent/prompts/chat/<file>.md" | Set-Clipboard');
  console.log('     • Paste in VS Code Copilot Chat');
  console.log('     • Or use interactive mode: npm run guardian -- --interactive');

  console.log('\n' + '═'.repeat(60) + '\n');
}

/**
 * Interactive mode for selecting and executing tasks
 */
async function interactiveMode(config: Partial<AgentConfig>): Promise<void> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const stateManager = new StateManager(fullConfig);
  const promptGenerator = new PromptGenerator(fullConfig);
  const directiveManager = new DirectiveManager(fullConfig);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(prompt, resolve);
    });
  };

  console.log('\n' + '═'.repeat(60));
  console.log('  PROJECT GUARDIAN - INTERACTIVE MODE');
  console.log('═'.repeat(60) + '\n');

  const issues = stateManager.getUnresolvedIssues();
  console.log(`  📊 Current Issues: ${issues.length}\n`);

  // Show suggestions
  const suggestions = directiveManager.getSuggestedTasks();
  
  if (suggestions.length > 0) {
    console.log('  📋 SUGGESTED TASKS:\n');
    suggestions.forEach((s, i) => {
      console.log(`     [${i + 1}] ${s.title} (${s.issueCount} issues)`);
      console.log(`         Command: ${s.command}`);
    });
    console.log('');
  }

  console.log('  📝 OPTIONS:\n');
  console.log('     [a] Generate prompts for ALL issues');
  console.log('     [c] Enter custom task command');
  console.log('     [v] View a specific issue');
  console.log('     [l] List generated prompts');
  console.log('     [q] Quit\n');

  let running = true;
  while (running) {
    const choice = await question('  > Enter choice: ');

    switch (choice.toLowerCase()) {
      case 'q':
        running = false;
        break;

      case 'a':
        console.log('\n  Generating prompts for all issues...\n');
        const allPrompts = promptGenerator.generatePrompts(issues);
        console.log(`  ✅ Generated ${allPrompts.length} prompts`);
        console.log('     See: agent/prompts/INDEX.md\n');
        break;

      case 'c':
        const cmd = await question('  > Enter task command: ');
        if (cmd.trim()) {
          const directive = directiveManager.createFromCommand(cmd.trim());
          if (directive) {
            const prompts = await directiveManager.processDirective(directive.id);
            console.log(`\n  ✅ Generated ${prompts.length} prompts for: ${directive.title}\n`);
          } else {
            console.log('\n  ❌ Could not parse command\n');
          }
        }
        break;

      case 'v':
        console.log('\n  Issues:');
        issues.slice(0, 10).forEach((issue, i) => {
          console.log(`     [${i + 1}] ${issue.category}: ${issue.message.substring(0, 50)}...`);
        });
        const issueNum = await question('\n  > Enter issue number to view: ');
        const idx = parseInt(issueNum, 10) - 1;
        const issue = issues[idx];
        if (idx >= 0 && idx < issues.length && issue) {
          console.log('\n  ' + '─'.repeat(50));
          console.log(`  ID: ${issue.id}`);
          console.log(`  Category: ${issue.category}`);
          console.log(`  Severity: ${issue.severity}`);
          console.log(`  File: ${issue.file || 'N/A'}`);
          console.log(`  Line: ${issue.line || 'N/A'}`);
          console.log(`  Message: ${issue.message}`);
          console.log('  ' + '─'.repeat(50) + '\n');
          
          const gen = await question('  > Generate prompt for this issue? (y/n): ');
          if (gen.toLowerCase() === 'y') {
            const prompts = promptGenerator.generatePrompt(issue);
            console.log(`\n  ✅ Generated ${prompts.length} prompts`);
            prompts.forEach(p => console.log(`     - agent/prompts/${p.targetFormat}/${p.filename}`));
            console.log('');
          }
        }
        break;

      case 'l':
        const generated = promptGenerator.getGeneratedPrompts();
        console.log('\n  📁 GENERATED PROMPTS:');
        console.log(`     Chat: ${generated.chat.length} files`);
        console.log(`     CLI:  ${generated.cli.length} files`);
        console.log(`     Batch: ${generated.batch.length} files`);
        if (generated.chat.length > 0) {
          console.log('\n  Recent chat prompts:');
          generated.chat.slice(-5).forEach(f => console.log(`     - ${f}`));
        }
        console.log('');
        break;

      default:
        // Check if it's a suggestion number
        const num = parseInt(choice, 10);
        const suggestion = suggestions[num - 1];
        if (!isNaN(num) && num >= 1 && num <= suggestions.length && suggestion) {
          console.log(`\n  Executing: ${suggestion.command}\n`);
          const directive = directiveManager.createFromCommand(suggestion.command);
          if (directive) {
            const prompts = await directiveManager.processDirective(directive.id);
            console.log(`  ✅ Generated ${prompts.length} prompts\n`);
          }
        } else {
          console.log('  Unknown option. Try again.\n');
        }
    }
  }

  rl.close();
  console.log('\n  Goodbye!\n');
}

/**
 * List all generated prompts
 */
async function listPrompts(config: Partial<AgentConfig>): Promise<void> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const promptGenerator = new PromptGenerator(fullConfig);

  console.log('\n' + '═'.repeat(60));
  console.log('  GENERATED PROMPTS');
  console.log('═'.repeat(60) + '\n');

  const generated = promptGenerator.getGeneratedPrompts();

  console.log('  📁 CHAT PROMPTS (for VS Code Copilot Chat):\n');
  if (generated.chat.length === 0) {
    console.log('     (none)');
  } else {
    generated.chat.forEach(f => console.log(`     - ${f}`));
  }

  console.log('\n  📁 CLI PROMPTS (for GitHub Copilot CLI):\n');
  if (generated.cli.length === 0) {
    console.log('     (none)');
  } else {
    generated.cli.forEach(f => console.log(`     - ${f}`));
  }

  console.log('\n  📁 BATCH PROMPTS:\n');
  if (generated.batch.length === 0) {
    console.log('     (none)');
  } else {
    generated.batch.forEach(f => console.log(`     - ${f}`));
  }

  const total = generated.chat.length + generated.cli.length + generated.batch.length;
  console.log(`\n  Total: ${total} prompt files`);
  console.log('  Index: agent/prompts/INDEX.md');

  console.log('\n' + '═'.repeat(60) + '\n');
}

/**
 * Show a specific prompt
 */
async function showPrompt(config: Partial<AgentConfig>, filename: string): Promise<void> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const promptGenerator = new PromptGenerator(fullConfig);

  // Try to find the prompt in any format directory
  for (const format of ['chat', 'cli', 'batch'] as const) {
    const content = promptGenerator.readPrompt(filename, format);
    if (content) {
      console.log('\n' + '═'.repeat(60));
      console.log(`  PROMPT: ${filename} (${format})`);
      console.log('═'.repeat(60) + '\n');
      console.log(content);
      console.log('\n' + '═'.repeat(60) + '\n');
      return;
    }
  }

  console.log(`\n  ❌ Prompt not found: ${filename}`);
  console.log('  Use --list-prompts to see available prompts.\n');
}

/**
 * Clear all generated prompts
 */
async function clearPrompts(config: Partial<AgentConfig>): Promise<void> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const promptGenerator = new PromptGenerator(fullConfig);

  promptGenerator.clearPrompts();
  console.log('\n  ✅ Cleared all generated prompts.\n');
}

/**
 * Show suggested tasks based on current issues
 */
async function showSuggestions(config: Partial<AgentConfig>): Promise<void> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const directiveManager = new DirectiveManager(fullConfig);

  console.log('\n' + '═'.repeat(60));
  console.log('  SUGGESTED TASKS');
  console.log('═'.repeat(60) + '\n');

  const suggestions = directiveManager.getSuggestedTasks();

  if (suggestions.length === 0) {
    console.log('  ✅ No issues found. Project is healthy!');
  } else {
    console.log('  Based on current issues, here are suggested tasks:\n');
    suggestions.forEach((s, i) => {
      console.log(`  [${i + 1}] ${s.title}`);
      console.log(`      Issues: ${s.issueCount}`);
      console.log(`      Command: npm run guardian -- --task "${s.command}"`);
      console.log('');
    });
  }

  console.log('  📋 To execute a task:');
  console.log('     npm run guardian -- --task "<command>"');
  console.log('     npm run guardian -- --interactive');

  console.log('\n' + '═'.repeat(60) + '\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// E2E QUALITY & COHERENCE AUDIT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Run the E2E Quality & Coherence Audit
 * 
 * This command audits the entire CSG pipeline from user inputs to video generation,
 * checking for data flow integrity, prompt quality, narrative coherence, and bookend
 * workflow validation.
 * 
 * Usage: npm run guardian:e2e-audit
 *        npm run guardian -- --e2e-audit
 */
async function runE2EAudit(config: Partial<AgentConfig>): Promise<void> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const stateManager = new StateManager(fullConfig);
  const auditRunner = new E2EAuditTaskRunner(fullConfig, stateManager);

  console.log('\n' + '═'.repeat(60));
  console.log('  E2E QUALITY & COHERENCE AUDIT');
  console.log('═'.repeat(60));
  console.log('\n  Auditing the complete CSG pipeline...');
  console.log('  This may take a moment.\n');

  try {
    const result = await auditRunner.runFullAudit();

    console.log('  📁 REPORTS GENERATED:');
    for (const file of result.savedTo) {
      const basename = path.basename(file);
      console.log(`     - ${basename}`);
    }
    console.log('');

    // Show quick summary
    const issues = result.scanResult.issuesFound;
    const critical = issues.filter(i => i.severity === 'critical').length;
    const high = issues.filter(i => i.severity === 'high').length;

    if (critical > 0 || high > 0) {
      console.log('  ⚠️  ACTION REQUIRED:');
      if (critical > 0) console.log(`     🚨 ${critical} critical issues need immediate attention`);
      if (high > 0) console.log(`     ⚠️  ${high} high-priority issues should be addressed`);
      console.log('');
    }

    console.log('  📋 NEXT STEPS:');
    console.log('     1. Review: Get-Content "agent/reports/e2e-audit/summary-latest.md"');
    console.log('     2. Fix issues and re-run: npm run guardian:e2e-audit');
    console.log('     3. Generate fix prompts: npm run guardian -- -g');
    console.log('     4. Interactive mode: npm run guardian -- -i');

  } catch (error) {
    console.error('\n  ❌ Audit failed:', error);
    console.log('\n  Please check the logs and try again.');
  }

  console.log('\n' + '═'.repeat(60) + '\n');
}

// Run main
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
