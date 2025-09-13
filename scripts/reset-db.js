const fs = require('fs');
const path = require('path');
require('dotenv').config();

const createDriver = require('../server/auth/createDriver');
const driver = createDriver();

async function resetDatabase() {
  const session = driver.session();
  
  try {
    console.log('🗑️  Clearing existing database...');
    await session.run('MATCH (n) DETACH DELETE n');
    console.log('✅ Database cleared successfully');
    
    // Check if we have the cypher file to load
    const cypherFile = path.join(__dirname, '..', 'catalog.cypher');
    
    if (!fs.existsSync(cypherFile)) {
      console.log('⚠️  catalog.cypher file not found. Database cleared but not repopulated.');
      return;
    }
    
    console.log(`📂 Loading data from ${path.basename(cypherFile)}...`);
    
    const cypherScript = fs.readFileSync(cypherFile, 'utf8');
    
    // Process the cypher script line by line and group statements
    const lines = cypherScript.split('\n');
    let currentStatement = '';
    let successCount = 0;
    let errorCount = 0;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Skip comments and empty lines
      if (!trimmedLine || trimmedLine.startsWith('//')) {
        continue;
      }
      
      currentStatement += line + '\n';
      
      // Execute when we hit a semicolon at the end of a line
      if (trimmedLine.endsWith(';')) {
        const statementToExecute = currentStatement.replace(/;$/, '').trim();
        
        if (statementToExecute) {
          try {
            await session.run(statementToExecute);
            console.log(`✅ Executed: ${statementToExecute.substring(0, 60)}...`);
            successCount++;
          } catch (error) {
            console.error(`❌ Error executing: ${statementToExecute.substring(0, 60)}...`);
            console.error(`   ${error.message}`);
            errorCount++;
          }
        }
        
        currentStatement = '';
      }
    }
    
    // Execute any remaining statement
    if (currentStatement.trim()) {
      const statementToExecute = currentStatement.trim();
      try {
        await session.run(statementToExecute);
        console.log(`✅ Executed: ${statementToExecute.substring(0, 60)}...`);
        successCount++;
      } catch (error) {
        console.error(`❌ Error executing: ${statementToExecute.substring(0, 60)}...`);
        console.error(`   ${error.message}`);
        errorCount++;
      }
    }
    
    console.log(`\n📊 Summary: ${successCount} successful, ${errorCount} errors`);
    
    // Verify final state
    console.log('\n🔍 Verifying database state...');
    const result = await session.run('MATCH (n) RETURN labels(n)[0] as type, count(*) as count ORDER BY type');
    
    if (result.records.length === 0) {
      console.log('   Database is empty');
    } else {
      console.log('   Node counts by type:');
      result.records.forEach(record => {
        const type = record.get('type') || 'Unknown';
        const count = record.get('count');
        console.log(`     ${type}: ${count}`);
      });
    }
    
    console.log('\n🎉 Database reset completed!');
    
  } catch (error) {
    console.error('❌ Error during database reset:', error.message);
    process.exit(1);
  } finally {
    await session.close();
    await driver.close();
  }
}

// Handle process termination gracefully
process.on('SIGINT', async () => {
  console.log('\n🛑 Received interrupt signal, closing connections...');
  await driver.close();
  process.exit(0);
});

resetDatabase();