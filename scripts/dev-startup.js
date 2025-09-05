#!/usr/bin/env node

const { spawn } = require('child_process');
const { validatePorts } = require('./check-ports');

class DevStartup {
  constructor() {
    this.services = {
      neo4j: { name: 'Neo4j', status: 'waiting', port: '7687' },
      backend: { name: 'Backend', status: 'waiting', port: '5002' },
      frontend: { name: 'Frontend', status: 'waiting', port: '3001' }
    };
  }

  log(message, type = 'info') {
    const icons = {
      info: '🔄',
      success: '✅',
      error: '❌',
      warn: '⚠️'
    };
    console.log(`${icons[type]} ${message}`);
  }

  async checkPorts() {
    console.log('🔍 Checking port availability...\n');
    try {
      await validatePorts('development');
      return true;
    } catch (error) {
      return false;
    }
  }

  async startServices() {
    this.log('Starting Docker services...');
    
    return new Promise((resolve, reject) => {
      const docker = spawn('docker', ['compose', 'up', '-d', '--quiet-pull'], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      docker.on('close', (code) => {
        if (code === 0) {
          this.services.neo4j.status = 'starting';
          this.log('Docker services started');
          resolve();
        } else {
          reject(new Error(`Docker failed with exit code ${code}`));
        }
      });

      docker.on('error', reject);
    });
  }

  async waitForNeo4j() {
    this.log('Waiting for Neo4j connection...');
    
    const neo4j = require('neo4j-driver');
    const driver = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('neo4j', 'password123'));
    
    let retries = 30; // Keep original timeout for reliability
    let dots = '';
    
    while (retries > 0) {
      try {
        const session = driver.session();
        await session.run('RETURN 1');
        await session.close();
        
        this.services.neo4j.status = 'ready';
        this.log('Neo4j: Connected', 'success');
        break;
      } catch (error) {
        retries--;
        dots += '.';
        if (dots.length > 3) dots = '';
        
        if (retries > 0) {
          process.stdout.write(`\r🔄 Waiting for Neo4j connection${dots}   `);
          await new Promise(r => setTimeout(r, 2000));
        } else {
          console.log(''); // New line after dots
          this.log('Neo4j connection failed - checking Docker status...', 'warn');
          
          // Try to diagnose the issue
          try {
            const { exec } = require('child_process');
            await new Promise((resolve) => {
              exec('docker ps --filter "name=neo4j"', (error, stdout) => {
                if (stdout.includes('neo4j')) {
                  this.log('Neo4j container is running - retrying connection...', 'warn');
                } else {
                  this.log('Neo4j container not found - run: docker compose up -d', 'error');
                }
                resolve();
              });
            });
          } catch (e) {
            // Ignore diagnostic errors
          }
          
          throw new Error('Neo4j failed to start within timeout');
        }
      }
    }
    
    console.log(''); // Clean line after success
    await driver.close();
  }

  startBackend() {
    this.log('Starting backend server...');
    
    const backend = spawn('nodemon', ['server/index.js'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'development' }
    });

    backend.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('Server running on port')) {
        this.services.backend.status = 'ready';
        this.log('Backend: Running on http://localhost:5002', 'success');
      }
    });

    backend.stderr.on('data', (data) => {
      const error = data.toString();
      if (!error.includes('[nodemon]')) { // Filter out nodemon messages
        console.error('Backend error:', error);
      }
    });

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
        BROWSER: 'none', // Prevent auto-opening browser
        GENERATE_SOURCEMAP: 'false' // Faster builds
      }
    });

    let startupComplete = false;

    frontend.stdout.on('data', (data) => {
      const output = data.toString();
      
      // Look for successful compilation
      if (output.includes('webpack compiled successfully') && !startupComplete) {
        startupComplete = true;
        this.services.frontend.status = 'ready';
        this.log('Frontend: Running on http://localhost:3001', 'success');
        this.showFinalStatus();
      }
    });

    frontend.stderr.on('data', (data) => {
      const error = data.toString();
      // Suppress deprecation warnings and other noise
      if (!error.includes('DeprecationWarning') && 
          !error.includes('webpack-dev-server') &&
          !error.includes('DEP_WEBPACK')) {
        console.error('Frontend error:', error);
      }
    });

    return frontend;
  }

  showFinalStatus() {
    console.log('\n' + '='.repeat(50));
    console.log('🚀 AI Catalog ready for development!');
    console.log('='.repeat(50));
    console.log(`✅ Neo4j:    bolt://localhost:7687`);
    console.log(`✅ Backend:  http://localhost:5002`);
    console.log(`✅ Frontend: http://localhost:3001`);
    console.log('='.repeat(50));
    console.log('💡 Press Ctrl+C to stop all services');
    console.log('');
  }

  async start() {
    console.clear(); // Clear terminal for clean output
    console.log('🚀 AI Catalog Development Environment\n');

    try {
      // Check ports first
      const portsAvailable = await this.checkPorts();
      if (!portsAvailable) {
        process.exit(1);
      }

      // Start services sequentially for better feedback
      await this.startServices();
      await this.waitForNeo4j();
      
      // Start backend and frontend in parallel
      const backend = this.startBackend();
      const frontend = this.startFrontend();

      // Handle graceful shutdown
      process.on('SIGINT', () => {
        console.log('\n🛑 Shutting down services...');
        backend.kill();
        frontend.kill();
        
        // Stop docker services
        const dockerDown = spawn('docker', ['compose', 'down', '--remove-orphans'], {
          stdio: 'ignore'
        });
        
        dockerDown.on('close', () => {
          console.log('✅ All services stopped');
          process.exit(0);
        });
      });

    } catch (error) {
      this.log(`Startup failed: ${error.message}`, 'error');
      process.exit(1);
    }
  }
}

// CLI usage
if (require.main === module) {
  const startup = new DevStartup();
  startup.start();
}

module.exports = DevStartup;