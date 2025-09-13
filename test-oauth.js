require('dotenv').config();
const createDriver = require('./server/auth/createDriver');

async function testOAuthConnection() {
  console.log('Testing Neo4j OAuth connection...');
  
  // Check environment variables
  if (!process.env.NEO4J_CLIENT_ID || !process.env.NEO4J_CLIENT_SECRET) {
    console.error('❌ Missing NEO4J_CLIENT_ID or NEO4J_CLIENT_SECRET in .env file');
    console.log('Please update your .env file with:');
    console.log('NEO4J_CLIENT_ID=your-client-id');
    console.log('NEO4J_CLIENT_SECRET=your-client-secret');
    return;
  }
  
  console.log('✅ Environment variables found');
  console.log('URI:', process.env.NEO4J_URI);
  console.log('Client ID:', process.env.NEO4J_CLIENT_ID ? '***' + process.env.NEO4J_CLIENT_ID.slice(-4) : 'not set');
  
  const driver = createDriver();
  
  try {
    console.log('🔄 Testing database connection...');
    const session = driver.session();
    
    // Test basic connectivity
    const result = await session.run('RETURN 1 as test');
    console.log('✅ Database connection successful!');
    console.log('Test result:', result.records[0].get('test'));
    
    await session.close();
  } catch (error) {
    console.error('❌ Database connection failed:');
    console.error('Error:', error.message);
    
    if (error.message.includes('authentication')) {
      console.log('\n🔧 This might be an authentication issue. Please verify:');
      console.log('1. Your client ID and secret are correct');
      console.log('2. Your Aura instance supports OAuth authentication');
      console.log('3. Your client credentials have database access permissions');
    }
  } finally {
    await driver.close();
  }
}

testOAuthConnection().catch(console.error);