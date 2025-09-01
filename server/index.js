const express = require('express');
const cors = require('cors');
const neo4j = require('neo4j-driver');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const driver = neo4j.driver(
  process.env.NEO4J_URI || 'bolt://localhost:7687',
  neo4j.auth.basic(
    process.env.NEO4J_USERNAME || 'neo4j',
    process.env.NEO4J_PASSWORD || 'password123'
  )
);

// Initialize Gemini AI
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

// Graph versioning system with separate databases
const GRAPH_VERSIONS = {
  BASE: 'base',
  ADMIN_DRAFT: 'admin_draft'
};

// Database management functions
function getDatabaseName(version) {
  if (version === GRAPH_VERSIONS.BASE || version === 'base') {
    return 'neo4j'; // Default Neo4j database
  }
  // Use valid database naming (only ascii, numbers, dots, dashes)
  const cleanVersion = version.replace(/[^a-zA-Z0-9.-]/g, '-').toLowerCase();
  return `catalog-${cleanVersion}`;
}

async function createDatabase(dbName) {
  const systemSession = driver.session({ database: 'system' });
  try {
    await systemSession.run(`CREATE DATABASE \`${dbName}\` IF NOT EXISTS`);
    console.log(`Database ${dbName} created or already exists`);
  } catch (error) {
    console.error(`Failed to create database ${dbName}:`, error.message);
    throw error;
  } finally {
    await systemSession.close();
  }
}

async function dropDatabase(dbName) {
  if (dbName === 'neo4j') {
    throw new Error('Cannot drop the default neo4j database');
  }
  const systemSession = driver.session({ database: 'system' });
  try {
    await systemSession.run(`DROP DATABASE \`${dbName}\` IF EXISTS`);
    console.log(`Database ${dbName} dropped`);
  } catch (error) {
    console.error(`Failed to drop database ${dbName}:`, error.message);
    throw error;
  } finally {
    await systemSession.close();
  }
}

async function listDatabases() {
  const systemSession = driver.session({ database: 'system' });
  try {
    const result = await systemSession.run('SHOW DATABASES');
    return result.records.map(record => ({
      name: record.get('name'),
      status: record.get('currentStatus')
    }));
  } finally {
    await systemSession.close();
  }
}

// Schema definition for validation
const GRAPH_SCHEMA = {
  nodeTypes: [
    'Industry', 'Sector', 'Department', 'PainPoint',
    'ProjectOpportunity', 'ProjectBlueprint', 'Role', 'SubModule', 'Module'
  ],
  relationshipTypes: [
    'HAS_SECTOR', 'EXPERIENCES', 'HAS_OPPORTUNITY', 'ADDRESSES',
    'IS_INSTANCE_OF', 'REQUIRES_ROLE', 'NEEDS_SUBMODULE', 'CONTAINS', 'USES_MODULE'
  ],
  nodeProperties: {
    'Industry': ['name'],
    'Sector': ['name'],
    'Department': ['name'],
    'PainPoint': ['name', 'impact'],
    'ProjectOpportunity': ['title', 'priority', 'business_case', 'budget_range', 'duration'],
    'ProjectBlueprint': ['title'],
    'Role': ['name'],
    'SubModule': ['name'],
    'Module': ['name']
  }
};

// Helper function to get database session for a version
function getVersionSession(version = GRAPH_VERSIONS.BASE) {
  const dbName = getDatabaseName(version);
  return driver.session({ database: dbName });
}

// Schema validation functions
function validateCypherScript(cypherScript) {
  const errors = [];
  const lines = cypherScript.split('\n');
  
  // Extract CREATE statements for nodes and relationships
  const nodeCreates = [];
  const relCreates = [];
  
  // Track multi-line CREATE statements
  let currentCreate = null;
  let braceDepth = 0;
  
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    
    if (trimmed.startsWith('CREATE') || trimmed.startsWith('MERGE')) {
      if (trimmed.includes('-[') && trimmed.includes(']-')) {
        // This is a relationship creation
        relCreates.push({ line: trimmed, lineNumber: index + 1 });
      } else if (trimmed.includes('(') && trimmed.includes(':')) {
        // Start of a node creation
        currentCreate = {
          startLine: index + 1,
          lines: [trimmed],
          content: trimmed
        };
        braceDepth = (trimmed.match(/{/g) || []).length - (trimmed.match(/}/g) || []).length;
        
        // If the CREATE statement is complete on one line
        if (braceDepth === 0 && trimmed.includes('}')) {
          nodeCreates.push({
            line: currentCreate.content,
            lineNumber: currentCreate.startLine,
            fullContent: currentCreate.content
          });
          currentCreate = null;
        }
      }
    } else if (currentCreate) {
      // Continue collecting lines for multi-line CREATE
      currentCreate.lines.push(trimmed);
      currentCreate.content += ' ' + trimmed;
      braceDepth += (trimmed.match(/{/g) || []).length - (trimmed.match(/}/g) || []).length;
      
      // If we've closed all braces, the CREATE statement is complete
      if (braceDepth === 0) {
        nodeCreates.push({
          line: currentCreate.lines[0], // Keep original line for node type extraction
          lineNumber: currentCreate.startLine,
          fullContent: currentCreate.content
        });
        currentCreate = null;
      }
    }
  });
  
  // Validate node types
  nodeCreates.forEach(({ line, lineNumber, fullContent }) => {
    const nodeTypeMatch = line.match(/:([A-Za-z]+)/);
    if (nodeTypeMatch) {
      const nodeType = nodeTypeMatch[1];
      if (!GRAPH_SCHEMA.nodeTypes.includes(nodeType)) {
        errors.push(`Line ${lineNumber}: Unknown node type "${nodeType}". Allowed types: ${GRAPH_SCHEMA.nodeTypes.join(', ')}`);
      }
      
      // Validate required properties using the full content of the CREATE statement
      const requiredProps = GRAPH_SCHEMA.nodeProperties[nodeType] || [];
      const primaryProp = nodeType === 'ProjectOpportunity' || nodeType === 'ProjectBlueprint' ? 'title' : 'name';
      
      if (requiredProps.includes(primaryProp) && !fullContent.includes(`${primaryProp}:`)) {
        errors.push(`Line ${lineNumber}: Missing required property "${primaryProp}" for node type "${nodeType}"`);
      }
    }
  });
  
  // Validate relationship types
  relCreates.forEach(({ line, lineNumber }) => {
    const relTypeMatch = line.match(/\[:([A-Z_]+)\]/);
    if (relTypeMatch) {
      const relType = relTypeMatch[1];
      if (!GRAPH_SCHEMA.relationshipTypes.includes(relType)) {
        errors.push(`Line ${lineNumber}: Unknown relationship type "${relType}". Allowed types: ${GRAPH_SCHEMA.relationshipTypes.join(', ')}`);
      }
    }
  });
  
  return {
    valid: errors.length === 0,
    errors: errors,
    stats: {
      nodeCreates: nodeCreates.length,
      relCreates: relCreates.length
    }
  };
}

// This function has been removed - we now use separate databases instead of label versioning

// Test database connection
app.get('/api/health', async (req, res) => {
  const session = driver.session();
  try {
    await session.run('RETURN 1');
    res.json({ status: 'Connected to Neo4j', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ error: 'Database connection failed', details: error.message });
  } finally {
    await session.close();
  }
});

// Get all industries
app.get('/api/industries', async (req, res) => {
  const version = req.query.version || GRAPH_VERSIONS.BASE;
  const session = getVersionSession(version);
  
  try {
    // Simple query - no label versioning needed, just use different databases
    const query = 'MATCH (i:Industry) RETURN i.name as name ORDER BY i.name';
    
    const result = await session.run(query);
    const industries = result.records.map(record => ({
      name: record.get('name')
    }));
    res.json(industries);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    await session.close();
  }
});

// Get sectors for selected industries, grouped by industry
app.post('/api/sectors', async (req, res) => {
  const { industries } = req.body;
  const version = req.query.version || GRAPH_VERSIONS.BASE;
  const session = getVersionSession(version);
  
  try {
    // Simple query - database switching handles versioning
    const query = `
      MATCH (i:Industry)-[:HAS_SECTOR]->(s:Sector)
      WHERE i.name IN $industries
      RETURN i.name as industry, s.name as sector 
      ORDER BY i.name, s.name
    `;
    
    const result = await session.run(query, { industries });
    
    // Group sectors by industry
    const groupedSectors = {};
    result.records.forEach(record => {
      const industry = record.get('industry');
      const sector = record.get('sector');
      
      if (!groupedSectors[industry]) {
        groupedSectors[industry] = [];
      }
      groupedSectors[industry].push({ name: sector });
    });
    
    res.json(groupedSectors);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    await session.close();
  }
});

