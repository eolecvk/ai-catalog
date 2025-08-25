const neo4j = require('neo4j-driver');
const fs = require('fs');
require('dotenv').config();

const driver = neo4j.driver(
  process.env.NEO4J_URI || 'bolt://localhost:7687',
  neo4j.auth.basic(
    process.env.NEO4J_USERNAME || 'neo4j',
    process.env.NEO4J_PASSWORD || 'password'
  )
);

async function initializeDatabase() {
  const session = driver.session();
  
  try {
    // Clear existing data
    console.log('Clearing existing data...');
    await session.run('MATCH (n) DETACH DELETE n');
    
    const cypherScript = fs.readFileSync('catalog_2.cypher', 'utf8');
    
    // Split into logical blocks
    const blocks = cypherScript.split(/\n\s*\n/).filter(block => 
      block.trim() && !block.trim().startsWith('//')
    );
    
    for (const block of blocks) {
      const cleanBlock = block
        .split('\n')
        .filter(line => !line.trim().startsWith('//') && line.trim())
        .join('\n')
        .trim();
      
      if (cleanBlock) {
        console.log('Executing block:', cleanBlock.substring(0, 100) + '...');
        try {
          await session.run(cleanBlock);
          console.log('✓ Success');
        } catch (error) {
          console.error('✗ Error:', error.message);
        }
      }
    }
    
    console.log('\n🎉 Database initialized successfully!');
    
    // Verify data
    console.log('\nVerifying data...');
    const result = await session.run('MATCH (n) RETURN labels(n)[0] as type, count(*) as count ORDER BY type');
    result.records.forEach(record => {
      console.log(`${record.get('type')}: ${record.get('count')}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await session.close();
    await driver.close();
  }
}

initializeDatabase();