require('dotenv').config();

const createDriver = require('./server/auth/createDriver');
const driver = createDriver();

const queries = [
  // Create Industries
  "MERGE (b:Industry {name: 'Banking'})",
  "MERGE (i:Industry {name: 'Insurance'})",
  
  // Create Sectors
  "MERGE (rb:Sector {name: 'Retail Banking'})",
  "MERGE (cb:Sector {name: 'Commercial Banking'})",
  "MERGE (ib:Sector {name: 'Investment Banking'})",
  "MERGE (pb:Sector {name: 'Private Banking'})",
  "MERGE (cu:Sector {name: 'Credit Unions'})",
  "MERGE (ob:Sector {name: 'Online Banking'})",
  "MERGE (li:Sector {name: 'Life Insurance'})",
  "MERGE (hi:Sector {name: 'Health Insurance'})",
  "MERGE (pi:Sector {name: 'Property Insurance'})",
  "MERGE (ci:Sector {name: 'Casualty Insurance'})",
  
  // Create Pain Points
  "MERGE (pp_loan_risk:PainPoint {name: 'Inaccurate Loan Default Prediction'})",
  "MERGE (pp_cc_fraud:PainPoint {name: 'High-Volume Transaction Fraud'})",
  "MERGE (pp_claim_fraud:PainPoint {name: 'Fraudulent & Inflated Claims'})",
  "MERGE (pp_cust_churn:PainPoint {name: 'High Customer Churn Rate'})",
  "MERGE (pp_call_volume:PainPoint {name: 'Overloaded Call Center Staff'})",
  "MERGE (pp_slow_claims:PainPoint {name: 'Slow & Manual Claims Processing'})",
  "MERGE (pp_health_fraud:PainPoint {name: 'Upcoding & Service Unbundling Fraud'})",
  
  // Link Industries to Sectors
  "MATCH (b:Industry {name: 'Banking'}), (rb:Sector {name: 'Retail Banking'}) MERGE (b)-[:HAS_SECTOR]->(rb)",
  "MATCH (b:Industry {name: 'Banking'}), (cb:Sector {name: 'Commercial Banking'}) MERGE (b)-[:HAS_SECTOR]->(cb)",
  "MATCH (b:Industry {name: 'Banking'}), (ib:Sector {name: 'Investment Banking'}) MERGE (b)-[:HAS_SECTOR]->(ib)",
  "MATCH (b:Industry {name: 'Banking'}), (pb:Sector {name: 'Private Banking'}) MERGE (b)-[:HAS_SECTOR]->(pb)",
  "MATCH (b:Industry {name: 'Banking'}), (cu:Sector {name: 'Credit Unions'}) MERGE (b)-[:HAS_SECTOR]->(cu)",
  "MATCH (b:Industry {name: 'Banking'}), (ob:Sector {name: 'Online Banking'}) MERGE (b)-[:HAS_SECTOR]->(ob)",
  "MATCH (i:Industry {name: 'Insurance'}), (li:Sector {name: 'Life Insurance'}) MERGE (i)-[:HAS_SECTOR]->(li)",
  "MATCH (i:Industry {name: 'Insurance'}), (hi:Sector {name: 'Health Insurance'}) MERGE (i)-[:HAS_SECTOR]->(hi)",
  "MATCH (i:Industry {name: 'Insurance'}), (pi:Sector {name: 'Property Insurance'}) MERGE (i)-[:HAS_SECTOR]->(pi)",
  "MATCH (i:Industry {name: 'Insurance'}), (ci:Sector {name: 'Casualty Insurance'}) MERGE (i)-[:HAS_SECTOR]->(ci)",
  
  // Link Sectors to Pain Points
  "MATCH (rb:Sector {name: 'Retail Banking'}), (pp:PainPoint {name: 'Inaccurate Loan Default Prediction'}) MERGE (rb)-[:EXPERIENCES]->(pp)",
  "MATCH (rb:Sector {name: 'Retail Banking'}), (pp:PainPoint {name: 'High-Volume Transaction Fraud'}) MERGE (rb)-[:EXPERIENCES]->(pp)",
  "MATCH (rb:Sector {name: 'Retail Banking'}), (pp:PainPoint {name: 'Overloaded Call Center Staff'}) MERGE (rb)-[:EXPERIENCES]->(pp)",
  "MATCH (ob:Sector {name: 'Online Banking'}), (pp:PainPoint {name: 'High-Volume Transaction Fraud'}) MERGE (ob)-[:EXPERIENCES]->(pp)",
  "MATCH (cb:Sector {name: 'Commercial Banking'}), (pp:PainPoint {name: 'Inaccurate Loan Default Prediction'}) MERGE (cb)-[:EXPERIENCES]->(pp)",
  "MATCH (pi:Sector {name: 'Property Insurance'}), (pp:PainPoint {name: 'Fraudulent & Inflated Claims'}) MERGE (pi)-[:EXPERIENCES]->(pp)",
  "MATCH (pi:Sector {name: 'Property Insurance'}), (pp:PainPoint {name: 'Slow & Manual Claims Processing'}) MERGE (pi)-[:EXPERIENCES]->(pp)",
  "MATCH (hi:Sector {name: 'Health Insurance'}), (pp:PainPoint {name: 'Upcoding & Service Unbundling Fraud'}) MERGE (hi)-[:EXPERIENCES]->(pp)",
  "MATCH (hi:Sector {name: 'Health Insurance'}), (pp:PainPoint {name: 'Slow & Manual Claims Processing'}) MERGE (hi)-[:EXPERIENCES]->(pp)",
  "MATCH (li:Sector {name: 'Life Insurance'}), (pp:PainPoint {name: 'Fraudulent & Inflated Claims'}) MERGE (li)-[:EXPERIENCES]->(pp)",
  
  // Create Project Opportunities
  `CREATE (opp1:ProjectOpportunity {
    title: 'Next-Gen Credit Scoring for Retail Mortgages',
    priority: 'High',
    business_case: 'Improve mortgage approval accuracy and reduce defaults by using alternative data sources and mitigating model bias.'
  })`,
  
  `CREATE (opp2:ProjectOpportunity {
    title: 'Real-Time Transaction Fraud for Online Banking',
    priority: 'High',
    business_case: 'Monitor streaming transactions to block fraudulent payments and account takeovers in real-time.'
  })`,
  
  `CREATE (opp3:ProjectOpportunity {
    title: 'Automated Claims Fraud Analysis for Property Insurance',
    priority: 'Medium',
    business_case: 'Analyze submitted documents and claim patterns to flag suspicious or inflated claims for manual review.'
  })`,
  
  `CREATE (opp4:ProjectOpportunity {
    title: 'AI-Powered Omni-Channel Support for Bank Customers',
    priority: 'High',
    business_case: 'Reduce call center load and improve customer satisfaction by providing 24/7 support via chatbots and virtual assistants.'
  })`,
  
  `CREATE (opp5:ProjectOpportunity {
    title: 'Intelligent Claims Processing for Health Insurance',
    priority: 'High',
    business_case: 'Accelerate claims processing, reduce manual errors, and improve provider satisfaction using OCR and automated triage.'
  })`,
  
  // Link Projects to Sectors and Pain Points
  "MATCH (rb:Sector {name: 'Retail Banking'}), (opp:ProjectOpportunity {title: 'Next-Gen Credit Scoring for Retail Mortgages'}) MERGE (rb)-[:HAS_OPPORTUNITY]->(opp)",
  "MATCH (opp:ProjectOpportunity {title: 'Next-Gen Credit Scoring for Retail Mortgages'}), (pp:PainPoint {name: 'Inaccurate Loan Default Prediction'}) MERGE (opp)-[:ADDRESSES]->(pp)",
  
  "MATCH (ob:Sector {name: 'Online Banking'}), (opp:ProjectOpportunity {title: 'Real-Time Transaction Fraud for Online Banking'}) MERGE (ob)-[:HAS_OPPORTUNITY]->(opp)",
  "MATCH (opp:ProjectOpportunity {title: 'Real-Time Transaction Fraud for Online Banking'}), (pp:PainPoint {name: 'High-Volume Transaction Fraud'}) MERGE (opp)-[:ADDRESSES]->(pp)",
  
  "MATCH (pi:Sector {name: 'Property Insurance'}), (opp:ProjectOpportunity {title: 'Automated Claims Fraud Analysis for Property Insurance'}) MERGE (pi)-[:HAS_OPPORTUNITY]->(opp)",
  "MATCH (opp:ProjectOpportunity {title: 'Automated Claims Fraud Analysis for Property Insurance'}), (pp:PainPoint {name: 'Fraudulent & Inflated Claims'}) MERGE (opp)-[:ADDRESSES]->(pp)",
  
  "MATCH (rb:Sector {name: 'Retail Banking'}), (opp:ProjectOpportunity {title: 'AI-Powered Omni-Channel Support for Bank Customers'}) MERGE (rb)-[:HAS_OPPORTUNITY]->(opp)",
  "MATCH (opp:ProjectOpportunity {title: 'AI-Powered Omni-Channel Support for Bank Customers'}), (pp:PainPoint {name: 'Overloaded Call Center Staff'}) MERGE (opp)-[:ADDRESSES]->(pp)",
  
  "MATCH (hi:Sector {name: 'Health Insurance'}), (opp:ProjectOpportunity {title: 'Intelligent Claims Processing for Health Insurance'}) MERGE (hi)-[:HAS_OPPORTUNITY]->(opp)",
  "MATCH (opp:ProjectOpportunity {title: 'Intelligent Claims Processing for Health Insurance'}), (pp:PainPoint {name: 'Slow & Manual Claims Processing'}) MERGE (opp)-[:ADDRESSES]->(pp)"
];

async function initDatabase() {
  const session = driver.session();
  
  try {
    // Clear existing data
    await session.run('MATCH (n) DETACH DELETE n');
    console.log('Cleared existing data');
    
    // Execute each query
    for (const query of queries) {
      try {
        await session.run(query);
        console.log('✓', query.substring(0, 80) + '...');
      } catch (error) {
        console.error('✗', query.substring(0, 80) + '...', error.message);
      }
    }
    
    // Verify
    const result = await session.run(`
      MATCH (i:Industry)-[:HAS_SECTOR]->(s:Sector)-[:EXPERIENCES]->(pp:PainPoint)
      RETURN i.name as industry, s.name as sector, pp.name as painPoint
      ORDER BY industry, sector, painPoint
    `);
    
    console.log('\n🎉 Database initialized! Sample relationships:');
    result.records.slice(0, 10).forEach(record => {
      console.log(`${record.get('industry')} → ${record.get('sector')} → ${record.get('painPoint')}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await session.close();
    await driver.close();
  }
}

initDatabase();