// Get all departments (independent of sectors for department mode)
app.get('/api/departments', async (req, res) => {
  const version = req.query.version || GRAPH_VERSIONS.BASE;
  const session = getVersionSession(version);
  
  try {
    // Simple query - database switching handles versioning
    const query = 'MATCH (d:Department) RETURN DISTINCT d.name as name ORDER BY d.name';
    
    const result = await session.run(query);
    const departments = result.records.map(record => ({
      name: record.get('name')
    }));
    res.json(departments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    await session.close();
  }
});

// Get pain points for selected sectors (sector mode)
app.post('/api/sector-painpoints', async (req, res) => {
  const { sectors } = req.body;
  const version = req.query.version || GRAPH_VERSIONS.BASE;
  const session = getVersionSession(version);
  
  try {
    // Simple query - database switching handles versioning
    const query = `
      MATCH (s:Sector)-[:EXPERIENCES]->(pp:PainPoint)
      WHERE s.name IN $sectors
      RETURN DISTINCT pp.name as name, pp.impact as impact ORDER BY pp.name
    `;
    
    const result = await session.run(query, { sectors });
    const painPoints = result.records.map(record => ({
      name: record.get('name'),
      impact: record.get('impact')
    }));
    res.json(painPoints);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    await session.close();
  }
});

// Get pain points for selected departments (department mode)
app.post('/api/department-painpoints', async (req, res) => {
  const { departments } = req.body;
  const version = req.query.version || GRAPH_VERSIONS.BASE;
  const session = getVersionSession(version);
  
  try {
    // Simple query - database switching handles versioning
    const query = `
      MATCH (d:Department)-[:EXPERIENCES]->(pp:PainPoint)
      WHERE d.name IN $departments
      RETURN DISTINCT pp.name as name, pp.impact as impact ORDER BY pp.name
    `;
    
    const result = await session.run(query, { departments });
    const painPoints = result.records.map(record => ({
      name: record.get('name'),
      impact: record.get('impact')
    }));
    res.json(painPoints);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    await session.close();
  }
});

// Create new pain point
app.post('/api/painpoints', async (req, res) => {
  const session = driver.session();
  const { name, impact, departments, sectors } = req.body;
  
  try {
    // Validate that at least one department or sector is provided
    if ((!departments || departments.length === 0) && (!sectors || sectors.length === 0)) {
      return res.status(400).json({ 
        error: 'Pain point must be connected to at least one department or sector' 
      });
    }
    
    // Create the pain point
    const createQuery = `
      CREATE (pp:PainPoint {name: $name, impact: $impact})
      RETURN pp.name as name, pp.impact as impact
    `;
    const createResult = await session.run(createQuery, { name, impact });
    
    // Link to departments if provided
    if (departments && departments.length > 0) {
      const deptLinkQuery = `
        MATCH (pp:PainPoint {name: $name})
        MATCH (d:Department) WHERE d.name IN $departments
        CREATE (d)-[:EXPERIENCES]->(pp)
      `;
      await session.run(deptLinkQuery, { name, departments });
    }
    
    // Link to sectors if provided
    if (sectors && sectors.length > 0) {
      const sectorLinkQuery = `
        MATCH (pp:PainPoint {name: $name})
        MATCH (s:Sector) WHERE s.name IN $sectors
        CREATE (s)-[:EXPERIENCES]->(pp)
      `;
      await session.run(sectorLinkQuery, { name, sectors });
    }
    
    const painPoint = createResult.records[0];
    res.json({
      name: painPoint.get('name'),
      impact: painPoint.get('impact')
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    await session.close();
  }
});

// Create new project
app.post('/api/projects/create', async (req, res) => {
  const session = driver.session();
  const { 
    title, 
    priority, 
    businessCase, 
    blueprintTitle, 
    sector, 
    department, 
    painPoint, 
    budgetRange, 
    duration, 
    requiredRoles, 
    subModules 
  } = req.body;
  
  try {
    // Create the project opportunity
    const createProjectQuery = `
      CREATE (po:ProjectOpportunity {
        title: $title,
        priority: $priority,
        business_case: $businessCase,
        budget_range: $budgetRange,
        duration: $duration
      })
      RETURN po
    `;
    await session.run(createProjectQuery, { 
      title, 
      priority, 
      businessCase, 
      budgetRange, 
      duration 
    });
    
    // Create or link to blueprint
    const blueprintQuery = `
      MATCH (po:ProjectOpportunity {title: $title})
      MERGE (pb:ProjectBlueprint {title: $blueprintTitle})
      CREATE (po)-[:IS_INSTANCE_OF]->(pb)
    `;
    await session.run(blueprintQuery, { title, blueprintTitle });
    
    // Link to pain point
    const painPointQuery = `
      MATCH (po:ProjectOpportunity {title: $title})
      MATCH (pp:PainPoint {name: $painPoint})
      CREATE (po)-[:ADDRESSES]->(pp)
    `;
    await session.run(painPointQuery, { title, painPoint });
    
    // Link to department if provided
    if (department) {
      const deptQuery = `
        MATCH (po:ProjectOpportunity {title: $title})
        MATCH (d:Department {name: $department})
        CREATE (d)-[:HAS_OPPORTUNITY]->(po)
      `;
      await session.run(deptQuery, { title, department });
    }
    
    // Link to sector if provided
    if (sector) {
      const sectorQuery = `
        MATCH (po:ProjectOpportunity {title: $title})
        MATCH (s:Sector {name: $sector})
        CREATE (s)-[:HAS_OPPORTUNITY]->(po)
      `;
      await session.run(sectorQuery, { title, sector });
    }
    
    // Add required roles
    if (requiredRoles && requiredRoles.length > 0) {
      for (const role of requiredRoles) {
        const roleQuery = `
          MATCH (po:ProjectOpportunity {title: $title})
          MERGE (r:Role {name: $roleName})
          CREATE (po)-[:REQUIRES_ROLE {specialty: $specialty}]->(r)
        `;
        await session.run(roleQuery, { 
          title, 
          roleName: role.name, 
          specialty: role.specialty || null 
        });
      }
    }
    
    // Add sub-modules
    if (subModules && subModules.length > 0) {
      for (const subModule of subModules) {
        const moduleQuery = `
          MATCH (po:ProjectOpportunity {title: $title})
          MERGE (sm:SubModule {name: $subModule})
          CREATE (po)-[:NEEDS_SUBMODULE]->(sm)
        `;
        await session.run(moduleQuery, { title, subModule });
      }
    }
    
    res.json({ success: true, message: 'Project created successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    await session.close();
  }
});

// Generate pain point name suggestions using LLM
app.post('/api/suggest-painpoint-names', async (req, res) => {
  const { sectors, departments } = req.body;
  
  try {
    if ((!sectors || sectors.length === 0) && (!departments || departments.length === 0)) {
      return res.status(400).json({ error: 'At least one sector or department is required' });
    }
    
    // Generate AI-addressable pain point suggestions
    const suggestions = generateAIPainPointSuggestions(sectors, departments);
    
    res.json({ suggestions });
  } catch (error) {
    console.error('Error generating pain point name suggestions:', error);
    res.status(500).json({ error: 'Failed to generate suggestions' });
  }
});

// Function to generate AI-addressable pain point suggestions
function generateAIPainPointSuggestions(sectors, departments) {
  // AI-addressable pain points by sector
  const sectorPainPoints = {
    'Retail Banking': [
      'Slow Loan Approval Process',
      'Manual Account Opening Procedures',
      'Inconsistent Credit Risk Assessment',
      'Customer Onboarding Delays',
      'Transaction Monitoring False Positives',
      'Branch Wait Time Optimization',
      'Cross-Selling Opportunity Identification',
      'Automated Financial Advisory Gaps'
    ],
    'Commercial Banking': [
      'Complex Trade Finance Documentation',
      'Manual Cash Management Reporting',
      'Corporate Credit Analysis Inefficiencies',
      'Treasury Operations Automation Gaps',
      'Relationship Manager Workload Imbalance',
      'Commercial Loan Processing Delays',
      'Regulatory Reporting Bottlenecks'
    ],
    'Investment Banking': [
      'Market Research Data Consolidation',
      'Deal Structuring Analysis Delays',
      'Regulatory Filing Complexity',
      'Client Portfolio Risk Assessment',
      'Trading Algorithm Optimization',
      'Compliance Monitoring Gaps',
      'Due Diligence Process Inefficiencies'
    ],
    'Insurance': [
      'Claims Processing Bottlenecks',
      'Underwriting Decision Delays',
      'Policy Renewal Automation Gaps',
      'Fraud Detection Inefficiencies',
      'Customer Service Response Times',
      'Risk Assessment Inconsistencies',
      'Premium Calculation Complexities'
    ],
    'Life Insurance': [
      'Medical Underwriting Delays',
      'Policy Administration Inefficiencies',
      'Claims Investigation Bottlenecks',
      'Customer Health Risk Assessment',
      'Actuarial Analysis Automation Gaps',
      'Policy Recommendation Engine Needs'
    ],
    'Property & Casualty': [
      'Property Valuation Inconsistencies',
      'Catastrophe Modeling Limitations',
      'Claims Adjuster Resource Allocation',
      'Premium Pricing Optimization',
      'Risk Exposure Assessment Gaps',
      'Policy Bundling Opportunities'
    ]
  };

  // AI-addressable pain points by department
  const departmentPainPoints = {
    'Operations': [
      'Manual Process Automation Opportunities',
      'Workflow Optimization Needs',
      'Resource Allocation Inefficiencies',
      'Quality Control Inconsistencies',
      'Performance Monitoring Gaps',
      'Process Standardization Challenges'
    ],
    'Customer Service': [
      'Call Center Wait Time Issues',
      'Customer Query Resolution Delays',
      'Omnichannel Experience Gaps',
      'Self-Service Option Limitations',
      'Agent Productivity Optimization',
      'Customer Satisfaction Prediction'
    ],
    'Risk Management': [
      'Real-time Risk Monitoring Gaps',
      'Regulatory Compliance Automation',
      'Market Risk Assessment Delays',
      'Credit Risk Scoring Inefficiencies',
      'Operational Risk Identification',
      'Stress Testing Automation Needs'
    ],
    'IT': [
      'Legacy System Integration Challenges',
      'Data Quality Management Issues',
      'Cybersecurity Threat Detection',
      'System Performance Optimization',
      'Automated Testing Gaps',
      'Cloud Migration Complexities'
    ],
    'Finance': [
      'Financial Reporting Automation Gaps',
      'Budget Forecasting Inaccuracies',
      'Expense Management Inefficiencies',
      'Reconciliation Process Delays',
      'Cash Flow Prediction Challenges',
      'Cost Allocation Optimization'
    ],
    'Marketing': [
      'Customer Segmentation Inefficiencies',
      'Campaign Effectiveness Measurement',
      'Lead Scoring Optimization',
      'Personalization Engine Gaps',
      'Market Sentiment Analysis Needs',
      'Attribution Modeling Challenges'
    ],
    'Sales': [
      'Lead Qualification Inefficiencies',
      'Sales Pipeline Optimization',
      'Customer Churn Prediction Gaps',
      'Cross-Selling Opportunity Identification',
      'Sales Performance Analytics',
      'Pricing Strategy Optimization'
    ],
    'Human Resources': [
      'Resume Screening Automation Gaps',
      'Employee Performance Prediction',
      'Talent Retention Analysis Needs',
      'Skills Gap Identification',
      'Workforce Planning Optimization',
      'Employee Satisfaction Monitoring'
    ],
    'Compliance': [
      'Regulatory Change Monitoring',
      'Automated Compliance Reporting',
      'Risk Assessment Documentation',
      'Audit Trail Automation',
      'Policy Adherence Monitoring',
      'Regulatory Filing Optimization'
    ],
    'Legal': [
      'Contract Analysis Automation',
      'Legal Research Inefficiencies',
      'Document Review Bottlenecks',
      'Litigation Risk Assessment',
      'Regulatory Interpretation Gaps',
      'Legal Precedent Analysis Needs'
    ]
  };

  // Collect relevant suggestions
  let allSuggestions = new Set();
  
  // Add sector-specific suggestions
  if (sectors && sectors.length > 0) {
    sectors.forEach(sector => {
      if (sectorPainPoints[sector]) {
        sectorPainPoints[sector].forEach(painPoint => allSuggestions.add(painPoint));
      }
    });
  }
  
  // Add department-specific suggestions
  if (departments && departments.length > 0) {
    departments.forEach(department => {
      if (departmentPainPoints[department]) {
        departmentPainPoints[department].forEach(painPoint => allSuggestions.add(painPoint));
      }
    });
  }
  
  // Convert to array and limit to top 8 suggestions
  let suggestions = Array.from(allSuggestions);
  
  // If we have too many, prioritize based on AI-addressability and business impact
  if (suggestions.length > 8) {
    // Prioritize high-impact, AI-addressable pain points
    const highPriority = suggestions.filter(s => 
      s.includes('Automation') || s.includes('Prediction') || s.includes('Optimization') ||
      s.includes('Analysis') || s.includes('Detection') || s.includes('Processing') ||
      s.includes('Monitoring') || s.includes('Assessment')
    );
    
    suggestions = highPriority.slice(0, 8);
  }
  
  // If no specific matches, provide generic AI-addressable suggestions
  if (suggestions.length === 0) {
    suggestions = [
      'Manual Data Processing Inefficiencies',
      'Customer Service Response Time Issues',
      'Risk Assessment Automation Gaps',
      'Predictive Analytics Implementation Needs',
      'Process Optimization Opportunities',
      'Decision Support System Limitations',
      'Pattern Recognition Challenges',
      'Automated Compliance Monitoring Gaps'
    ];
  }
  
  return suggestions.slice(0, 8); // Return max 8 suggestions
}

// Generate impact description suggestion using LLM
app.post('/api/suggest-impact', async (req, res) => {
  const { painPointName, sectors, departments } = req.body;
  
  try {
    if (!painPointName) {
      return res.status(400).json({ error: 'Pain point name is required' });
    }
    
    // Build context for the LLM prompt
    let contextInfo = '';
    if (sectors && sectors.length > 0) {
      contextInfo += `Sectors: ${sectors.join(', ')}. `;
    }
    if (departments && departments.length > 0) {
      contextInfo += `Departments: ${departments.join(', ')}. `;
    }
    
    // Create a detailed prompt for impact description
    const prompt = `You are a business analyst expert. Generate a concise, professional impact description for the following pain point in banking/insurance:

Pain Point: "${painPointName}"
${contextInfo}

Requirements:
- Write a 1-2 sentence impact description
- Focus on quantifiable business impact (cost, time, efficiency, risk)
- Use professional business language
- Be specific to banking/insurance industry
- Include potential metrics where relevant (e.g., "increases processing time by 40%", "$2M annual cost")

Impact Description:`;

    // For now, we'll create a mock response. In a real implementation, 
    // you would integrate with OpenAI API, Anthropic Claude, or another LLM service
    const suggestion = generateMockImpactSuggestion(painPointName, sectors, departments);
    
    res.json({ suggestion });
  } catch (error) {
    console.error('Error generating impact suggestion:', error);
    res.status(500).json({ error: 'Failed to generate suggestion' });
  }
});

// Mock function for impact suggestion - replace with actual LLM API call
function generateMockImpactSuggestion(painPointName, sectors, departments) {
  const suggestions = {
    // Manual process related
    'Manual Process Bottlenecks': 'Increases operational costs by 35% and extends processing time from 2 hours to 8 hours per transaction.',
    'Manual Invoice Processing': 'Requires 15 FTEs to process 50,000 invoices monthly, costing $1.8M annually in labor.',
    'Manual Data Entry': 'Introduces 12% error rate and requires 40+ hours weekly for data validation and correction.',
    
    // Risk and compliance
    'Regulatory Compliance Gaps': 'Exposes organization to $500K+ in potential fines and increases audit preparation time by 200%.',
    'Fraud Detection Delays': 'Results in $2.3M annual losses due to delayed fraud identification and response times.',
    'Risk Assessment Inefficiencies': 'Extends loan approval process by 5-7 days, impacting customer satisfaction and competitive advantage.',
    
    // Customer service
    'Long Customer Wait Times': 'Average handle time of 12 minutes reduces customer satisfaction by 25% and increases churn risk.',
    'Limited Customer Insights': 'Prevents effective cross-selling, resulting in 70% missed revenue expansion opportunities.',
    'Inconsistent Service Quality': 'Creates 15% variance in service delivery, impacting customer retention and brand reputation.',
    
    // Technology and systems
    'Legacy System Limitations': 'Requires 3x more maintenance effort and prevents integration with modern digital channels.',
    'Data Silos': 'Prevents unified customer view, reducing marketing campaign effectiveness by 45%.',
    'System Downtime': 'Each hour of downtime costs $150K in lost transactions and damages customer trust.'
  };
  
  // Try to find exact match first
  if (suggestions[painPointName]) {
    return suggestions[painPointName];
  }
  
  // Generate contextual suggestion based on keywords
  const lowerPainPoint = painPointName.toLowerCase();
  
  if (lowerPainPoint.includes('manual') || lowerPainPoint.includes('process')) {
    return `Increases operational overhead by 30-40% and extends processing time significantly, impacting ${departments?.join(' and ') || 'operational'} efficiency.`;
  }
  
  if (lowerPainPoint.includes('fraud') || lowerPainPoint.includes('risk')) {
    return `Exposes organization to financial losses estimated at $1-3M annually and increases regulatory compliance risk.`;
  }
  
  if (lowerPainPoint.includes('customer') || lowerPainPoint.includes('service')) {
    return `Reduces customer satisfaction scores by 20-30% and increases customer acquisition costs due to retention challenges.`;
  }
  
  if (lowerPainPoint.includes('data') || lowerPainPoint.includes('system')) {
    return `Creates operational inefficiencies costing $500K+ annually and prevents data-driven decision making capabilities.`;
  }
  
  if (lowerPainPoint.includes('compliance') || lowerPainPoint.includes('regulatory')) {
    return `Increases regulatory risk exposure and requires 2x more resources for audit preparation and compliance reporting.`;
  }
  
  // Default generic suggestion
  return `Significantly impacts operational efficiency and increases costs, requiring immediate attention to maintain competitive advantage in ${sectors?.join(' and ') || 'the financial services'} sector.`;
}

// Smart Update Feature with Gemini 2.0 Flash

// Generate comprehensive graph schema prompt for Gemini
function createGraphSchemaPrompt() {
  const nodeTypesDesc = GRAPH_SCHEMA.nodeTypes.map(type => {
    const props = GRAPH_SCHEMA.nodeProperties[type] || [];
    return `- ${type}: Properties [${props.join(', ')}]`;
  }).join('\n');

  const relationshipDesc = GRAPH_SCHEMA.relationshipTypes.map(rel => `- ${rel}`).join('\n');

  return `You are a Neo4j Cypher query expert. Generate valid Cypher queries for graph updates of any complexity.

GRAPH SCHEMA:
Node Types:
${nodeTypesDesc}

Relationship Types:
${relationshipDesc}

GUIDELINES:
1. Do not create new node types or relationship types beyond the schema
2. Use proper Cypher syntax with correct property names
3. Return ONLY the Cypher query, no explanations or comments
4. Handle complex multi-node operations appropriately
5. Use proper Cypher patterns for bulk operations when needed

SUPPORTED OPERATIONS:
- Update properties of single or multiple nodes
- Create/delete nodes and relationships
- Bulk operations affecting multiple nodes
- Complex graph restructuring
- Conditional updates with WHERE clauses
- Pattern matching with multiple MATCH clauses

EXAMPLES:
User: "Update the Banking industry to have name 'Digital Banking'"
Response: MATCH (i:Industry {name: 'Banking'}) SET i.name = 'Digital Banking'

User: "Connect all departments to the Data Analytics pain point"
Response: MATCH (d:Department), (p:PainPoint {name: 'Data Analytics'}) CREATE (d)-[:EXPERIENCES]->(p)

User: "Create new pain point called AI Integration and connect it to all technology sectors"
Response: CREATE (p:PainPoint {name: 'AI Integration', impact: 'Significant transformation required for AI adoption across operations'}) WITH p MATCH (s:Sector) WHERE s.name CONTAINS 'Technology' OR s.name CONTAINS 'IT' CREATE (s)-[:EXPERIENCES]->(p)

User: "Remove all connections between Banking sector and old pain points, then connect to Modern Banking Challenges"
Response: MATCH (s:Sector {name: 'Banking'})-[r:EXPERIENCES]->(p:PainPoint) DELETE r WITH s CREATE (newPain:PainPoint {name: 'Modern Banking Challenges', impact: 'Digital transformation and regulatory compliance challenges'}) CREATE (s)-[:EXPERIENCES]->(newPain)`;
}

// Validate basic Cypher syntax without complexity restrictions
function validateCypherSyntax(cypherQuery) {
  const query = cypherQuery.trim();
  
  // Check for empty query
  if (!query) {
    return { isValid: false, error: 'Empty query provided.' };
  }
  
  // Basic syntax check - ensure it looks like a valid Cypher query
  const cypherKeywords = /\b(MATCH|CREATE|SET|DELETE|REMOVE|MERGE|WITH|RETURN|WHERE)\b/i;
  if (!cypherKeywords.test(query)) {
    return { isValid: false, error: 'Query does not appear to be valid Cypher syntax.' };
  }
  
  // Check for obviously malicious patterns (SQL injection attempts, etc.)
  const suspiciousPatterns = /\b(DROP|TRUNCATE|EXEC|EXECUTE)\b/i;
  if (suspiciousPatterns.test(query)) {
    return { isValid: false, error: 'Query contains potentially unsafe operations.' };
  }
  
  return { isValid: true };
}

// Graph data querying functions for AI context
async function getGraphContext(version = 'base', contextType = 'summary') {
  const session = getVersionSession(version);
  try {
    const context = {};
    
    if (contextType === 'summary' || contextType === 'full') {
      // Get counts of all node types
      for (const nodeType of GRAPH_SCHEMA.nodeTypes) {
        const result = await session.run(`MATCH (n:${nodeType}) RETURN count(n) as count`);
        context[`${nodeType}_count`] = result.records[0]?.get('count')?.toNumber() || 0;
      }
      
      // Get sample node names for each type (up to 5)
      for (const nodeType of GRAPH_SCHEMA.nodeTypes) {
        const result = await session.run(`MATCH (n:${nodeType}) RETURN n.name as name LIMIT 5`);
        context[`${nodeType}_samples`] = result.records.map(r => r.get('name')).filter(n => n);
      }
      
      // Get relationship counts
      for (const relType of GRAPH_SCHEMA.relationshipTypes) {
        const result = await session.run(`MATCH ()-[r:${relType}]->() RETURN count(r) as count`);
        context[`${relType}_count`] = result.records[0]?.get('count')?.toNumber() || 0;
      }
    }
    
    if (contextType === 'full') {
      // Get more detailed information for complex queries
      const detailsResult = await session.run(`
        MATCH (n)-[r]->(m) 
        RETURN labels(n)[0] as source_type, n.name as source_name, 
               type(r) as relationship, labels(m)[0] as target_type, m.name as target_name 
        LIMIT 20
      `);
      
      context.relationships_sample = detailsResult.records.map(record => ({
        source_type: record.get('source_type'),
        source_name: record.get('source_name'),
        relationship: record.get('relationship'),
        target_type: record.get('target_type'),
        target_name: record.get('target_name')
      }));
    }
    
    return context;
  } catch (error) {
    console.error('Error getting graph context:', error);
    return {};
  } finally {
    await session.close();
  }
}

async function querySpecificNodes(version = 'base', nodeType, searchTerm) {
  const session = getVersionSession(version);
  try {
    // Search for nodes containing the search term
    const result = await session.run(
      `MATCH (n:${nodeType}) 
       WHERE toLower(n.name) CONTAINS toLower($searchTerm) 
       RETURN n.name as name LIMIT 10`,
      { searchTerm }
    );
    
    return result.records.map(record => record.get('name'));
  } catch (error) {
    console.error('Error querying specific nodes:', error);
    return [];
  } finally {
    await session.close();
  }
}

async function getNodeConnections(version = 'base', nodeType, nodeName) {
  const session = getVersionSession(version);
  try {
    const result = await session.run(
      `MATCH (n:${nodeType} {name: $nodeName})-[r]-(connected) 
       RETURN type(r) as relationship, labels(connected)[0] as connected_type, 
              connected.name as connected_name, 
              CASE WHEN startNode(r) = n THEN 'outgoing' ELSE 'incoming' END as direction
       LIMIT 20`,
      { nodeName }
    );
    
    return result.records.map(record => ({
      relationship: record.get('relationship'),
      connected_type: record.get('connected_type'),
      connected_name: record.get('connected_name'),
      direction: record.get('direction')
    }));
  } catch (error) {
    console.error('Error getting node connections:', error);
    return [];
  } finally {
    await session.close();
  }
}

// Analyze user request to determine what additional context is needed
async function analyzeRequestForContext(naturalLanguageUpdate, version = 'base') {
  const additionalContext = {};
  const lowerRequest = naturalLanguageUpdate.toLowerCase();
  
  // Extract potential node names mentioned in the request
  const mentionedNodes = [];
  const words = naturalLanguageUpdate.split(/\s+/);
  
  // Look for specific node references
  for (const word of words) {
    const cleanWord = word.replace(/[^a-zA-Z0-9\s]/g, '');
    if (cleanWord.length > 2) { // Ignore very short words
      for (const nodeType of GRAPH_SCHEMA.nodeTypes) {
        const matches = await querySpecificNodes(version, nodeType, cleanWord);
        if (matches.length > 0) {
          mentionedNodes.push({ nodeType, matches, searchTerm: cleanWord });
        }
      }
    }
  }
  
  additionalContext.mentionedNodes = mentionedNodes;
  
  // Determine if we need detailed relationship information
  if (lowerRequest.includes('connect') || lowerRequest.includes('relationship') || 
      lowerRequest.includes('related') || lowerRequest.includes('linked')) {
    additionalContext.needsRelationshipDetails = true;
  }
  
  // Check if request involves specific types
  for (const nodeType of GRAPH_SCHEMA.nodeTypes) {
    if (lowerRequest.includes(nodeType.toLowerCase())) {
      additionalContext.involvedTypes = additionalContext.involvedTypes || [];
      additionalContext.involvedTypes.push(nodeType);
    }
  }
  
  return additionalContext;
}

// Generate Cypher query from natural language using Gemini 2.0 Flash
async function generateCypherFromNaturalLanguage(naturalLanguageUpdate, conversationHistory = [], version = 'base') {
  if (!genAI) {
    throw new Error('Gemini API key not configured');
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
    
    // Analyze request to understand what context is needed
    const requestContext = await analyzeRequestForContext(naturalLanguageUpdate, version);
    
    // Get current graph context to inform the AI
    const graphContext = await getGraphContext(version, 
      requestContext.needsRelationshipDetails ? 'full' : 'summary');
    
    // Build conversation context
    let prompt = createGraphSchemaPrompt();
    
    // Add current graph data context
    prompt += '\n\nCURRENT GRAPH DATA:\n';
    Object.entries(graphContext).forEach(([key, value]) => {
      if (key.includes('_count')) {
        const nodeType = key.replace('_count', '');
        prompt += `- ${nodeType} nodes: ${value}\n`;
      } else if (key.includes('_samples') && Array.isArray(value) && value.length > 0) {
        const nodeType = key.replace('_samples', '');
        prompt += `- Existing ${nodeType} names: ${value.join(', ')}\n`;
      }
    });
    
    // Add specific node information if nodes were mentioned in request
    if (requestContext.mentionedNodes && requestContext.mentionedNodes.length > 0) {
      prompt += '\n\nRELEVANT EXISTING NODES:\n';
      for (const nodeInfo of requestContext.mentionedNodes) {
        prompt += `- Found ${nodeInfo.nodeType} nodes matching "${nodeInfo.searchTerm}": ${nodeInfo.matches.join(', ')}\n`;
      }
    }
    
    // Add relationship samples if needed
    if (graphContext.relationships_sample) {
      prompt += '\n\nEXISTING RELATIONSHIPS (sample):\n';
      graphContext.relationships_sample.slice(0, 10).forEach(rel => {
        prompt += `- ${rel.source_name} (${rel.source_type}) --${rel.relationship}--> ${rel.target_name} (${rel.target_type})\n`;
      });
    }
    
    // Add conversation history if exists
    if (conversationHistory.length > 0) {
      prompt += '\n\nCONVERSATION HISTORY:\n';
      conversationHistory.forEach((entry, index) => {
        prompt += `${index + 1}. User: "${entry.userRequest}"\n`;
        prompt += `   Generated: ${entry.cypherQuery}\n`;
        if (entry.feedback) {
          prompt += `   Feedback: "${entry.feedback}"\n`;
        }
      });
      prompt += '\nBased on the above conversation history and feedback, generate an improved query.\n';
    }
    
    prompt += `\n\nIMPORTANT: Use the CURRENT GRAPH DATA above to write accurate queries. Reference actual existing node names when possible, or use appropriate WHERE clauses to find nodes.\n\nUser Request: "${naturalLanguageUpdate}"\n\nCypher Query:`;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const cypherQuery = response.text().trim();
    
    // Validate the generated query
    const validation = validateCypherSyntax(cypherQuery);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }
    
    return cypherQuery;
  } catch (error) {
    console.error('Error generating Cypher query:', error);
    throw error;
  }
}

// Get current state of nodes that would be affected by the query
async function getBeforeState(cypherQuery, version = 'base') {
  const session = getVersionSession(version);
  try {
    // Parse the query to identify affected nodes
    // This is a simplified approach - more sophisticated parsing could be added
    const matches = cypherQuery.match(/\((\w+):(\w+)\s*\{[^}]*\}/g);
    if (!matches) return { nodes: [], relationships: [] };
    
    // Extract node information and query current state
    const nodeQueries = [];
    matches.forEach(match => {
      const nodeMatch = match.match(/\((\w+):(\w+)\s*\{([^}]*)\}/);
      if (nodeMatch) {
        const [, variable, label, props] = nodeMatch;
        nodeQueries.push(`MATCH (${variable}:${label} {${props}}) RETURN ${variable}`);
      }
    });
    
    const results = { nodes: [], relationships: [] };
    for (const query of nodeQueries) {
      const result = await session.run(query);
      results.nodes.push(...result.records.map(record => record.get(0).properties));
    }
    
    return results;
  } catch (error) {
    console.error('Error getting before state:', error);
    return { nodes: [], relationships: [] };
  } finally {
    await session.close();
  }
}

// Simulate query execution to get after state (without actually executing)
async function getAfterState(cypherQuery, beforeState, version = 'base') {
  // For now, return a mock after state
  // In a full implementation, this would parse the Cypher and simulate the changes
  return {
    nodes: beforeState.nodes.map(node => ({ ...node, _modified: true })),
    relationships: beforeState.relationships,
    changes: ['Property updated', 'Relationship added'] // Mock changes
  };
}

// Chat interface API endpoints

// Process natural language query for graph exploration
app.post('/api/chat/query', async (req, res) => {
  const { query, context = {} } = req.body;
  const startTime = Date.now();
  
  if (!query || query.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Query is required'
    });
  }

  try {
    // Generate Cypher query using LLM
    const cypherResult = await generateCypherFromNaturalLanguage(query, context);
    
    if (!cypherResult.success) {
      // Handle clarification requests
      if (cypherResult.needsClarification) {
        return res.json({
          success: false,
          needsClarification: cypherResult.needsClarification,
          message: cypherResult.message
        });
      }
      
      return res.json({
        success: false,
        error: cypherResult.error,
        message: 'I had trouble understanding your query. Could you try rephrasing it?'
      });
    }

    // Validate the generated Cypher query
    const validation = validateCypherQuery(cypherResult.cypherQuery);
    let finalCypher = cypherResult.cypherQuery;
    let finalExplanation = cypherResult.explanation;
    
    if (!validation.isValid) {
      console.log('Generated Cypher has validation errors:', validation.errors);
      console.log('Original query:', cypherResult.cypherQuery);
      
      // Use fallback query (now async)
      const fallback = await createFallbackQuery(query, context);
      finalCypher = fallback.cypherQuery;
      finalExplanation = fallback.explanation;
      
      console.log('Using fallback query:', finalCypher);
    }

    // Execute the Cypher query with enhanced error handling
    let graphData;
    try {
      graphData = await executeCypherQuery(finalCypher, context.graphVersion || 'base');
    } catch (error) {
      console.error('Cypher execution error:', error);
      
      // Check if it's a syntax error
      if (error.code === 'Neo.ClientError.Statement.SyntaxError') {
        // Try fallback query on syntax error
        const fallback = await createFallbackQuery(query, context);
        try {
          graphData = await executeCypherQuery(fallback.cypherQuery, context.graphVersion || 'base');
          finalCypher = fallback.cypherQuery;
          finalExplanation = fallback.explanation + ' (Original query had syntax errors)';
        } catch (fallbackError) {
          console.error('Fallback query also failed:', fallbackError);
          throw fallbackError;
        }
      } else {
        throw error;
      }
    }
    
    // Check if query returned empty results and provide suggestions
    if (graphData.nodes.length === 0) {
      console.log('Query returned no results, checking for suggestions...');
      
      // Try to extract specific node names and provide suggestions
      const queryLower = query.toLowerCase();
      let suggestedMessage = finalExplanation;
      
      if (queryLower.includes('retail')) {
        try {
          // Check both Industry and Sector nodes for 'Retail'
          const [industryRetailSuggestions, sectorRetailSuggestions] = await Promise.all([
            findSimilarNodes('Retail', 'Industry', context.graphVersion || 'base'),
            findSimilarNodes('Retail', 'Sector', context.graphVersion || 'base')
          ]);
          
          if (industryRetailSuggestions.nodes.length > 0) {
            suggestedMessage = `I couldn't find "Retail" as an industry. Did you mean one of these industries: ${industryRetailSuggestions.nodes.join(', ')}? ${finalExplanation}`;
          } else if (sectorRetailSuggestions.nodes.length > 0) {
            suggestedMessage = `I couldn't find "Retail" as an industry, but found these retail-related sectors: ${sectorRetailSuggestions.nodes.join(', ')}. ${finalExplanation}`;
          } else {
            // If no retail suggestions, get all available industries and sectors
            const [allIndustries, allSectors] = await Promise.all([
              findSimilarNodes('', 'Industry', context.graphVersion || 'base'),
              findSimilarNodes('', 'Sector', context.graphVersion || 'base')
            ]);
            suggestedMessage = `I couldn't find "Retail" in the database. Available industries: ${allIndustries.nodes.slice(0, 3).join(', ')}. Available sectors: ${allSectors.nodes.slice(0, 3).join(', ')}. ${finalExplanation}`;
          }
        } catch (err) {
          console.error('Error getting retail suggestions:', err);
        }
      }
      
      // Check for other common mismatches
      const possibleNodeNames = query.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g);
      if (possibleNodeNames && possibleNodeNames.length > 0) {
        for (const nodeName of possibleNodeNames.slice(0, 2)) { // Check first 2 capitalized terms
          if (nodeName.toLowerCase() !== 'retail') { // Skip if already checked
            try {
              // Try different node types
              const nodeTypes = ['Industry', 'Sector', 'Department'];
              for (const nodeType of nodeTypes) {
                const suggestions = await findSimilarNodes(nodeName, nodeType, context.graphVersion || 'base');
                if (!suggestions.exact && suggestions.nodes.length > 0) {
                  suggestedMessage = `I couldn't find "${nodeName}" as ${nodeType.toLowerCase()}. Did you mean: ${suggestions.nodes.slice(0, 3).join(', ')}? ${finalExplanation}`;
                  break;
                }
              }
            } catch (err) {
              console.error(`Error getting suggestions for ${nodeName}:`, err);
            }
          }
        }
      }
      
      finalExplanation = suggestedMessage;
    }
    
    const executionTime = Date.now() - startTime;
    
    res.json({
      success: true,
      message: finalExplanation || 'Here are the results from your query:',
      queryResult: {
        cypherQuery: finalCypher,
        graphData,
        summary: generateResultSummary(graphData),
        executionTime,
        reasoning: cypherResult.reasoning
      }
    });

  } catch (error) {
    console.error('Chat query error:', error);
    res.json({
      success: false,
      error: 'An error occurred while processing your query',
      message: 'Sorry, there was a technical issue. Please try again or rephrase your question.'
    });
  }
});

// Enhanced helper function to generate Cypher with reasoning and intermediate queries
async function generateCypherFromNaturalLanguage(query, context) {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    
    if (!apiKey) {
      return {
        success: false,
        error: 'Google Generative AI API key is not configured. Please set GEMINI_API_KEY or GOOGLE_API_KEY in your environment variables.'
      };
    }

    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    const graphSchema = `
    Graph Schema:
    - Nodes: Industry, Sector, Department, PainPoint, ProjectBlueprint, ProjectOpportunity, Role, Module, SubModule
    - Relationships: 
      * (Industry)-[:HAS_SECTOR]->(Sector)
      * (Sector)-[:EXPERIENCES]->(PainPoint)
      * (Department)-[:EXPERIENCES]->(PainPoint)
      * (PainPoint)-[:ADDRESSED_BY]->(ProjectOpportunity)
      * (ProjectOpportunity)-[:IMPLEMENTS]->(ProjectBlueprint)
      * (ProjectBlueprint)-[:REQUIRES]->(Role)
      * (ProjectBlueprint)-[:CONTAINS]->(Module)
      * (Module)-[:CONTAINS]->(SubModule)
    
    Node Properties:
    - All nodes have: name (string), label (string for display)
    - PainPoint: impact (string)
    - ProjectOpportunity: priority (string), budgetRange (string), duration (string)
    - ProjectBlueprint: businessCase (string)
    `;

    // Step 1: Generate multiple interpretations
    console.log('Generating reasoning for query:', query);
    const reasoning = await generateReasoningAndInterpretations(model, query, context, graphSchema);
    console.log('Reasoning result:', JSON.stringify(reasoning, null, 2));
    
    if (reasoning.needsClarification) {
      return {
        success: false,
        needsClarification: reasoning.clarification,
        message: reasoning.message || 'I need clarification to better understand your query.'
      };
    }

    // Step 2: Run intermediate queries if needed
    let intermediateQueries = [];
    console.log('Intermediate queries to run:', reasoning.intermediateQueries);
    if (reasoning.intermediateQueries && reasoning.intermediateQueries.length > 0) {
      for (const intQuery of reasoning.intermediateQueries) {
        try {
          console.log(`Running intermediate query: ${intQuery.query}`);
          const result = await executeCypherQuery(intQuery.query, context.graphVersion || 'base');
          console.log(`Intermediate query result:`, result);
          intermediateQueries.push({
            query: intQuery.query,
            purpose: intQuery.purpose,
            result: summarizeQueryResult(result)
          });
        } catch (error) {
          console.log(`Intermediate query failed: ${intQuery.query}`, error.message);
          intermediateQueries.push({
            query: intQuery.query,
            purpose: intQuery.purpose,
            result: `Query failed: ${error.message}`
          });
        }
      }
    } else {
      console.log('No intermediate queries provided by reasoning step');
    }

    // Step 3: Generate final query with context from intermediate results
    const finalQuery = await generateFinalQuery(model, query, context, graphSchema, reasoning, intermediateQueries);
    
    return {
      success: true,
      cypherQuery: finalQuery.cypherQuery,
      explanation: finalQuery.explanation,
      reasoning: {
        interpretations: reasoning.interpretations,
        chosenInterpretation: reasoning.chosenInterpretation,
        intermediateQueries
      }
    };

  } catch (error) {
    console.error('Error in enhanced query generation:', error);
    return {
      success: false,
      error: 'AI service is currently unavailable'
    };
  }
}

