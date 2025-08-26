const express = require('express');
const cors = require('cors');
const neo4j = require('neo4j-driver');
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
  const session = driver.session();
  try {
    const result = await session.run('MATCH (i:Industry) RETURN i.name as name ORDER BY i.name');
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
  const session = driver.session();
  const { industries } = req.body;
  
  try {
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
  const session = driver.session();
  
  try {
    const query = `
      MATCH (d:Department)
      RETURN DISTINCT d.name as name ORDER BY d.name
    `;
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
  const session = driver.session();
  const { sectors } = req.body;
  
  try {
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
  const session = driver.session();
  const { departments } = req.body;
  
  try {
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

process.on('exit', () => {
  driver.close();
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});