#!/usr/bin/env node

const { spawn, exec } = require('child_process');
const { validatePorts } = require('./check-ports');
const util = require('util');
const execAsync = util.promisify(exec);

class RobustStartup {
  constructor(options = {}) {
    this.services = {
      neo4j: { name: 'Neo4j', status: 'waiting', port: '7687', healthEndpoint: 'http://localhost:7474' },
      backend: { name: 'Backend', status: 'waiting', port: '5002' },
      frontend: { name: 'Frontend', status: 'waiting', port: '3001' }
    };
    this.processes = [];
    this.forceReset = options.forceReset || false;
  }

  log(message, type = 'info') {
    const icons = {
      info: '🔄',
      success: '✅',
      error: '❌',
      warn: '⚠️',
      debug: '🔍'
    };
    const timestamp = new Date().toLocaleTimeString();
    console.log(`${icons[type]} [${timestamp}] ${message}`);
  }

  async checkPorts() {
    this.log('Checking port availability...');
    try {
      await validatePorts('development');
      return true;
    } catch (error) {
      this.log(`Port check failed: ${error.message}`, 'error');
      return false;
    }
  }

  async cleanupExistingServices() {
    this.log('Cleaning up existing services...');
    
    try {
      // Stop any running Docker containers
      await execAsync('docker compose down --remove-orphans').catch(() => {});
      
      // Kill any processes using our ports
      const ports = ['5002', '3001', '7474', '7687'];
      for (const port of ports) {
        try {
          await execAsync(`lsof -ti:${port} | xargs kill -9`).catch(() => {});
        } catch (e) {
          // Port not in use, continue
        }
      }
      
      this.log('Cleanup completed', 'success');
    } catch (error) {
      this.log(`Cleanup warning: ${error.message}`, 'warn');
    }
  }

  async startDockerServices() {
    this.log('Starting Docker services...');
    
    try {
      // Force rebuild and start fresh
      await execAsync('docker compose up -d --force-recreate --renew-anon-volumes');
      this.log('Docker services started', 'success');
      return true;
    } catch (error) {
      this.log(`Docker startup failed: ${error.message}`, 'error');
      
      // Try to get more diagnostics
      try {
        const { stdout } = await execAsync('docker compose logs --tail=10');
        this.log('Docker logs:', 'debug');
        console.log(stdout);
      } catch (e) {
        // Ignore log errors
      }
      
      return false;
    }
  }

  async waitForNeo4j() {
    this.log('Waiting for Neo4j to be ready...');
    
    const neo4j = require('neo4j-driver');
    const driver = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('neo4j', 'password123'));
    
    let retries = 60; // Increase timeout for DozerDB
    let healthCheckPassed = false;
    
    while (retries > 0) {
      try {
        // First check if the HTTP endpoint is responding
        try {
          await execAsync('curl -f http://localhost:7474 >/dev/null 2>&1', { timeout: 5000 });
          healthCheckPassed = true;
        } catch (e) {
          // HTTP not ready yet
        }
        
        // Then test Bolt connection
        const session = driver.session();
        const result = await session.run('RETURN 1 as test');
        await session.close();
        
        if (result.records.length > 0) {
          this.services.neo4j.status = 'ready';
          this.log('Neo4j: Connected and ready', 'success');
          break;
        }
      } catch (error) {
        retries--;
        
        if (retries % 5 === 0) { // Log every 5 attempts
          this.log(`Neo4j connection attempt ${60 - retries}/60: ${error.message}`, 'debug');
        }
        
        if (retries > 0) {
          process.stdout.write(`\r🔄 Waiting for Neo4j... ${60 - retries}/60   `);
          await new Promise(r => setTimeout(r, 2000));
        } else {
          console.log(''); // New line
          
          // Diagnostic information
          this.log('Neo4j connection failed - running diagnostics...', 'error');
          
          try {
            const { stdout: containerStatus } = await execAsync('docker ps --filter "name=neo4j"');
            this.log('Container status:', 'debug');
            console.log(containerStatus);
            
            const { stdout: logs } = await execAsync('docker compose logs neo4j --tail=20');
            this.log('Recent Neo4j logs:', 'debug');
            console.log(logs);
          } catch (e) {
            this.log('Could not gather diagnostics', 'warn');
          }
          
          throw new Error('Neo4j failed to start within 120 seconds');
        }
      }
    }
    