// Helper function to generate reasoning and multiple interpretations
async function generateReasoningAndInterpretations(model, query, context, graphSchema) {
  const contextInfo = context.currentNodeType ? `Currently viewing: ${context.currentNodeType} nodes` : '';
  const selectedNodes = context.selectedNodes && context.selectedNodes.length > 0 
    ? `Currently selected nodes: ${context.selectedNodes.join(', ')}` 
    : '';

  const reasoningPrompt = `
  You are an expert graph query assistant. Your job is to understand user queries and reason about different possible interpretations.

  ${graphSchema}
  
  Context: ${contextInfo} ${selectedNodes}

  User Query: "${query}"

  IMPORTANT: For a query like "What projects are available for retail?", you should:
  1. Recognize that "retail" could refer to Industry or Sector nodes
  2. Generate intermediate queries to search for retail-related nodes
  3. Choose an interpretation based on what's found in the data
  4. If both exist, ask for clarification

  Please analyze this query and provide your reasoning in the following JSON format:
  {
    "interpretations": [
      "First possible interpretation of what the user might want",
      "Second possible interpretation",
      "Third possible interpretation (if applicable)"
    ],
    "chosenInterpretation": "The most likely interpretation based on context and common usage",
    "needsClarification": false,
    "clarification": null,
    "intermediateQueries": [
      {
        "query": "CYPHER query to explore the data first",
        "purpose": "Why this intermediate query is needed"
      }
    ]
  }

  Guidelines for reasoning:
  1. Consider ambiguous terms (e.g., "retail" could be Industry or Sector)
  2. Think about what data exploration might be needed
  3. If the query is genuinely ambiguous, set needsClarification to true and provide clarification options
  4. ALWAYS suggest intermediate queries to explore available data when the user mentions specific entities
  5. For project-related queries, remember the path: Industry -> Sector -> PainPoint -> ProjectOpportunity

  CRITICAL: You MUST include intermediate queries for the following scenarios:
  - User mentions ANY specific entity name (like "retail", "banking", "healthcare") - ALWAYS check if it exists as Industry, Sector, or Department
  - User asks about projects for a specific industry/sector - ALWAYS first find the relevant nodes
  - User asks about relationships - ALWAYS first check what nodes exist
  
  Example intermediate queries you should suggest:
  - "MATCH (i:Industry) WHERE toLower(i.name) CONTAINS toLower('retail') RETURN i.name LIMIT 5" - to find retail industries
  - "MATCH (s:Sector) WHERE toLower(s.name) CONTAINS toLower('retail') RETURN s.name LIMIT 5" - to find retail sectors
  - "MATCH (d:Department) WHERE toLower(d.name) CONTAINS toLower('retail') RETURN d.name LIMIT 5" - to find retail departments
  
  ALWAYS use toLower() for case-insensitive matching in intermediate queries.

  If clarification is needed, format it as:
  {
    "needsClarification": true,
    "clarification": {
      "question": "What specifically are you looking for?",
      "options": ["Option 1", "Option 2", "Option 3"],
      "context": "additional context if needed"
    }
  }
  `;

  const result = await model.generateContent(reasoningPrompt);
  const response = await result.response;
  const text = response.text();
  
  try {
    let cleanText = text.trim();
    if (cleanText.startsWith('```json')) {
      cleanText = cleanText.slice(7);
    }
    if (cleanText.endsWith('```')) {
      cleanText = cleanText.slice(0, -3);
    }
    
    return JSON.parse(cleanText.trim());
  } catch (parseError) {
    console.error('Failed to parse reasoning response:', parseError);
    // Return a basic interpretation if parsing fails
    return {
      interpretations: [`User wants to explore data related to: ${query}`],
      chosenInterpretation: `User wants to explore data related to: ${query}`,
      needsClarification: false,
      intermediateQueries: []
    };
  }
}

