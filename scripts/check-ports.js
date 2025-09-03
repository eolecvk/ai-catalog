#!/usr/bin/env node

const net = require('net');
require('dotenv').config();

// Port configurations
const CONFIGS = {
  development: {
    backend: process.env.BACKEND_PORT || process.env.PORT || 5002,
    frontend: process.env.FRONTEND_PORT || 3001,
    description: 'Development Environment'
  },
  test: {
    backend: 5004,
    frontend: 3004,
    description: 'Test Environment'
  }
};

/**
 * Check if a port is available
 * @param {number} port - Port to check
 * @returns {Promise<boolean>} - True if available, false if in use
 */
function checkPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    
    server.listen(port, () => {
      server.once('close', () => resolve(true));
      server.close();
    });
    
    server.on('error', () => resolve(false));
  });
}

/**
 * Get currently running processes on ports
 * @param {number} port - Port to check
 * @returns {Promise<{process: string, pid: string, command: string}>} - Process details
 */
async function getPortProcess(port) {
  const { exec } = require('child_process');
  
  return new Promise((resolve) => {
    exec(`lsof -ti:${port}`, (error, stdout) => {
      if (error || !stdout.trim()) {
        resolve({ process: '', pid: '', command: '' });
        return;
      }
      
      const pid = stdout.trim().split('\n')[0]; // Take first PID if multiple
      
      // Get process name and command
      exec(`ps -p ${pid} -o comm=,args=`, (error, stdout) => {
        if (error || !stdout.trim()) {
          resolve({ process: '', pid: pid, command: '' });
          return;
        }
        
        const lines = stdout.trim().split('\n');
        if (lines.length > 0) {
          const parts = lines[0].split(/\s+/);
          const process = parts[0] || '';
          const command = lines[0] || '';
          resolve({ process, pid, command });
        } else {
          resolve({ process: '', pid: pid, command: '' });
        }
      });
    });
  });
}

/**
 * Validate port configuration
 * @param {string} env - Environment (development/test)
 */
async function validatePorts(env = 'development') {
  const config = CONFIGS[env];
  if (!config) {
    console.error(`❌ Unknown environment: ${env}`);
    process.exit(1);
  }
  
  console.log(`🔍 Checking ports for ${config.description}...`);
  console.log(`   Backend:  ${config.backend}`);
  console.log(`   Frontend: ${config.frontend}`);
  console.log('');
  
  const backendAvailable = await checkPort(config.backend);
  const frontendAvailable = await checkPort(config.frontend);
  
  let hasConflicts = false;
  const conflictingProcesses = [];
  
  // Check backend port
  if (!backendAvailable) {
    const processInfo = await getPortProcess(config.backend);
    console.log(`❌ Backend port ${config.backend} is in use${processInfo.process ? ` by ${processInfo.process}` : ''}`);
    if (processInfo.pid) {
      conflictingProcesses.push({
        port: config.backend,
        type: 'backend',
        ...processInfo
      });
    }
    hasConflicts = true;
  } else {
    console.log(`✅ Backend port ${config.backend} is available`);
  }
  
  // Check frontend port
  if (!frontendAvailable) {
    const processInfo = await getPortProcess(config.frontend);
    console.log(`❌ Frontend port ${config.frontend} is in use${processInfo.process ? ` by ${processInfo.process}` : ''}`);
    if (processInfo.pid) {
      conflictingProcesses.push({
        port: config.frontend,
        type: 'frontend',
        ...processInfo
      });
    }
    hasConflicts = true;
  } else {
    console.log(`✅ Frontend port ${config.frontend} is available`);
  }
  
  if (hasConflicts) {
    console.log('');
    console.log('🚨 Port conflicts detected!');
    console.log('');
    
    // Provide targeted solutions based on actual processes
    console.log('💡 Recommended solutions:');
    console.log('');
    
    // Solution 1: Kill specific processes
    console.log('1. Stop the specific conflicting processes:');
    if (conflictingProcesses.length > 0) {
      conflictingProcesses.forEach(proc => {
        console.log(`   kill -9 ${proc.pid}  # Stop ${proc.type} (${proc.process}) on port ${proc.port}`);
      });
      console.log('   # Or kill all at once:');
      const pids = conflictingProcesses.map(p => p.pid).join(' ');
      console.log(`   kill -9 ${pids}`);
    } else {
      console.log(`   lsof -ti:${config.backend} | xargs kill -9  # Force kill backend`);
      console.log(`   lsof -ti:${config.frontend} | xargs kill -9  # Force kill frontend`);
    }
    console.log('');
    
    // Solution 2: Alternative kill methods
    console.log('2. Alternative methods if above fails:');
    const hasNode = conflictingProcesses.some(p => p.process.includes('node'));
    const hasNpm = conflictingProcesses.some(p => p.command.includes('npm'));
    
    if (hasNode) {
      console.log('   pkill -f "node.*server"     # Kill node server processes');
    }
    if (hasNpm) {
      console.log('   pkill -f "npm.*start"       # Kill npm start processes');
      console.log('   pkill -f "react-scripts"    # Kill React dev server');
    }
    console.log(`   fuser -k ${config.backend}/tcp  # Force kill anything on backend port`);
    console.log(`   fuser -k ${config.frontend}/tcp # Force kill anything on frontend port`);
    console.log('');
    
    // Solution 3: Use different environment
    console.log('3. Use different environment:');
    if (env === 'development') {
      console.log('   npm run test:dev        # Use test ports (5004/3004)');
    } else {
      console.log('   npm run dev             # Use development ports (5002/3001)');
    }
    console.log('');
    
    // Solution 4: Check what's running
    console.log('4. Investigate further:');
    console.log('   lsof -i :5002 -i :3001     # See what\'s using these ports');
    console.log('   ps aux | grep node         # Find all node processes');
    console.log('');
    
    process.exit(1);
  }
  
  console.log('🎉 All ports are available!');
  return true;
}

// CLI usage
if (require.main === module) {
  const env = process.argv[2] || 'development';
  validatePorts(env).catch(console.error);
}

module.exports = { validatePorts, checkPort, CONFIGS };