    console.log(''); // Clean line after progress
    await driver.close();
  }

  async initializeDatabase(forceReset = false) {
    const neo4j = require('neo4j-driver');
    const driver = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('neo4j', 'password123'));
    
    try {
      // Check if database already has data
      if (!forceReset) {
        this.log('Checking existing database content...');
        const session = driver.session();
        
        try {
          const result = await session.run('MATCH (n) RETURN count(n) as nodeCount');
          const nodeCount = result.records[0].get('nodeCount').toNumber();
          await session.close();
          
          if (nodeCount > 0) {
            this.log(`Database contains ${nodeCount} nodes - preserving existing data`, 'success');
            this.log('Use --force-reset flag to reload sample data', 'info');
            return true;
          } else {
            this.log('Database is empty - loading sample data...');
          }
        } catch (error) {
          await session.close();
          this.log(`Database check failed: ${error.message}`, 'warn');
          this.log('Proceeding with sample data initialization...', 'info');
        }
      } else {
        this.log('Force reset requested - reloading sample data...');
      }
      
      // Load sample data
      const { stdout } = await execAsync('node scripts/reset-db.js');
      this.log('Sample data loaded successfully', 'success');
      return true;
      
    } catch (error) {
      this.log(`Database initialization failed: ${error.message}`, 'warn');
      this.log('Application will start without sample data', 'info');
      return false;
    } finally {
      await driver.close();
    }
  }

  startBackend() {
    this.log('Starting backend server...');
    
    const backend = spawn('nodemon', ['server/index.js'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { 
        ...process.env, 
        NODE_ENV: 'development',
        PORT: '5002'
      }
    });

    let startupComplete = false;

    backend.stdout.on('data', (data) => {
      const output = data.toString();
      
      // Look for server startup confirmation
      if ((output.includes('Server running on port') || output.includes('listening on')) && !startupComplete) {
        startupComplete = true;
        this.services.backend.status = 'ready';
        this.log('Backend: Running on http://localhost:5002', 'success');
      }
      
      // Log significant backend messages
      if (output.includes('Error') || output.includes('Connected to Neo4j')) {
        console.log('Backend:', output.trim());
      }
    });

    backend.stderr.on('data', (data) => {
      const error = data.toString();
      if (!error.includes('[nodemon]') && !error.includes('DeprecationWarning')) {
        console.error('Backend error:', error.trim());
      }
    });

    backend.on('error', (error) => {
      this.log(`Backend process error: ${error.message}`, 'error');
    });

    this.processes.push(backend);
    return backend;
  }

  startFrontend() {
    this.log('Starting frontend server...');
    
    const frontend = spawn('npm', ['start'], {
      cwd: 'client',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { 
        ...process.env, 
        PORT: '3001',
        BROWSER: 'none',
        GENERATE_SOURCEMAP: 'false',
        REACT_APP_CLEAN_OUTPUT: 'true',
        TSC_COMPILE_ON_ERROR: 'true',
        ESLINT_NO_DEV_ERRORS: 'true'
      }
    });

    let startupComplete = false;

    frontend.stdout.on('data', (data) => {
      const output = data.toString();
      
      if ((output.includes('webpack compiled successfully') || 
           output.includes('compiled successfully')) && !startupComplete) {
        startupComplete = true;
        this.services.frontend.status = 'ready';
        this.log('Frontend: Running on http://localhost:3001', 'success');
        this.showFinalStatus();
      }
      
      // Filter out noise but show important messages
      if (output.includes('Failed to compile') || 
          output.includes('Error') ||
          output.includes('Warning')) {
        console.log('Frontend:', output.trim());
      }
    });

    frontend.stderr.on('data', (data) => {
      const error = data.toString();
      
      // Filter out common React dev noise
      const noisePatterns = [
        'DeprecationWarning',
        'webpack-dev-server',
        'DEP_WEBPACK',
        'source-map-loader',
        'Critical dependency'
      ];
      
      if (!noisePatterns.some(pattern => error.includes(pattern))) {
        console.error('Frontend error:', error.trim());
      }
    });

    frontend.on('error', (error) => {
      this.log(`Frontend process error: ${error.message}`, 'error');
    });

    this.processes.push(frontend);
    return frontend;
  }

  showFinalStatus() {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 AI Catalog - Robust Development Environment Ready!');
    console.log('='.repeat(60));
    console.log(`✅ Neo4j Database:  bolt://localhost:7687`);
    console.log(`✅ Neo4j Browser:   http://localhost:7474`);
    console.log(`✅ Backend API:     http://localhost:5002`);
    console.log(`✅ Frontend App:    http://localhost:3001`);
    console.log('='.repeat(60));
    console.log('💡 Tips:');
    console.log('   • Access Neo4j Browser for direct DB queries');
    console.log('   • Backend logs show Neo4j connectivity status');
    console.log('   • Press Ctrl+C to gracefully shutdown all services');
    console.log('   • Use "npm run robust:restart" to reset everything');
    console.log('='.repeat(60));
    console.log('');
  }

  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      this.log(`\nReceived ${signal} - shutting down gracefully...`);
      
      // Kill all spawned processes
      for (const process of this.processes) {
        if (process && !process.killed) {
          process.kill('SIGTERM');
        }
      }
      
      // Stop docker services
      try {
        await execAsync('docker compose down --remove-orphans');
        this.log('Docker services stopped', 'success');
      } catch (error) {
        this.log('Error stopping Docker services', 'warn');
      }
      
      this.log('All services stopped - goodbye!', 'success');
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  }

  async start() {
    console.clear();
    console.log('🚀 AI Catalog - Robust Development Environment');
    console.log('===============================================\n');

    try {
      // Step 1: Port validation
      const portsAvailable = await this.checkPorts();
      if (!portsAvailable) {
        process.exit(1);
      }

      // Step 2: Cleanup any existing services
      await this.cleanupExistingServices();

      // Step 3: Start Docker services with better error handling
      const dockerStarted = await this.startDockerServices();
      if (!dockerStarted) {
        this.log('Failed to start Docker services', 'error');
        process.exit(1);
      }

      // Step 4: Wait for Neo4j to be completely ready
      await this.waitForNeo4j();

      // Step 5: Initialize database (smart conditional loading)
      await this.initializeDatabase(this.forceReset);

      // Step 6: Start application services
      this.setupGracefulShutdown();
      this.startBackend();
      this.startFrontend();

    } catch (error) {
      this.log(`Startup failed: ${error.message}`, 'error');
      
      // Cleanup on failure
      try {
        await execAsync('docker compose down');
      } catch (e) {
        // Ignore cleanup errors
      }
      
      process.exit(1);
    }
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const forceReset = args.includes('--force-reset') || args.includes('-f');
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log('AI Catalog Robust Startup');
    console.log('');
    console.log('Usage: node scripts/robust-startup.js [options]');
    console.log('');
    console.log('Options:');
    console.log('  --force-reset, -f  Force reload sample data (destroys existing data)');
    console.log('  --help, -h         Show this help message');
    console.log('');
    console.log('Examples:');
    console.log('  node scripts/robust-startup.js              # Smart startup (preserves data)');
    console.log('  node scripts/robust-startup.js --force-reset # Reset and reload sample data');
    console.log('  npm run dev                                  # Smart startup via npm');
    console.log('  npm run dev:reset                            # Force reset via npm');
    process.exit(0);
  }
  
  const startup = new RobustStartup({ forceReset });
  startup.start();
}

module.exports = RobustStartup;