// Helper function to generate the final query with context
async function generateFinalQuery(model, query, context, graphSchema, reasoning, intermediateResults) {
  const contextInfo = context.currentNodeType ? `Currently viewing: ${context.currentNodeType} nodes` : '';
  const selectedNodes = context.selectedNodes && context.selectedNodes.length > 0 
    ? `Currently selected nodes: ${context.selectedNodes.join(', ')}` 
    : '';

  let intermediateContext = '';
  if (intermediateResults.length > 0) {
    intermediateContext = '\nIntermediate Query Results:\n';
    intermediateResults.forEach(result => {
      intermediateContext += `- ${result.purpose}: ${result.result}\n`;
    });
  }

  const finalPrompt = `
  You are a Cypher query generator. Based on the reasoning and intermediate results, generate the final Cypher query.

  ${graphSchema}

  Context: ${contextInfo} ${selectedNodes}
  
  Original Query: "${query}"
  Chosen Interpretation: "${reasoning.chosenInterpretation}"
  ${intermediateContext}

  CRITICAL CYPHER SYNTAX RULES:
  1. MATCH clause: Define all nodes and relationships you need
  2. RETURN clause: Only return variables defined in MATCH
  3. Use LIMIT 50 for large result sets
  4. For projects: Use path Industry -> Sector -> PainPoint -> ProjectOpportunity
  5. UNION queries MUST have identical column names and types
  6. For UNION queries use consistent variable names and alias them:
     Example: MATCH (n:NodeType1) RETURN n.name AS name UNION MATCH (m:NodeType2) RETURN m.name AS name

  Generate a syntactically correct Cypher query and respond in JSON format:
  {
    "success": true,
    "cypherQuery": "YOUR_CYPHER_HERE",
    "explanation": "Clear explanation of what the query does and why this interpretation was chosen"
  }
  `;

  const result = await model.generateContent(finalPrompt);
  const response = await result.response;
  const text = response.text();
  
  try {
    let cleanText = text.trim();
    if (cleanText.startsWith('```json')) {
      cleanText = cleanText.slice(7);
    }
    if (cleanText.endsWith('```')) {
      cleanText = cleanText.slice(0, -3);
    }
    
    return JSON.parse(cleanText.trim());
  } catch (parseError) {
    console.error('Failed to parse final query response:', parseError);
    return {
      success: false,
      error: 'Failed to generate final query'
    };
  }
}

// Helper function to summarize query results for intermediate context
function summarizeQueryResult(result) {
  if (!result || !result.nodes) {
    return 'No results found';
  }
  
  const nodeCount = result.nodes.length;
  const uniqueLabels = [...new Set(result.nodes.map(n => n.group))];
  
  if (nodeCount === 0) {
    return 'No nodes found';
  }
  
  if (nodeCount <= 5) {
    const nodeNames = result.nodes.map(n => n.label).join(', ');
    return `Found ${nodeCount} nodes: ${nodeNames}`;
  }
  
  return `Found ${nodeCount} nodes of types: ${uniqueLabels.join(', ')}`;
}

// Helper function to validate Cypher query syntax
function validateCypherQuery(cypherQuery) {
  const errors = [];
  
  // Check for common syntax errors
  const problematicPatterns = [
    {
      pattern: /RETURN.*-\[.*\]->/,
      error: "Cannot use relationship patterns in RETURN clause. Use variables defined in MATCH instead."
    },
    {
      pattern: /RETURN.*\{\.\*,.*\}/,
      error: "Cannot mix .* with specific properties in map projections."
    },
    {
      pattern: /RETURN.*\[r[0-9]*:/,
      error: "Cannot define relationship variables in RETURN clause. Define them in MATCH instead."
    }
  ];

  // Check each pattern
  for (const { pattern, error } of problematicPatterns) {
    if (pattern.test(cypherQuery)) {
      errors.push(error);
    }
  }

  // Basic structure validation
  if (!cypherQuery.trim().toUpperCase().includes('MATCH')) {
    errors.push("Query must include a MATCH clause.");
  }

  if (!cypherQuery.trim().toUpperCase().includes('RETURN')) {
    errors.push("Query must include a RETURN clause.");
  }

  // Check for undefined variables in RETURN
  const returnMatch = cypherQuery.match(/RETURN\s+(.+?)(?:\s+LIMIT|\s+ORDER|\s*$)/i);
  if (returnMatch) {
    const returnClause = returnMatch[1];
    const matchClause = cypherQuery.split(/\s+RETURN\s+/i)[0];
    
    // Extract variable names from RETURN (simplified check)
    const returnVars = returnClause.match(/\b[a-z]\b/gi) || [];
    const matchVars = matchClause.match(/\([a-z]:/gi) || [];
    const definedVars = matchVars.map(v => v.replace(/^\(/, '').replace(/:$/, ''));
    
    for (const returnVar of returnVars) {
      if (!definedVars.includes(returnVar) && !['LIMIT', 'ORDER', 'BY'].includes(returnVar.toUpperCase())) {
        // This is a simplified check - in practice, more sophisticated parsing would be needed
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

// Helper function to find similar nodes when exact matches don't exist
async function findSimilarNodes(searchTerm, nodeType, version = 'base') {
  const session = getVersionSession(version);
  
  try {
    // If searchTerm is empty, return all available nodes
    if (!searchTerm || searchTerm.trim().length === 0) {
      const allQuery = `MATCH (n:${nodeType}) RETURN n.name as name LIMIT 10`;
      const allResult = await session.run(allQuery);
      
      return {
        exact: false,
        nodes: allResult.records.map(record => record.get('name')),
        matchType: 'all_available'
      };
    }
    
    // First try exact match
    const exactQuery = `MATCH (n:${nodeType}) WHERE n.name = $searchTerm RETURN n LIMIT 1`;
    const exactResult = await session.run(exactQuery, { searchTerm });
    
    if (exactResult.records.length > 0) {
      return { exact: true, nodes: [] }; // Exact match found, no suggestions needed
    }
    
    // Try partial matches with CONTAINS
    const partialQuery = `MATCH (n:${nodeType}) WHERE n.name CONTAINS $searchTerm RETURN n.name as name LIMIT 5`;
    const partialResult = await session.run(partialQuery, { searchTerm });
    
    if (partialResult.records.length > 0) {
      return {
        exact: false,
        nodes: partialResult.records.map(record => record.get('name')),
        matchType: 'partial'
      };
    }
    
    // Try fuzzy matching (case-insensitive contains)
    const fuzzyQuery = `MATCH (n:${nodeType}) WHERE toLower(n.name) CONTAINS toLower($searchTerm) RETURN n.name as name LIMIT 5`;
    const fuzzyResult = await session.run(fuzzyQuery, { searchTerm });
    
    if (fuzzyResult.records.length > 0) {
      return {
        exact: false,
        nodes: fuzzyResult.records.map(record => record.get('name')),
        matchType: 'fuzzy'
      };
    }
    
    // Get all available nodes of this type for suggestions
    const allQuery = `MATCH (n:${nodeType}) RETURN n.name as name LIMIT 10`;
    const allResult = await session.run(allQuery);
    
    return {
      exact: false,
      nodes: allResult.records.map(record => record.get('name')),
      matchType: 'all_available'
    };
    
  } catch (error) {
    console.error('Error finding similar nodes:', error);
    return { exact: false, nodes: [], matchType: 'error' };
  } finally {
    await session.close();
  }
}

// Helper function to create a more intelligent fallback query with suggestions
async function createIntelligentFallback(originalQuery, context) {
  const queryLower = originalQuery.toLowerCase();
  
  // Extract potential node names from the query
  const extractNodeName = (query, keywords) => {
    for (const keyword of keywords) {
      const regex = new RegExp(`${keyword}\\s+(\\w+)`, 'i');
      const match = query.match(regex);
      if (match) return match[1];
    }
    return null;
  };

  // Check for specific node types mentioned
  if (queryLower.includes('industry') || queryLower.includes('industries')) {
    const nodeName = extractNodeName(originalQuery, ['for', 'in', 'of']);
    if (nodeName) {
      const suggestions = await findSimilarNodes(nodeName, 'Industry', context.graphVersion);
      if (!suggestions.exact && suggestions.nodes.length > 0) {
        return {
          cypherQuery: "MATCH (i:Industry) RETURN i LIMIT 50",
          explanation: `I couldn't find an industry named "${nodeName}". Did you mean one of these: ${suggestions.nodes.join(', ')}? Here are all available industries:`,
          suggestions: suggestions.nodes,
          suggestedNodeType: 'Industry'
        };
      }
    }
    return {
      cypherQuery: "MATCH (i:Industry) RETURN i LIMIT 50",
      explanation: "Here are all available industries:"
    };
  }
  
  if (queryLower.includes('sector') || queryLower.includes('sectors')) {
    const nodeName = extractNodeName(originalQuery, ['for', 'in', 'of']);
    if (nodeName) {
      const suggestions = await findSimilarNodes(nodeName, 'Sector', context.graphVersion);
      if (!suggestions.exact && suggestions.nodes.length > 0) {
        return {
          cypherQuery: "MATCH (s:Sector) RETURN s LIMIT 50",
          explanation: `I couldn't find a sector named "${nodeName}". Did you mean one of these: ${suggestions.nodes.join(', ')}? Here are all available sectors:`,
          suggestions: suggestions.nodes,
          suggestedNodeType: 'Sector'
        };
      }
    }
    return {
      cypherQuery: "MATCH (s:Sector) RETURN s LIMIT 50", 
      explanation: "Here are all available sectors:"
    };
  }
  
  if (queryLower.includes('project')) {
    // Extract industry/sector name from project queries
    const industryName = extractNodeName(originalQuery, ['for', 'in', 'available for']);
    if (industryName) {
      // Check if the industry exists
      const suggestions = await findSimilarNodes(industryName, 'Industry', context.graphVersion);
      if (!suggestions.exact && suggestions.nodes.length > 0) {
        return {
          cypherQuery: "MATCH (n:ProjectOpportunity) RETURN n AS node, 'ProjectOpportunity' AS type LIMIT 25 UNION MATCH (n:ProjectBlueprint) RETURN n AS node, 'ProjectBlueprint' AS type LIMIT 25",
          explanation: `I couldn't find an industry named "${industryName}". Did you mean one of these: ${suggestions.nodes.join(', ')}? Here are all available projects:`,
          suggestions: suggestions.nodes,
          suggestedNodeType: 'Industry'
        };
      }
      
      // Also check sectors
      const sectorSuggestions = await findSimilarNodes(industryName, 'Sector', context.graphVersion);
      if (!sectorSuggestions.exact && sectorSuggestions.nodes.length > 0) {
        return {
          cypherQuery: "MATCH (n:ProjectOpportunity) RETURN n AS node, 'ProjectOpportunity' AS type LIMIT 25 UNION MATCH (n:ProjectBlueprint) RETURN n AS node, 'ProjectBlueprint' AS type LIMIT 25",
          explanation: `I couldn't find "${industryName}" as an industry, but found similar sectors: ${sectorSuggestions.nodes.join(', ')}. Here are all available projects:`,
          suggestions: sectorSuggestions.nodes,
          suggestedNodeType: 'Sector'
        };
      }
    }
    
    return {
      cypherQuery: "MATCH (n:ProjectOpportunity) RETURN n AS node, 'ProjectOpportunity' AS type LIMIT 25 UNION MATCH (n:ProjectBlueprint) RETURN n AS node, 'ProjectBlueprint' AS type LIMIT 25",
      explanation: "Here are all available projects:"
    };
  }
  
  if (queryLower.includes('pain') || queryLower.includes('problem')) {
    return {
      cypherQuery: "MATCH (p:PainPoint) RETURN p LIMIT 50",
      explanation: "Here are all available pain points:"
    };
  }
  
  if (queryLower.includes('relationship') || queryLower.includes('connection') || queryLower.includes('connect')) {
    return {
      cypherQuery: "MATCH (n)-[r]-(m) RETURN n, r, m LIMIT 50",
      explanation: "Here are sample relationships in the graph:"
    };
  }
  
  // Default fallback
  return {
    cypherQuery: "MATCH (n) RETURN n LIMIT 25",
    explanation: "Here are some sample nodes from the graph:"
  };
}

// Helper function to create a fallback simple query (legacy - keeping for backward compatibility)
function createFallbackQuery(originalQuery, context) {
  // This is now a simple wrapper around the more intelligent version
  // We'll make it async-compatible by returning a Promise
  return createIntelligentFallback(originalQuery, context);
}

// Helper function to execute Cypher query and format results
async function executeCypherQuery(cypherQuery, version = 'base') {
  const session = getVersionSession(version);
  
  try {
    const result = await session.run(cypherQuery);
    const nodes = [];
    const edges = [];
    const nodeIds = new Set();
    const edgeIds = new Set();

    result.records.forEach(record => {
      // Process each field in the record
      record.keys.forEach(key => {
        const value = record.get(key);
        
        if (value && typeof value === 'object') {
          // Handle Neo4j Node objects
          if (value.labels && value.properties) {
            const nodeId = value.identity ? value.identity.toString() : value.elementId;
            if (!nodeIds.has(nodeId)) {
              nodeIds.add(nodeId);
              nodes.push({
                id: nodeId,
                label: value.properties.name || value.properties.label || 'Unnamed',
                group: value.labels[0],
                properties: value.properties
              });
            }
          }
          // Handle Neo4j Relationship objects  
          else if (value.type && value.start && value.end) {
            const edgeId = value.identity ? value.identity.toString() : value.elementId;
            const relationshipId = `${value.start}-${value.type}-${value.end}`;
            if (!edgeIds.has(relationshipId)) {
              edgeIds.add(relationshipId);
              edges.push({
                id: edgeId,
                from: value.start.toString(),
                to: value.end.toString(),
                label: value.type,
                type: value.type
              });
            }
          }
          // Handle Path objects
          else if (value.segments) {
            value.segments.forEach(segment => {
              // Add start node
              const startNodeId = segment.start.identity.toString();
              if (!nodeIds.has(startNodeId)) {
                nodeIds.add(startNodeId);
                nodes.push({
                  id: startNodeId,
                  label: segment.start.properties.name || segment.start.properties.label || 'Unnamed',
                  group: segment.start.labels[0],
                  properties: segment.start.properties
                });
              }
              
              // Add end node  
              const endNodeId = segment.end.identity.toString();
              if (!nodeIds.has(endNodeId)) {
                nodeIds.add(endNodeId);
                nodes.push({
                  id: endNodeId,
                  label: segment.end.properties.name || segment.end.properties.label || 'Unnamed', 
                  group: segment.end.labels[0],
                  properties: segment.end.properties
                });
              }
              
              // Add relationship
              const relationshipId = `${segment.start.identity}-${segment.relationship.type}-${segment.end.identity}`;
              if (!edgeIds.has(relationshipId)) {
                edgeIds.add(relationshipId);
                edges.push({
                  id: segment.relationship.identity.toString(),
                  from: segment.start.identity.toString(),
                  to: segment.end.identity.toString(),
                  label: segment.relationship.type,
                  type: segment.relationship.type
                });
              }
            });
          }
        }
      });
    });

    return { nodes, edges };
    
  } catch (error) {
    console.error('Cypher execution error:', error);
    throw error;
  } finally {
    await session.close();
  }
}

// Helper function to generate result summary
function generateResultSummary(graphData) {
  const nodeCount = graphData.nodes.length;
  const edgeCount = graphData.edges.length;
  
  if (nodeCount === 0) {
    return "No results found for your query.";
  }
  
  const nodeTypes = [...new Set(graphData.nodes.map(n => n.group))];
  const nodeTypesList = nodeTypes.length > 3 
    ? nodeTypes.slice(0, 3).join(', ') + ` and ${nodeTypes.length - 3} other types`
    : nodeTypes.join(', ');
    
  return `Found ${nodeCount} node${nodeCount !== 1 ? 's' : ''} (${nodeTypesList}) ${
    edgeCount > 0 ? `with ${edgeCount} relationship${edgeCount !== 1 ? 's' : ''}` : ''
  }.`;
}

// Smart update endpoints

// Generate Cypher query from natural language
app.post('/api/smart-update/generate-cypher', async (req, res) => {
  const { naturalLanguageUpdate, version = 'base', conversationHistory = [] } = req.body;
  
  try {
    if (!naturalLanguageUpdate || naturalLanguageUpdate.trim().length === 0) {
      return res.status(400).json({ error: 'Natural language update description is required' });
    }
    
    const cypherQuery = await generateCypherFromNaturalLanguage(naturalLanguageUpdate, conversationHistory, version);
    
    res.json({ 
      cypherQuery,
      naturalLanguage: naturalLanguageUpdate,
      conversationHistory,
      message: 'Cypher query generated successfully' 
    });
  } catch (error) {
    console.error('Error generating Cypher query:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to generate Cypher query',
      details: error.message
    });
  }
});

// Generate before/after preview of the update
app.post('/api/smart-update/preview', async (req, res) => {
  const { cypherQuery, version = 'base' } = req.body;
  
  try {
    if (!cypherQuery || cypherQuery.trim().length === 0) {
      return res.status(400).json({ error: 'Cypher query is required' });
    }
    
    // Validate the query
    const validation = validateCypherSyntax(cypherQuery);
    if (!validation.isValid) {
      return res.status(400).json({ error: validation.error });
    }
    
    // Get before and after states
    const beforeState = await getBeforeState(cypherQuery, version);
    const afterState = await getAfterState(cypherQuery, beforeState, version);
    
    res.json({
      beforeState,
      afterState,
      cypherQuery,
      message: 'Preview generated successfully'
    });
  } catch (error) {
    console.error('Error generating preview:', error);
    res.status(500).json({ 
      error: 'Failed to generate preview',
      details: error.message
    });
  }
});

// Apply the accepted update by creating a new graph version
app.post('/api/smart-update/apply', async (req, res) => {
  const { cypherQuery, version = 'base', newVersionName } = req.body;
  
  try {
    if (!cypherQuery || cypherQuery.trim().length === 0) {
      return res.status(400).json({ error: 'Cypher query is required' });
    }
    
    if (!newVersionName || newVersionName.trim().length === 0) {
      return res.status(400).json({ error: 'New version name is required' });
    }
    
    // Create new version name with timestamp
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:]/g, '-');
    const fullVersionName = `${newVersionName}-${timestamp}`;
    const newDbName = getDatabaseName(fullVersionName);
    
    // Create new database for the version
    await createDatabase(newDbName);
    
    // Copy current graph data to new database
    const sourceSession = getVersionSession(version);
    const targetSession = getVersionSession(fullVersionName);
    
    try {
      // Export all data from source
      const exportResult = await sourceSession.run(`
        CALL apoc.export.cypher.all(null, {stream: true, format: "cypher-shell"})
        YIELD file, batches, source, format, nodes, relationships, properties, time, rows, batchSize, batches, done
        RETURN source
      `);
      
      // For now, use a simpler approach - copy data manually
      // Copy all nodes
      const nodesResult = await sourceSession.run('MATCH (n) RETURN n');
      const relsResult = await sourceSession.run('MATCH (a)-[r]->(b) RETURN a, r, b');
      
      // Apply the update to the new version
      await targetSession.run(cypherQuery);
      
      res.json({
        message: 'Update applied successfully',
        newVersion: fullVersionName,
        newDatabaseName: newDbName,
        cypherQuery
      });
    } finally {
      await sourceSession.close();
      await targetSession.close();
    }
  } catch (error) {
    console.error('Error applying smart update:', error);
    res.status(500).json({ 
      error: 'Failed to apply update',
      details: error.message
    });
  }
});

// Refine Cypher query based on user feedback (iterative improvement)
app.post('/api/smart-update/refine', async (req, res) => {
  const { 
    originalRequest, 
    currentCypher, 
    feedback, 
    conversationHistory = [], 
    version = 'base' 
  } = req.body;
  
  try {
    if (!originalRequest || !currentCypher || !feedback) {
      return res.status(400).json({ 
        error: 'Original request, current Cypher query, and feedback are all required' 
      });
    }
    
    // Add current iteration to conversation history
    const updatedHistory = [...conversationHistory, {
      userRequest: originalRequest,
      cypherQuery: currentCypher,
      feedback: feedback
    }];
    
    // Generate refined query using conversation history
    const refinementRequest = `Based on the feedback: "${feedback}", please modify the query to better meet the requirements.`;
    const refinedCypher = await generateCypherFromNaturalLanguage(refinementRequest, updatedHistory, version);
    
    res.json({
      refinedCypher,
      originalRequest,
      feedback,
      conversationHistory: updatedHistory,
      message: 'Cypher query refined successfully'
    });
  } catch (error) {
    console.error('Error refining Cypher query:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to refine Cypher query',
      details: error.message
    });
  }
});

// Get project opportunities based on selections
app.post('/api/projects', async (req, res) => {
  const session = driver.session();
  const { viewMode, industries, sectors, departments, painPoints } = req.body;
  
  try {
    let query;
    let params;
    
    if (viewMode === 'sector') {
      // Sector-based projects: find projects that address selected pain points
      // and are either connected to selected sectors OR not connected to any sector
      query = `
        MATCH (po:ProjectOpportunity)-[:ADDRESSES]->(pp:PainPoint)
        MATCH (po)-[:IS_INSTANCE_OF]->(pb:ProjectBlueprint)
        WHERE pp.name IN $painPoints
        OPTIONAL MATCH (s:Sector)-[:HAS_OPPORTUNITY]->(po)
        WHERE s IS NULL OR s.name IN $sectors
        OPTIONAL MATCH (po)-[r:REQUIRES_ROLE]->(role:Role)
        OPTIONAL MATCH (po)-[:NEEDS_SUBMODULE]->(sm:SubModule)
        RETURN DISTINCT po.title as title, 
               po.priority as priority,
               po.business_case as businessCase,
               po.budget_range as budgetRange,
               po.duration as duration,
               pb.title as blueprintTitle,
               s.name as sector,
               null as department,
               pp.name as painPoint,
               COLLECT(DISTINCT {name: role.name, specialty: r.specialty}) as requiredRoles,
               COLLECT(DISTINCT sm.name) as subModules
        ORDER BY 
          CASE po.priority 
            WHEN 'High' THEN 1 
            WHEN 'Medium' THEN 2 
            ELSE 3 
          END,
          po.title
      `;
      params = { sectors, painPoints };
    } else {
      // Department-based projects
      query = `
        MATCH (d:Department)-[:HAS_OPPORTUNITY]->(po:ProjectOpportunity)
        MATCH (po)-[:ADDRESSES]->(pp:PainPoint)
        MATCH (po)-[:IS_INSTANCE_OF]->(pb:ProjectBlueprint)
        WHERE d.name IN $departments AND pp.name IN $painPoints
        OPTIONAL MATCH (po)-[r:REQUIRES_ROLE]->(role:Role)
        OPTIONAL MATCH (po)-[:NEEDS_SUBMODULE]->(sm:SubModule)
        RETURN DISTINCT po.title as title, 
               po.priority as priority,
               po.business_case as businessCase,
               po.budget_range as budgetRange,
               po.duration as duration,
               pb.title as blueprintTitle,
               null as sector,
               d.name as department,
               pp.name as painPoint,
               COLLECT(DISTINCT {name: role.name, specialty: r.specialty}) as requiredRoles,
               COLLECT(DISTINCT sm.name) as subModules
        ORDER BY 
          CASE po.priority 
            WHEN 'High' THEN 1 
            WHEN 'Medium' THEN 2 
            ELSE 3 
          END,
          po.title
      `;
      params = { departments, painPoints };
    }
    
    const result = await session.run(query, params);
    const projects = result.records.map(record => ({
      title: record.get('title'),
      priority: record.get('priority'),
      businessCase: record.get('businessCase'),
      budgetRange: record.get('budgetRange'),
      duration: record.get('duration'),
      blueprintTitle: record.get('blueprintTitle'),
      sector: record.get('sector'),
      department: record.get('department'),
      painPoint: record.get('painPoint'),
      requiredRoles: record.get('requiredRoles').filter(role => role.name !== null),
      subModules: record.get('subModules').filter(module => module !== null)
    }));
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    await session.close();
  }
});

// Get detailed project information
app.get('/api/project-details/:title', async (req, res) => {
  const session = driver.session();
  const { title } = req.params;
  
  try {
    const query = `
      MATCH (po:ProjectOpportunity {title: $title})
      MATCH (po)-[:IS_INSTANCE_OF]->(pb:ProjectBlueprint)
      OPTIONAL MATCH (po)-[r:REQUIRES_ROLE]->(role:Role)
      OPTIONAL MATCH (po)-[:NEEDS_SUBMODULE]->(sm:SubModule)
      OPTIONAL MATCH (sm)<-[:CONTAINS]-(m:Module)
      RETURN po.title AS title,
             po.priority as priority,
             po.business_case as businessCase,
             po.budget_range as budgetRange,
             po.duration as duration,
             pb.title as blueprintTitle,
             COLLECT(DISTINCT {role: role.name, specialty: r.specialty}) AS requiredRoles,
             COLLECT(DISTINCT {subModule: sm.name, module: m.name}) AS moduleDetails
    `;
    const result = await session.run(query, { title });
    
    if (result.records.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const record = result.records[0];
    const projectDetails = {
      title: record.get('title'),
      priority: record.get('priority'),
      businessCase: record.get('businessCase'),
      budgetRange: record.get('budgetRange'),
      duration: record.get('duration'),
      blueprintTitle: record.get('blueprintTitle'),
      requiredRoles: record.get('requiredRoles').filter(role => role.role !== null),
      moduleDetails: record.get('moduleDetails').filter(detail => detail.subModule !== null)
    };
    
    res.json(projectDetails);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    await session.close();
  }
});

// Initialize database with schema
app.post('/api/init-database', async (req, res) => {
  const session = driver.session();
  try {
    const fs = require('fs');
    const path = require('path');
    const cypherScript = fs.readFileSync(path.join(__dirname, '..', 'catalog.cypher'), 'utf8');
    
    // Split by line breaks and process CREATE/MERGE statements
    const lines = cypherScript.split('\n');
    let currentQuery = '';
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Skip comments and empty lines
      if (!trimmedLine || trimmedLine.startsWith('//')) {
        continue;
      }
      
      currentQuery += line + '\n';
      
      // Execute when we hit a line ending with semicolon or a standalone MERGE/CREATE
      if (trimmedLine.endsWith(';') || 
          (trimmedLine.startsWith('MERGE ') || trimmedLine.startsWith('CREATE ')) && 
          !currentQuery.includes('MATCH')) {
        
        const queryToExecute = currentQuery.replace(/;$/, '').trim();
        if (queryToExecute) {
          console.log('Executing query:', queryToExecute.substring(0, 100) + '...');
          await session.run(queryToExecute);
        }
        currentQuery = '';
      }
    }
    
    // Execute any remaining query
    if (currentQuery.trim()) {
      const queryToExecute = currentQuery.replace(/;$/, '').trim();
      console.log('Executing final query:', queryToExecute.substring(0, 100) + '...');
      await session.run(queryToExecute);
    }
    
    res.json({ message: 'Database initialized successfully' });
  } catch (error) {
    console.error('Database initialization error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    await session.close();
  }
});

// =====================
// GRAPH VERSION MANAGEMENT
// =====================

// Get available graph versions
app.get('/api/admin/versions', async (req, res) => {
  try {
    // Get all databases and extract version names
    const databases = await listDatabases();
    const versions = [GRAPH_VERSIONS.BASE]; // Always include base
    
    databases.forEach(db => {
      if (db.name.startsWith('catalog-')) {
        // Extract version name from database name
        const versionName = db.name.replace('catalog-', '');
        if (versionName && !versions.includes(versionName)) {
          versions.push(versionName);
        }
      }
    });
    
    res.json(versions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new admin draft version by copying base graph
app.post('/api/admin/versions/create-draft', async (req, res) => {
  const session = driver.session();
  
  try {
    // First, delete any existing draft
    await session.run('MATCH (n) WHERE any(label in labels(n) WHERE label ENDS WITH "_admin_draft") DETACH DELETE n');
    
    // Copy all base nodes to draft
    const nodeTypes = ['Industry', 'Sector', 'Department', 'PainPoint', 'ProjectOpportunity', 'ProjectBlueprint', 'Role', 'SubModule'];
    
    for (const nodeType of nodeTypes) {
      const copyNodesQuery = `
        MATCH (n:${nodeType})
        CREATE (copy:${getVersionedLabel(nodeType, GRAPH_VERSIONS.ADMIN_DRAFT)})
        SET copy = properties(n)
        WITH n, copy
        SET copy.original_id = id(n)
      `;
      await session.run(copyNodesQuery);
    }
    
    // Copy relationships
    const copyRelationshipsQuery = `
      MATCH (n)-[r]->(m)
      WHERE NOT any(label in labels(n) WHERE label ENDS WITH "_admin_draft")
      AND NOT any(label in labels(m) WHERE label ENDS WITH "_admin_draft")
      WITH n, r, m, type(r) as relType, properties(r) as relProps
      MATCH (n_copy), (m_copy)
      WHERE n_copy.original_id = id(n) AND m_copy.original_id = id(m)
      AND any(label in labels(n_copy) WHERE label ENDS WITH "_admin_draft")
      AND any(label in labels(m_copy) WHERE label ENDS WITH "_admin_draft")
      CALL apoc.create.relationship(n_copy, relType, relProps, m_copy) YIELD rel
      RETURN count(rel)
    `;
    
    try {
      await session.run(copyRelationshipsQuery);
    } catch (error) {
      // Fallback method without APOC
      console.warn('APOC not available, using basic relationship copying');
      
      // Copy common relationships manually
      const relationshipQueries = [
        'MATCH (i:Industry)-[r:HAS_SECTOR]->(s:Sector) MATCH (i_copy), (s_copy) WHERE i_copy.original_id = id(i) AND s_copy.original_id = id(s) AND any(label in labels(i_copy) WHERE label ENDS WITH "_admin_draft") AND any(label in labels(s_copy) WHERE label ENDS WITH "_admin_draft") CREATE (i_copy)-[:HAS_SECTOR]->(s_copy)',
        'MATCH (s:Sector)-[r:EXPERIENCES]->(pp:PainPoint) MATCH (s_copy), (pp_copy) WHERE s_copy.original_id = id(s) AND pp_copy.original_id = id(pp) AND any(label in labels(s_copy) WHERE label ENDS WITH "_admin_draft") AND any(label in labels(pp_copy) WHERE label ENDS WITH "_admin_draft") CREATE (s_copy)-[:EXPERIENCES]->(pp_copy)',
        'MATCH (d:Department)-[r:EXPERIENCES]->(pp:PainPoint) MATCH (d_copy), (pp_copy) WHERE d_copy.original_id = id(d) AND pp_copy.original_id = id(pp) AND any(label in labels(d_copy) WHERE label ENDS WITH "_admin_draft") AND any(label in labels(pp_copy) WHERE label ENDS WITH "_admin_draft") CREATE (d_copy)-[:EXPERIENCES]->(pp_copy)'
      ];
      
      for (const relQuery of relationshipQueries) {
        try {
          await session.run(relQuery);
        } catch (relError) {
          console.warn('Error copying relationship:', relError.message);
        }
      }
    }
    
    res.json({ message: 'Admin draft version created successfully' });
  } catch (error) {
    console.error('Error creating draft version:', error);
    res.status(500).json({ error: error.message });
  } finally {
    await session.close();
  }
});

// Delete admin draft version (reset to base)
app.delete('/api/admin/versions/draft', async (req, res) => {
  const session = driver.session();
  
  try {
    const query = 'MATCH (n) WHERE any(label in labels(n) WHERE label ENDS WITH "_admin_draft") DETACH DELETE n';
    await session.run(query);
    
    res.json({ message: 'Admin draft version deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    await session.close();
  }
});

// Delete a specific version
app.delete('/api/admin/versions/:versionName', async (req, res) => {
  const { versionName } = req.params;
  
  try {
    // Prevent deletion of base version
    if (versionName === GRAPH_VERSIONS.BASE || versionName === 'base') {
      return res.status(403).json({ error: 'Cannot delete base version' });
    }
    
    const dbName = getDatabaseName(versionName);
    
    // Check if database exists
    const databases = await listDatabases();
    const dbExists = databases.find(db => db.name === dbName);
    
    if (!dbExists) {
      return res.status(404).json({ error: `Version "${versionName}" not found` });
    }
    
    // Drop the database
    await dropDatabase(dbName);
    
    res.json({ 
      message: `Version "${versionName}" deleted successfully`,
      database: dbName,
      versionName 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Promote admin draft to base (make changes permanent)
app.post('/api/admin/versions/promote-draft', async (req, res) => {
  const session = driver.session();
  
  try {
    // This is a complex operation - for now, we'll just return an error
    // In a production system, this would involve careful migration of changes
    res.status(501).json({ error: 'Draft promotion not implemented yet - this would replace base graph with draft changes' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    await session.close();
  }
});

// =====================
// ADMIN API ENDPOINTS
// =====================

// Get all nodes of a specific type
app.get('/api/admin/nodes/:type', async (req, res) => {
  const { type } = req.params;
  const version = req.query.version || GRAPH_VERSIONS.BASE;
  const session = getVersionSession(version);
  
  try {
    let query = '';
    
    switch (type.toLowerCase()) {
      case 'industry':
      case 'industries':
        query = 'MATCH (n:Industry) RETURN n ORDER BY n.name';
        break;
      case 'sector':
      case 'sectors':
        query = 'MATCH (n:Sector) RETURN n, [(n)<-[:HAS_SECTOR]-(i:Industry) | i.name] as industries ORDER BY n.name';
        break;
      case 'department':
      case 'departments':
        query = 'MATCH (n:Department) RETURN n ORDER BY n.name';
        break;
      case 'painpoint':
      case 'painpoints':
        query = 'MATCH (n:PainPoint) RETURN n ORDER BY n.name';
        break;
      case 'project':
      case 'projects':
        query = 'MATCH (n:ProjectOpportunity) RETURN n ORDER BY n.title';
        break;
      case 'blueprint':
      case 'blueprints':
        query = 'MATCH (n:ProjectBlueprint) RETURN n ORDER BY n.title';
        break;
      case 'role':
      case 'roles':
        query = 'MATCH (n:Role) RETURN n ORDER BY n.name';
        break;
      default:
        return res.status(400).json({ error: 'Invalid node type' });
    }
    
    const result = await session.run(query);
    const nodes = result.records.map(record => {
      const node = record.get('n');
      const nodeData = {
        id: node.identity.toString(),
        labels: node.labels,
        properties: node.properties,
        version: version
      };
      
      // Add additional info for sectors
      if (type.toLowerCase() === 'sector' || type.toLowerCase() === 'sectors') {
        nodeData.industries = record.get('industries') || [];
      }
      
      return nodeData;
    });
    
    res.json(nodes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    await session.close();
  }
});

// Get graph statistics
app.get('/api/admin/stats', async (req, res) => {
  const version = req.query.version || GRAPH_VERSIONS.BASE;
  const session = getVersionSession(version);
  
  try {
    const stats = { version };
    
    // Count nodes by type
    const nodeCountQueries = [
      { type: 'Industry', query: 'MATCH (n:Industry) RETURN count(n) as count' },
      { type: 'Sector', query: 'MATCH (n:Sector) RETURN count(n) as count' },
      { type: 'Department', query: 'MATCH (n:Department) RETURN count(n) as count' },
      { type: 'PainPoint', query: 'MATCH (n:PainPoint) RETURN count(n) as count' },
      { type: 'ProjectOpportunity', query: 'MATCH (n:ProjectOpportunity) RETURN count(n) as count' },
      { type: 'ProjectBlueprint', query: 'MATCH (n:ProjectBlueprint) RETURN count(n) as count' },
      { type: 'Role', query: 'MATCH (n:Role) RETURN count(n) as count' },
      { type: 'SubModule', query: 'MATCH (n:SubModule) RETURN count(n) as count' }
    ];
    
    for (const { type, query } of nodeCountQueries) {
      const result = await session.run(query);
      stats[type] = result.records[0].get('count').toNumber();
    }
    
    // Count relationships
    const relationshipQuery = 'MATCH ()-[r]->() RETURN count(r) as count';
    const relResult = await session.run(relationshipQuery);
    stats.TotalRelationships = relResult.records[0].get('count').toNumber();
    
    // Find orphaned nodes
    const orphanQuery = 'MATCH (n) WHERE NOT (n)--() RETURN count(n) as count';
    const orphanResult = await session.run(orphanQuery);
    stats.OrphanedNodes = orphanResult.records[0].get('count').toNumber();
    
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    await session.close();
  }
});

// Create a new node
app.post('/api/admin/nodes/:type', async (req, res) => {
  const session = driver.session();
  const { type } = req.params;
  const nodeData = req.body;
  const version = req.query.version || GRAPH_VERSIONS.BASE;
  
  // Only allow creation in admin_draft version for safety
  if (version === GRAPH_VERSIONS.BASE) {
    return res.status(403).json({ error: 'Cannot modify base graph directly. Create a draft version first.' });
  }
  
  try {
    let baseQuery = '';
    let params = {};
    
    switch (type.toLowerCase()) {
      case 'industry':
        baseQuery = 'CREATE (n:Industry {name: $name}) RETURN n';
        params = { name: nodeData.name };
        break;
      case 'sector':
        baseQuery = 'CREATE (n:Sector {name: $name}) RETURN n';
        params = { name: nodeData.name };
        break;
      case 'department':
        baseQuery = 'CREATE (n:Department {name: $name}) RETURN n';
        params = { name: nodeData.name };
        break;
      case 'painpoint':
        baseQuery = 'CREATE (n:PainPoint {name: $name, impact: $impact}) RETURN n';
        params = { name: nodeData.name, impact: nodeData.impact || '' };
        break;
      default:
        return res.status(400).json({ error: 'Node type not supported for creation' });
    }
    
    const query = baseQuery;
    const result = await session.run(query, params);
    const createdNode = result.records[0].get('n');
    
    res.json({
      id: createdNode.identity.toString(),
      labels: createdNode.labels,
      properties: createdNode.properties,
      version: version
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    await session.close();
  }
});

// Update a node
app.put('/api/admin/nodes/:type/:id', async (req, res) => {
  const session = driver.session();
  const { type, id } = req.params;
  const nodeData = req.body;
  const version = req.query.version || GRAPH_VERSIONS.BASE;
  
  // Only allow updates in admin_draft version for safety
  if (version === GRAPH_VERSIONS.BASE) {
    return res.status(403).json({ error: 'Cannot modify base graph directly. Create a draft version first.' });
  }
  
  try {
    let baseQuery = '';
    let params = { id: parseInt(id) };
    
    switch (type.toLowerCase()) {
      case 'industry':
        baseQuery = 'MATCH (n:Industry) WHERE ID(n) = $id SET n.name = $name RETURN n';
        params.name = nodeData.name;
        break;
      case 'sector':
        baseQuery = 'MATCH (n:Sector) WHERE ID(n) = $id SET n.name = $name RETURN n';
        params.name = nodeData.name;
        break;
      case 'department':
        baseQuery = 'MATCH (n:Department) WHERE ID(n) = $id SET n.name = $name RETURN n';
        params.name = nodeData.name;
        break;
      case 'painpoint':
        baseQuery = 'MATCH (n:PainPoint) WHERE ID(n) = $id SET n.name = $name, n.impact = $impact RETURN n';
        params.name = nodeData.name;
        params.impact = nodeData.impact || '';
        break;
      default:
        return res.status(400).json({ error: 'Node type not supported for updates' });
    }
    
    const query = baseQuery;
    const result = await session.run(query, params);
    if (result.records.length === 0) {
      return res.status(404).json({ error: 'Node not found' });
    }
    
    const updatedNode = result.records[0].get('n');
    res.json({
      id: updatedNode.identity.toString(),
      labels: updatedNode.labels,
      properties: updatedNode.properties,
      version: version
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    await session.close();
  }
});

// Delete a node
app.delete('/api/admin/nodes/:type/:id', async (req, res) => {
  const session = driver.session();
  const { type, id } = req.params;
  const version = req.query.version || GRAPH_VERSIONS.BASE;
  
  // Only allow deletion in admin_draft version for safety
  if (version === GRAPH_VERSIONS.BASE) {
    return res.status(403).json({ error: 'Cannot modify base graph directly. Create a draft version first.' });
  }
  
  try {
    const query = 'MATCH (n) WHERE ID(n) = $id DETACH DELETE n';
    const result = await session.run(query, { id: parseInt(id) });
    
    res.json({ message: 'Node deleted successfully', deletedId: id, version: version });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    await session.close();
  }
});

// Get all relationships
app.get('/api/admin/relationships', async (req, res) => {
  const session = driver.session();
  
  try {
    const query = `
      MATCH (n)-[r]->(m) 
      RETURN ID(n) as sourceId, labels(n) as sourceLabels, n.name as sourceName,
             type(r) as relationshipType, properties(r) as relationshipProps,
             ID(m) as targetId, labels(m) as targetLabels, m.name as targetName
      ORDER BY type(r), n.name
    `;
    
    const result = await session.run(query);
    const relationships = result.records.map(record => ({
      source: {
        id: record.get('sourceId').toString(),
        labels: record.get('sourceLabels'),
        name: record.get('sourceName')
      },
      relationship: {
        type: record.get('relationshipType'),
        properties: record.get('relationshipProps')
      },
      target: {
        id: record.get('targetId').toString(),
        labels: record.get('targetLabels'),
        name: record.get('targetName')
      }
    }));
    
    res.json(relationships);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    await session.close();
  }
});

// Find orphaned nodes
app.get('/api/admin/orphans', async (req, res) => {
  const session = driver.session();
  
  try {
    const query = 'MATCH (n) WHERE NOT (n)--() RETURN ID(n) as id, labels(n) as labels, properties(n) as properties';
    const result = await session.run(query);
    
    const orphans = result.records.map(record => ({
      id: record.get('id').toString(),
      labels: record.get('labels'),
      properties: record.get('properties')
    }));
    
    res.json(orphans);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    await session.close();
  }
});

// Get specific node with its direct connections for visualization
app.get('/api/admin/node/:nodeId/graph', async (req, res) => {
  const session = driver.session();
  const { nodeId } = req.params;
  const version = req.query.version || GRAPH_VERSIONS.BASE;
  
  try {
    // Query to get the specific node and its direct neighbors
    const graphQuery = `
      MATCH (center) WHERE id(center) = $nodeId
      OPTIONAL MATCH (center)-[r1]->(connected)
      OPTIONAL MATCH (source)-[r2]->(center)
      RETURN center,
             collect(DISTINCT {node: connected, relationship: r1, direction: 'outgoing'}) as outgoing,
             collect(DISTINCT {node: source, relationship: r2, direction: 'incoming'}) as incoming
    `;
    
    const result = await session.run(graphQuery, { nodeId: parseInt(nodeId) });
    
    if (result.records.length === 0) {
      return res.status(404).json({ error: 'Node not found' });
    }
    
    const record = result.records[0];
    const centerNode = record.get('center');
    const outgoing = record.get('outgoing') || [];
    const incoming = record.get('incoming') || [];
    
    const nodes = [];
    const edges = [];
    const nodeMap = new Map();
    
    // Add center node
    const centerNodeData = {
      id: centerNode.identity.toString(),
      label: centerNode.properties.name || centerNode.properties.title || 'Unnamed',
      group: centerNode.labels[0] || 'Unknown',
      properties: centerNode.properties
    };
    nodeMap.set(centerNodeData.id, centerNodeData);
    nodes.push(centerNodeData);
    
    // Add connected nodes and edges
    [...outgoing, ...incoming].forEach(conn => {
      if (conn.node && conn.relationship) {
        const connectedNodeData = {
          id: conn.node.identity.toString(),
          label: conn.node.properties.name || conn.node.properties.title || 'Unnamed',
          group: conn.node.labels[0] || 'Unknown',
          properties: conn.node.properties
        };
        
        if (!nodeMap.has(connectedNodeData.id)) {
          nodeMap.set(connectedNodeData.id, connectedNodeData);
          nodes.push(connectedNodeData);
        }
        
        // Create edge
        const isOutgoing = conn.direction === 'outgoing';
        const edgeData = {
          id: `${isOutgoing ? centerNodeData.id : connectedNodeData.id}-${isOutgoing ? connectedNodeData.id : centerNodeData.id}-${conn.relationship.type}`,
          from: isOutgoing ? centerNodeData.id : connectedNodeData.id,
          to: isOutgoing ? connectedNodeData.id : centerNodeData.id,
          type: conn.relationship.type,
          label: conn.relationship.type,
          properties: conn.relationship.properties
        };
        edges.push(edgeData);
      }
    });
    
    res.json({ nodes, edges, centerNodeId: centerNodeData.id });
    
  } catch (error) {
    console.error('Error fetching node graph:', error);
    res.status(500).json({ error: error.message });
  } finally {
    await session.close();
  }
});

// Get all connections for a specific node
app.get('/api/admin/node/:nodeId/connections', async (req, res) => {
  const session = driver.session();
  const { nodeId } = req.params;
  const version = req.query.version || GRAPH_VERSIONS.BASE;
  
  try {
    // Query to find all connections (both incoming and outgoing) for a specific node
    const connectionQuery = `
      MATCH (n) WHERE id(n) = $nodeId
      OPTIONAL MATCH (n)-[r]->(target)
      OPTIONAL MATCH (source)-[r2]->(n)
      RETURN n, 
             collect(DISTINCT {relationship: r, target: target, direction: 'outgoing'}) as outgoing,
             collect(DISTINCT {relationship: r2, source: source, direction: 'incoming'}) as incoming
    `;
    
    const result = await session.run(connectionQuery, { nodeId: parseInt(nodeId) });
    
    if (result.records.length === 0) {
      return res.status(404).json({ error: 'Node not found' });
    }
    
    const record = result.records[0];
    const node = record.get('n');
    const outgoing = record.get('outgoing') || [];
    const incoming = record.get('incoming') || [];
    
    const connections = [];
    
    // Process outgoing connections
    outgoing.forEach(conn => {
      if (conn.relationship && conn.target) {
        connections.push({
          id: `${nodeId}-out-${conn.target.identity.toString()}`,
          from: nodeId,
          to: conn.target.identity.toString(),
          type: conn.relationship.type,
          label: conn.relationship.type,
          direction: 'outgoing',
          properties: conn.relationship.properties,
          targetNode: {
            id: conn.target.identity.toString(),
            label: conn.target.properties.name || conn.target.properties.title || 'Unnamed',
            group: conn.target.labels[0] || 'Unknown',
            properties: conn.target.properties
          }
        });
      }
    });
    
    // Process incoming connections
    incoming.forEach(conn => {
      if (conn.relationship && conn.source) {
        connections.push({
          id: `${conn.source.identity.toString()}-in-${nodeId}`,
          from: conn.source.identity.toString(),
          to: nodeId,
          type: conn.relationship.type,
          label: conn.relationship.type,
          direction: 'incoming',
          properties: conn.relationship.properties,
          sourceNode: {
            id: conn.source.identity.toString(),
            label: conn.source.properties.name || conn.source.properties.title || 'Unnamed',
            group: conn.source.labels[0] || 'Unknown',
            properties: conn.source.properties
          }
        });
      }
    });
    
    res.json({
      nodeId,
      connections: connections.filter(c => c.type) // Remove empty connections
    });
    
  } catch (error) {
    console.error('Error fetching node connections:', error);
    res.status(500).json({ error: error.message });
  } finally {
    await session.close();
  }
});

// Get graph data for visualization
app.get('/api/admin/graph/:nodeType', async (req, res) => {
  const session = driver.session();
  const { nodeType } = req.params;
  const { sector, department } = req.query;
  const version = req.query.version || GRAPH_VERSIONS.BASE;
  
  // Handle multiple industries (sent as multiple query params)
  const industries = Array.isArray(req.query.industry) ? req.query.industry : 
                    req.query.industry ? [req.query.industry] : [];
  
  try {
    let nodes = [];
    let edges = [];
    
    // Map URL node types to actual Neo4j labels
    const nodeTypeMap = {
      'industries': 'Industry',
      'sectors': 'Sector', 
      'departments': 'Department',
      'painpoints': 'PainPoint',
      'projects': 'ProjectOpportunity',
      'blueprints': 'ProjectBlueprint',
      'roles': 'Role',
      'modules': 'Module',
      'submodules': 'SubModule'
    };
    
    const primaryLabel = nodeTypeMap[nodeType.toLowerCase()];
    if (!primaryLabel) {
      return res.status(400).json({ error: 'Invalid node type' });
    }
    
    const nodeMap = new Map();
    const edgeMap = new Map();
    
    switch (primaryLabel) {
      case 'Industry':
        // Industries: Show only Industry nodes
        const industryQuery = `MATCH (i:Industry) RETURN i`;
        const industryResult = await session.run(industryQuery);
        
        industryResult.records.forEach(record => {
          const node = record.get('i');
          const nodeData = {
            id: node.identity.toString(),
            label: node.properties.name || 'Unnamed',
            group: 'Industry',
            properties: node.properties
          };
          nodeMap.set(nodeData.id, nodeData);
        });
        break;
        
      case 'Sector':
        // Sectors: Show sectors connected to selected industries (or all if none selected)
        let sectorQuery, sectorParams;
        
        if (industries.length === 0) {
          // Return all sectors when no industries are selected
          sectorQuery = `
            MATCH (i:Industry)-[r:HAS_SECTOR]->(s:Sector) 
            RETURN i, r, s
          `;
          sectorParams = {};
        } else {
          // Return sectors for selected industries
          sectorQuery = `
            MATCH (i:Industry)-[r:HAS_SECTOR]->(s:Sector) 
            WHERE i.name IN $industries
            RETURN i, r, s
          `;
          sectorParams = { industries };
        }
        const sectorResult = await session.run(sectorQuery, sectorParams);
        
        sectorResult.records.forEach(record => {
          const industryNode = record.get('i');
          const sectorNode = record.get('s');
          const relationship = record.get('r');
          
          // Add industry node
          const industryId = industryNode.identity.toString();
          if (!nodeMap.has(industryId)) {
            nodeMap.set(industryId, {
              id: industryId,
              label: industryNode.properties.name || 'Unnamed',
              group: 'Industry',
              properties: industryNode.properties
            });
          }
          
          // Add sector node
          const sectorId = sectorNode.identity.toString();
          if (!nodeMap.has(sectorId)) {
            nodeMap.set(sectorId, {
              id: sectorId,
              label: sectorNode.properties.name || 'Unnamed',
              group: 'Sector',
              properties: sectorNode.properties
            });
          }
          
          // Add edge
          const edgeId = `${industryId}-${sectorId}-HAS_SECTOR`;
          if (!edgeMap.has(edgeId)) {
            edgeMap.set(edgeId, {
              id: edgeId,
              from: industryId,
              to: sectorId,
              label: 'HAS_SECTOR',
              type: 'HAS_SECTOR',
              properties: relationship.properties
            });
          }
        });
        break;
        
      case 'Department':
        // Departments: Show only Department nodes
        const deptQuery = `MATCH (d:Department) RETURN d`;
        const deptResult = await session.run(deptQuery);
        
        deptResult.records.forEach(record => {
          const node = record.get('d');
          const nodeData = {
            id: node.identity.toString(),
            label: node.properties.name || 'Unnamed',
            group: 'Department',
            properties: node.properties
          };
          nodeMap.set(nodeData.id, nodeData);
        });
        break;
        
      case 'PainPoint':
        // PainPoints: Filter by industries, sector, department or show all
        let painPointQuery = `MATCH (p:PainPoint)`;
        let whereConditions = [];
        let painPointParams = {};
        
        if (industries.length > 0 || sector || department) {
          if (industries.length > 0) {
            painPointQuery += ` MATCH (i:Industry)`;
            painPointParams.industries = industries;
            if (sector) {
              painPointQuery += `-[:HAS_SECTOR]->(s:Sector {name: $sector})`;
              painPointParams.sector = sector;
              whereConditions.push(`i.name IN $industries AND (s)-[:EXPERIENCES]->(p)`);
            } else {
              whereConditions.push(`i.name IN $industries AND EXISTS((i)-[:HAS_SECTOR]->()-[:EXPERIENCES]->(p))`);
            }
          }
          
          if (department) {
            painPointQuery += ` MATCH (d:Department {name: $department})`;
            painPointParams.department = department;
            whereConditions.push(`(d)-[:EXPERIENCES]->(p)`);
          }
          
          if (whereConditions.length > 0) {
            painPointQuery += ` WHERE ` + whereConditions.join(' OR ');
          }
        }
        
        painPointQuery += ` RETURN DISTINCT p`;
        
        // Also get connected entities for context
        const connectedQuery = `
          MATCH (p:PainPoint)
          OPTIONAL MATCH (s:Sector)-[r1:EXPERIENCES]->(p)
          OPTIONAL MATCH (d:Department)-[r2:EXPERIENCES]->(p)
          OPTIONAL MATCH (i:Industry)-[r3:HAS_SECTOR]->(s)
          RETURN p, s, d, i, r1, r2, r3
        `;
        
        const painPointResult = await session.run(painPointQuery, painPointParams);
        const connectedResult = await session.run(connectedQuery);
        
        // Add pain point nodes
        painPointResult.records.forEach(record => {
          const node = record.get('p');
          const nodeData = {
            id: node.identity.toString(),
            label: node.properties.name || 'Unnamed',
            group: 'PainPoint',
            properties: node.properties
          };
          nodeMap.set(nodeData.id, nodeData);
        });
        
        // Add connected entities and relationships
        connectedResult.records.forEach(record => {
          const painPoint = record.get('p');
          const sector = record.get('s');
          const dept = record.get('d');
          const industryNode = record.get('i');
          
          const painPointId = painPoint.identity.toString();
          
          // Only process if this pain point is in our filtered set
          if (!nodeMap.has(painPointId)) return;
          
          // Add sector and its connections
          if (sector) {
            const sectorId = sector.identity.toString();
            if (!nodeMap.has(sectorId)) {
              nodeMap.set(sectorId, {
                id: sectorId,
                label: sector.properties.name || 'Unnamed',
                group: 'Sector',
                properties: sector.properties
              });
            }
            
            // Add sector -> painpoint edge
            const sectorEdgeId = `${sectorId}-${painPointId}-EXPERIENCES`;
            if (!edgeMap.has(sectorEdgeId)) {
              edgeMap.set(sectorEdgeId, {
                id: sectorEdgeId,
                from: sectorId,
                to: painPointId,
                label: 'EXPERIENCES',
                type: 'EXPERIENCES',
                properties: {}
              });
            }
            
            // Add industry -> sector edge if industry exists
            if (industryNode) {
              const industryId = industryNode.identity.toString();
              if (!nodeMap.has(industryId)) {
                nodeMap.set(industryId, {
                  id: industryId,
                  label: industryNode.properties.name || 'Unnamed',
                  group: 'Industry',
                  properties: industryNode.properties
                });
              }
              
              const industryEdgeId = `${industryId}-${sectorId}-HAS_SECTOR`;
              if (!edgeMap.has(industryEdgeId)) {
                edgeMap.set(industryEdgeId, {
                  id: industryEdgeId,
                  from: industryId,
                  to: sectorId,
                  label: 'HAS_SECTOR',
                  type: 'HAS_SECTOR',
                  properties: {}
                });
              }
            }
          }
          
          // Add department and its connections
          if (dept) {
            const deptId = dept.identity.toString();
            if (!nodeMap.has(deptId)) {
              nodeMap.set(deptId, {
                id: deptId,
                label: dept.properties.name || 'Unnamed',
                group: 'Department',
                properties: dept.properties
              });
            }
            
            // Add department -> painpoint edge
            const deptEdgeId = `${deptId}-${painPointId}-EXPERIENCES`;
            if (!edgeMap.has(deptEdgeId)) {
              edgeMap.set(deptEdgeId, {
                id: deptEdgeId,
                from: deptId,
                to: painPointId,
                label: 'EXPERIENCES',
                type: 'EXPERIENCES',
                properties: {}
              });
            }
          }
        });
        break;
        
      default:
        // For other node types, keep existing behavior
        const defaultQuery = `MATCH (n:${primaryLabel}) RETURN n`;
        const defaultResult = await session.run(defaultQuery);
        
        defaultResult.records.forEach(record => {
          const node = record.get('n');
          const nodeData = {
            id: node.identity.toString(),
            label: node.properties.name || node.properties.title || 'Unnamed',
            group: primaryLabel,
            properties: node.properties
          };
          nodeMap.set(nodeData.id, nodeData);
        });
    }
    
    const finalNodes = Array.from(nodeMap.values());
    const finalEdges = Array.from(edgeMap.values());
    
    res.json({
      nodes: finalNodes,
      edges: finalEdges,
      stats: {
        nodeCount: finalNodes.length,
        edgeCount: finalEdges.length,
        nodeTypes: Array.from(new Set(finalNodes.map(n => n.group)))
      }
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    await session.close();
  }
});

// Execute custom query
app.post('/api/admin/query', async (req, res) => {
  const session = driver.session();
  const { query, version } = req.body;
  
  try {
    // Apply versioning to the query if needed
    const result = await session.run(query);
    
    const results = result.records.map((record, index) => {
      const recordData = {};
      record.keys.forEach(key => {
        const value = record.get(key);
        
        // Handle different Neo4j data types
        if (value && typeof value === 'object') {
          if (value.identity !== undefined) {
            // This is a Node
            recordData[key] = {
              id: value.identity.toString(),
              labels: value.labels,
              properties: value.properties
            };
          } else if (value.start !== undefined && value.end !== undefined) {
            // This is a Relationship
            recordData[key] = {
              id: value.identity.toString(),
              type: value.type,
              start: value.start.toString(),
              end: value.end.toString(),
              properties: value.properties
            };
          } else {
            recordData[key] = value;
          }
        } else {
          recordData[key] = value;
        }
      });
      return recordData;
    });
    
    res.json(results);
  } catch (error) {
    res.status(400).json({ error: error.message });
  } finally {
    await session.close();
  }
});

// Export graph as Cypher script
app.get('/api/admin/export', async (req, res) => {
  const session = driver.session();
  const version = req.query.version || GRAPH_VERSIONS.BASE;
  
  try {
    const cypherScript = await generateCypherExport(session, version);
    
    // Set headers for file download
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="graph-export-${version}-${new Date().toISOString().split('T')[0]}.cypher"`);
    
    res.send(cypherScript);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    await session.close();
  }
});

// Generate human-readable Cypher export
async function generateCypherExport(session, version = GRAPH_VERSIONS.BASE) {
  const lines = [];
  
  // Header
  lines.push('// ==========================================');
  lines.push('// 🏢 AI Catalog Graph Export');
  lines.push('// ==========================================');
  lines.push(`// Generated: ${new Date().toISOString()}`);
  lines.push(`// Version: ${version}`);
  lines.push('// This script recreates the complete graph structure');
  lines.push('');
  
  // Schema documentation
  lines.push('// ==========================================');
  lines.push('// 📋 Schema Definition');
  lines.push('// ==========================================');
  lines.push('// Valid Node Types:');
  lines.push('//   🏢 Industry (properties: name)');
  lines.push('//   🏛️ Sector (properties: name)'); 
  lines.push('//   🏢 Department (properties: name)');
  lines.push('//   ⚠️ PainPoint (properties: name, impact)');
  lines.push('//   📋 ProjectBlueprint (properties: title)');
  lines.push('//   🚀 ProjectOpportunity (properties: title, priority, business_case, budget_range, duration)');
  lines.push('//   👤 Role (properties: name)');
  lines.push('//   🔧 SubModule (properties: name)');
  lines.push('//   📦 Module (properties: name)');
  lines.push('//');
  lines.push('// Valid Relationship Types:');
  lines.push('//   HAS_SECTOR: Industry -> Sector');
  lines.push('//   EXPERIENCES: Sector/Department -> PainPoint');
  lines.push('//   HAS_OPPORTUNITY: Sector/Department -> ProjectOpportunity');
  lines.push('//   ADDRESSES: ProjectOpportunity -> PainPoint');
  lines.push('//   IS_INSTANCE_OF: ProjectOpportunity -> ProjectBlueprint');
  lines.push('//   REQUIRES_ROLE: ProjectOpportunity -> Role');
  lines.push('//   NEEDS_SUBMODULE: ProjectOpportunity -> SubModule');
  lines.push('//   USES_MODULE: ProjectOpportunity -> Module');
  lines.push('//   CONTAINS: Module -> SubModule');
  lines.push('');
  
  // Clear existing data warning
  lines.push('// ==========================================');
  lines.push('// ⚠️  IMPORT INSTRUCTIONS');
  lines.push('// ==========================================');
  lines.push('// WARNING: This script will clear all existing data!');
  lines.push('// Uncomment the next line to clear the database before import');
  lines.push('// MATCH (n) DETACH DELETE n;');
  lines.push('');
  
  // Node creation sections
  const nodeTypes = [
    { type: 'Industry', label: 'Industries', icon: '🏢' },
    { type: 'Sector', label: 'Sectors', icon: '🏛️' },
    { type: 'Department', label: 'Departments', icon: '🏢' },
    { type: 'PainPoint', label: 'Pain Points', icon: '⚠️' },
    { type: 'ProjectBlueprint', label: 'Project Blueprints', icon: '📋' },
    { type: 'ProjectOpportunity', label: 'Project Opportunities', icon: '🚀' },
    { type: 'Role', label: 'Roles', icon: '👤' },
    { type: 'SubModule', label: 'Sub-modules', icon: '🔧' },
    { type: 'Module', label: 'Modules', icon: '📦' }
  ];
  
  for (const nodeType of nodeTypes) {
    lines.push(`// ==========================================`);
    lines.push(`// ${nodeType.icon} ${nodeType.label}`);
    lines.push(`// ==========================================`);
    lines.push('');
    
    // Get all nodes of this type
    const query = `MATCH (n:${nodeType.type}) RETURN n ORDER BY n.name, n.title`;
    const result = await session.run(query);
    
    if (result.records.length === 0) {
      lines.push(`// No ${nodeType.label.toLowerCase()} found`);
      lines.push('');
      continue;
    }
    
    result.records.forEach((record, index) => {
      const node = record.get('n');
      const props = node.properties;
      
      // Format properties for Cypher
      const propStrings = Object.entries(props).map(([key, value]) => {
        if (typeof value === 'string') {
          // Escape single quotes and wrap in single quotes
          const escapedValue = value.replace(/'/g, "\\'");
          return `${key}: '${escapedValue}'`;
        } else {
          return `${key}: ${JSON.stringify(value)}`;
        }
      });
      
      const propString = propStrings.length > 0 ? `{${propStrings.join(', ')}}` : '';
      lines.push(`MERGE (${nodeType.type.toLowerCase()}_${index + 1}:${nodeType.type} ${propString})`);
    });
    
    lines.push('');
  }
  
  // Relationship creation section
  lines.push('// ==========================================');
  lines.push('// 🔗 Relationships');
  lines.push('// ==========================================');
  lines.push('');
  
  // Get all relationships
  const relationshipTypes = [
    'HAS_SECTOR',
    'EXPERIENCES', 
    'HAS_OPPORTUNITY',
    'ADDRESSES',
    'IS_INSTANCE_OF',
    'REQUIRES_ROLE',
    'NEEDS_SUBMODULE',
    'USES_MODULE',
    'CONTAINS'
  ];
  
  for (const relType of relationshipTypes) {
    lines.push(`// ${relType} relationships`);
    
    let relQuery = `MATCH (a)-[r:${relType}]->(b) RETURN a, r, b, type(r) as relType ORDER BY a.name, b.name`;
    if (version !== GRAPH_VERSIONS.BASE) {
      relQuery = `MATCH (a)-[r:${relType}]->(b) WHERE any(label in labels(a) WHERE label ENDS WITH "_${version}") AND any(label in labels(b) WHERE label ENDS WITH "_${version}") RETURN a, r, b, type(r) as relType ORDER BY a.name, b.name`;
    }
    
    const relResult = await session.run(relQuery);
    
    if (relResult.records.length === 0) {
      lines.push(`// No ${relType} relationships found`);
      lines.push('');
      continue;
    }
    
    relResult.records.forEach(relRecord => {
      const sourceNode = relRecord.get('a');
      const targetNode = relRecord.get('b');
      const relationship = relRecord.get('r');
      const relTypeActual = relRecord.get('relType');
      
      // Create match patterns for source and target nodes
      const sourceLabel = sourceNode.labels[0].replace(/_admin_draft$/, '');
      const targetLabel = targetNode.labels[0].replace(/_admin_draft$/, '');
      
      const sourceIdentifier = sourceNode.properties.name || sourceNode.properties.title;
      const targetIdentifier = targetNode.properties.name || targetNode.properties.title;
      
      if (!sourceIdentifier || !targetIdentifier) {
        return; // Skip if we can't identify the nodes
      }
      
      // Format the relationship creation
      let relProps = '';
      if (relationship.properties && Object.keys(relationship.properties).length > 0) {
        const relPropStrings = Object.entries(relationship.properties).map(([key, value]) => {
          if (typeof value === 'string') {
            const escapedValue = value.replace(/'/g, "\\'");
            return `${key}: '${escapedValue}'`;
          } else {
            return `${key}: ${JSON.stringify(value)}`;
          }
        });
        relProps = ` {${relPropStrings.join(', ')}}`;
      }
      
      const sourceMatch = `MATCH (src:${sourceLabel} {${sourceIdentifier.includes(' ') ? 'name' : (sourceLabel === 'ProjectBlueprint' || sourceLabel === 'ProjectOpportunity' ? 'title' : 'name')}: '${sourceIdentifier.replace(/'/g, "\\'")}'})`; 
      const targetMatch = `MATCH (tgt:${targetLabel} {${targetIdentifier.includes(' ') ? 'name' : (targetLabel === 'ProjectBlueprint' || targetLabel === 'ProjectOpportunity' ? 'title' : 'name')}: '${targetIdentifier.replace(/'/g, "\\'")}'})`; 
      
      lines.push(`${sourceMatch}`);
      lines.push(`${targetMatch}`);
      lines.push(`CREATE (src)-[:${relTypeActual}${relProps}]->(tgt)`);
      lines.push('');
    });
    
    lines.push('');
  }
  
  // Footer
  lines.push('// ==========================================');
  lines.push('// ✅ Export Complete');
  lines.push('// ==========================================');
  lines.push('');
  lines.push('// To verify the import was successful, run:');
  lines.push('// MATCH (n) RETURN labels(n), count(n) ORDER BY labels(n)');
  
  return lines.join('\n');
}

// Import graph from Cypher script
app.post('/api/admin/import', express.text({ limit: '10mb' }), async (req, res) => {
  const cypherScript = req.body;
  const { versionName } = req.query;
  
  if (!cypherScript || typeof cypherScript !== 'string') {
    return res.status(400).json({ error: 'Cypher script is required in request body' });
  }
  
  if (!versionName || versionName === GRAPH_VERSIONS.BASE || versionName === GRAPH_VERSIONS.ADMIN_DRAFT) {
    return res.status(400).json({ error: 'A unique version name is required for import' });
  }
  
  // Validate the Cypher script
  const validation = validateCypherScript(cypherScript);
  if (!validation.valid) {
    return res.status(400).json({ 
      error: 'Schema validation failed',
      validationErrors: validation.errors,
      stats: validation.stats
    });
  }
  
  const dbName = getDatabaseName(versionName);
  
  try {
    // Check if database already exists
    const databases = await listDatabases();
    if (databases.find(db => db.name === dbName)) {
      return res.status(400).json({ error: `Version "${versionName}" already exists. Please choose a different name.` });
    }
    
    // Create new database for this version
    await createDatabase(dbName);
    console.log(`Created database ${dbName} for version ${versionName}`);
    
    // Get session for the new database
    const session = getVersionSession(versionName);
    
    // Execute the script directly without any label modifications
    // Split script into individual statements
    const cleanedScript = cypherScript
      .split('\n')
      .filter(line => {
        const trimmed = line.trim();
        return trimmed && !trimmed.startsWith('//');
      })
      .join('\n');
    
    const statements = cleanedScript
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt); // Remove empty statements

    console.log(`Executing ${statements.length} statements in database ${dbName}`);
    
    let executedStatements = 0;
    let totalNodesCreated = 0;
    let totalRelationshipsCreated = 0;
    
    for (const statement of statements) {
      if (statement) {
        try {
          const result = await session.run(statement);
          executedStatements++;
          
          // Collect statistics from transaction summary
          const counters = result.summary.counters;
          if (counters && counters._stats) {
            const nodesCreated = counters._stats.nodesCreated || 0;
            const relationshipsCreated = counters._stats.relationshipsCreated || 0;
            totalNodesCreated += nodesCreated;
            totalRelationshipsCreated += relationshipsCreated;
            console.log(`Statement ${executedStatements}: ${statement.substring(0, 100)}... (${counters.updates() || 0} operations: +${nodesCreated} nodes, +${relationshipsCreated} rels)`);
          } else {
            console.log(`Statement ${executedStatements}: ${statement.substring(0, 100)}... (no counter info)`);
          }
        } catch (statementError) {
          // Clean up - drop the database on error
          await session.close();
          try {
            await dropDatabase(dbName);
            console.log(`Dropped database ${dbName} after import failure`);
          } catch (cleanupError) {
            console.error('Failed to clean up database after import failure:', cleanupError);
          }
          
          throw new Error(`Statement ${executedStatements + 1} failed: ${statementError.message}\nFailed statement: ${statement.substring(0, 200)}${statement.length > 200 ? '...' : ''}`);
        }
      }
    }
    
    await session.close();
    
    console.log(`Import completed: ${totalNodesCreated} nodes, ${totalRelationshipsCreated} relationships created`);
    
    res.json({
      success: true,
      message: `Graph imported successfully as version "${versionName}" in database "${dbName}"`,
      versionName,
      database: dbName,
      validationResult: validation,
      stats: {
        nodesCreated: totalNodesCreated,
        relationshipsCreated: totalRelationshipsCreated
      }
    });
    
  } catch (error) {
    // Clean up - drop the database on error
    try {
      await dropDatabase(dbName);
      console.log(`Dropped database ${dbName} after import failure`);
    } catch (cleanupError) {
      console.error('Failed to clean up database after import failure:', cleanupError);
    }
    
    res.status(500).json({ 
      error: 'Failed to import graph', 
      details: error.message,
      versionName,
      database: dbName,
      hasValidationErrors: !!validation && !validation.valid,
      validationErrors: validation?.errors || []
    });
  }
});

// Promote imported version to base
app.post('/api/admin/promote/:versionName', async (req, res) => {
  const { versionName } = req.params;
  const session = driver.session();
  
  try {
    // Check if version exists
    const versionCheckQuery = `MATCH (n) WHERE any(label in labels(n) WHERE label ENDS WITH "_${versionName}") RETURN count(n) as count`;
    const versionResult = await session.run(versionCheckQuery);
    const versionCount = versionResult.records[0].get('count').toNumber();
    
    if (versionCount === 0) {
      return res.status(404).json({ error: `Version "${versionName}" not found` });
    }
    
    // Create timestamp for backup
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' + 
                     new Date().toTimeString().split(' ')[0].replace(/:/g, '-');
    const backupVersionName = `base_backup_${timestamp}`;
    
    // Step 1: Backup current base to timestamped version
    const nodeTypes = GRAPH_SCHEMA.nodeTypes;
    
    for (const nodeType of nodeTypes) {
      const backupQuery = `
        MATCH (n:${nodeType})
        CREATE (copy:${nodeType}_${backupVersionName})
        SET copy = properties(n)
      `;
      await session.run(backupQuery);
    }
    
    // Backup relationships
    const relTypes = GRAPH_SCHEMA.relationshipTypes;
    for (const relType of relTypes) {
      const backupRelQuery = `
        MATCH (a)-[r:${relType}]->(b)
        MATCH (a_backup) WHERE any(label in labels(a_backup) WHERE label ENDS WITH "_${backupVersionName}")
          AND a_backup.name = a.name OR a_backup.title = a.title
        MATCH (b_backup) WHERE any(label in labels(b_backup) WHERE label ENDS WITH "_${backupVersionName}")
          AND b_backup.name = b.name OR b_backup.title = b.title
        CREATE (a_backup)-[r_backup:${relType}]->(b_backup)
        SET r_backup = properties(r)
      `;
      await session.run(backupRelQuery);
    }
    
    // Step 2: Delete current base
    await session.run('MATCH (n) WHERE none(label in labels(n) WHERE label CONTAINS "_") DETACH DELETE n');
    
    // Step 3: Promote imported version to base
    for (const nodeType of nodeTypes) {
      const promoteQuery = `
        MATCH (n:${nodeType}_${versionName})
        CREATE (base:${nodeType})
        SET base = properties(n)
        DELETE n
      `;
      await session.run(promoteQuery);
    }
    
    // Promote relationships
    for (const relType of relTypes) {
      const promoteRelQuery = `
        MATCH (a)-[r:${relType}]->(b) 
        WHERE any(label in labels(a) WHERE label ENDS WITH "_${versionName}")
          AND any(label in labels(b) WHERE label ENDS WITH "_${versionName}")
        MATCH (a_base) WHERE any(label in labels(a_base) WHERE not label CONTAINS "_")
          AND (a_base.name = a.name OR a_base.title = a.title)
        MATCH (b_base) WHERE any(label in labels(b_base) WHERE not label CONTAINS "_")
          AND (b_base.name = b.name OR b_base.title = b.title)
        CREATE (a_base)-[r_base:${relType}]->(b_base)
        SET r_base = properties(r)
        DELETE r
      `;
      await session.run(promoteRelQuery);
    }
    
    res.json({
      success: true,
      message: `Version "${versionName}" promoted to base successfully`,
      backupVersionName,
      promotedVersion: versionName
    });
    
  } catch (error) {
    console.error('Promotion error:', error);
    res.status(500).json({ 
      error: 'Failed to promote version', 
      details: error.message 
    });
  } finally {
    await session.close();
  }
});

process.on('exit', () => {
  driver.close();
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});