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

// Graph versioning system
const GRAPH_VERSIONS = {
  BASE: 'base',
  ADMIN_DRAFT: 'admin_draft'
};

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

// Helper function to get versioned label
function getVersionedLabel(baseLabel, version = GRAPH_VERSIONS.BASE) {
  if (version === GRAPH_VERSIONS.BASE) return baseLabel;
  return `${baseLabel}_${version}`;
}

// Schema validation functions
function validateCypherScript(cypherScript) {
  const errors = [];
  const lines = cypherScript.split('\n');
  
  // Extract CREATE statements for nodes and relationships
  const nodeCreates = [];
  const relCreates = [];
  
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('CREATE') || trimmed.startsWith('MERGE')) {
      if (trimmed.includes('-[') && trimmed.includes(']-')) {
        // This is a relationship creation
        relCreates.push({ line: trimmed, lineNumber: index + 1 });
      } else if (trimmed.includes('(') && trimmed.includes(':')) {
        // This is a node creation
        nodeCreates.push({ line: trimmed, lineNumber: index + 1 });
      }
    }
  });
  
  // Validate node types
  nodeCreates.forEach(({ line, lineNumber }) => {
    const nodeTypeMatch = line.match(/:([A-Za-z]+)/);
    if (nodeTypeMatch) {
      const nodeType = nodeTypeMatch[1];
      if (!GRAPH_SCHEMA.nodeTypes.includes(nodeType)) {
        errors.push(`Line ${lineNumber}: Unknown node type "${nodeType}". Allowed types: ${GRAPH_SCHEMA.nodeTypes.join(', ')}`);
      }
      
      // Validate required properties
      const requiredProps = GRAPH_SCHEMA.nodeProperties[nodeType] || [];
      const primaryProp = nodeType === 'ProjectOpportunity' || nodeType === 'ProjectBlueprint' ? 'title' : 'name';
      
      if (requiredProps.includes(primaryProp) && !line.includes(`${primaryProp}:`)) {
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

// Helper function to get version-specific queries
function getVersionedQuery(query, version = GRAPH_VERSIONS.BASE) {
  if (version === GRAPH_VERSIONS.BASE) return query;
  
  // Replace node labels with versioned ones
  const labelMap = {
    'Industry': getVersionedLabel('Industry', version),
    'Sector': getVersionedLabel('Sector', version),
    'Department': getVersionedLabel('Department', version),
    'PainPoint': getVersionedLabel('PainPoint', version),
    'ProjectOpportunity': getVersionedLabel('ProjectOpportunity', version),
    'ProjectBlueprint': getVersionedLabel('ProjectBlueprint', version),
    'Role': getVersionedLabel('Role', version),
    'SubModule': getVersionedLabel('SubModule', version)
  };
  
  let versionedQuery = query;
  Object.entries(labelMap).forEach(([original, versioned]) => {
    const regex = new RegExp(`\\b${original}\\b`, 'g');
    versionedQuery = versionedQuery.replace(regex, versioned);
  });
  
  return versionedQuery;
}

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

// =====================
// GRAPH VERSION MANAGEMENT
// =====================

// Get available graph versions
app.get('/api/admin/versions', async (req, res) => {
  const session = driver.session();
  
  try {
    // Check which versions exist by looking for versioned nodes
    const versions = [GRAPH_VERSIONS.BASE];
    
    // Check if admin_draft version exists
    const draftQuery = 'MATCH (n) WHERE any(label in labels(n) WHERE label ENDS WITH "_admin_draft") RETURN count(n) as count';
    const draftResult = await session.run(draftQuery);
    const draftCount = draftResult.records[0].get('count').toNumber();
    
    if (draftCount > 0) {
      versions.push(GRAPH_VERSIONS.ADMIN_DRAFT);
    }
    
    res.json(versions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    await session.close();
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
  const session = driver.session();
  const { type } = req.params;
  const version = req.query.version || GRAPH_VERSIONS.BASE;
  
  try {
    let baseQuery = '';
    
    switch (type.toLowerCase()) {
      case 'industry':
      case 'industries':
        baseQuery = 'MATCH (n:Industry) RETURN n ORDER BY n.name';
        break;
      case 'sector':
      case 'sectors':
        baseQuery = 'MATCH (n:Sector) RETURN n, [(n)<-[:HAS_SECTOR]-(i:Industry) | i.name] as industries ORDER BY n.name';
        break;
      case 'department':
      case 'departments':
        baseQuery = 'MATCH (n:Department) RETURN n ORDER BY n.name';
        break;
      case 'painpoint':
      case 'painpoints':
        baseQuery = 'MATCH (n:PainPoint) RETURN n ORDER BY n.name';
        break;
      case 'project':
      case 'projects':
        baseQuery = 'MATCH (n:ProjectOpportunity) RETURN n ORDER BY n.title';
        break;
      case 'blueprint':
      case 'blueprints':
        baseQuery = 'MATCH (n:ProjectBlueprint) RETURN n ORDER BY n.title';
        break;
      case 'role':
      case 'roles':
        baseQuery = 'MATCH (n:Role) RETURN n ORDER BY n.name';
        break;
      default:
        return res.status(400).json({ error: 'Invalid node type' });
    }
    
    const query = getVersionedQuery(baseQuery, version);
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
  const session = driver.session();
  const version = req.query.version || GRAPH_VERSIONS.BASE;
  
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
      const versionedQuery = getVersionedQuery(query, version);
      const result = await session.run(versionedQuery);
      stats[type] = result.records[0].get('count').toNumber();
    }
    
    // Count relationships for this version
    let relationshipQuery = 'MATCH ()-[r]->() RETURN count(r) as count';
    if (version !== GRAPH_VERSIONS.BASE) {
      relationshipQuery = `MATCH (n)-[r]->(m) WHERE any(label in labels(n) WHERE label ENDS WITH "_${version}") AND any(label in labels(m) WHERE label ENDS WITH "_${version}") RETURN count(r) as count`;
    }
    const relResult = await session.run(relationshipQuery);
    stats.TotalRelationships = relResult.records[0].get('count').toNumber();
    
    // Find orphaned nodes for this version
    let orphanQuery = 'MATCH (n) WHERE NOT (n)--() RETURN count(n) as count';
    if (version !== GRAPH_VERSIONS.BASE) {
      orphanQuery = `MATCH (n) WHERE any(label in labels(n) WHERE label ENDS WITH "_${version}") AND NOT (n)--() RETURN count(n) as count`;
    }
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
    
    const query = getVersionedQuery(baseQuery, version);
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
    
    const query = getVersionedQuery(baseQuery, version);
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
    const graphQuery = getVersionedQuery(`
      MATCH (center) WHERE id(center) = $nodeId
      OPTIONAL MATCH (center)-[r1]->(connected)
      OPTIONAL MATCH (source)-[r2]->(center)
      RETURN center,
             collect(DISTINCT {node: connected, relationship: r1, direction: 'outgoing'}) as outgoing,
             collect(DISTINCT {node: source, relationship: r2, direction: 'incoming'}) as incoming
    `, version);
    
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
    const connectionQuery = getVersionedQuery(`
      MATCH (n) WHERE id(n) = $nodeId
      OPTIONAL MATCH (n)-[r]->(target)
      OPTIONAL MATCH (source)-[r2]->(n)
      RETURN n, 
             collect(DISTINCT {relationship: r, target: target, direction: 'outgoing'}) as outgoing,
             collect(DISTINCT {relationship: r2, source: source, direction: 'incoming'}) as incoming
    `, version);
    
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
        const industryQuery = getVersionedQuery(`MATCH (i:Industry) RETURN i`, version);
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
        // Sectors: Show sectors connected to selected industries (require industry selection)
        if (industries.length === 0) {
          // Return empty result if no industries are selected
          break;
        }
        
        const sectorQuery = getVersionedQuery(`
          MATCH (i:Industry)-[r:HAS_SECTOR]->(s:Sector) 
          WHERE i.name IN $industries
          RETURN i, r, s
        `, version);
        
        const sectorParams = { industries };
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
        const deptQuery = getVersionedQuery(`MATCH (d:Department) RETURN d`, version);
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
        
        const painPointResult = await session.run(getVersionedQuery(painPointQuery, version), painPointParams);
        const connectedResult = await session.run(getVersionedQuery(connectedQuery, version));
        
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
        const defaultQuery = getVersionedQuery(`MATCH (n:${primaryLabel}) RETURN n`, version);
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
    const versionedQuery = getVersionedQuery(query, version);
    
    const result = await session.run(versionedQuery);
    
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
    const query = getVersionedQuery(`MATCH (n:${nodeType.type}) RETURN n ORDER BY n.name, n.title`, version);
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
  
  const session = driver.session();
  
  try {
    // Check if version already exists
    const versionCheckQuery = `MATCH (n) WHERE any(label in labels(n) WHERE label ENDS WITH "_${versionName}") RETURN count(n) as count`;
    const versionResult = await session.run(versionCheckQuery);
    const existingCount = versionResult.records[0].get('count').toNumber();
    
    if (existingCount > 0) {
      return res.status(400).json({ error: `Version "${versionName}" already exists. Please choose a different name.` });
    }
    
    // Add version suffix to all CREATE/MERGE statements
    const versionedScript = cypherScript
      .split('\n')
      .map(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('CREATE') || trimmed.startsWith('MERGE')) {
          // Add version suffix to node labels
          return line.replace(/:([A-Za-z]+)/g, `:$1_${versionName}`);
        }
        return line;
      })
      .join('\n');
    
    // Execute the versioned script
    await session.run(versionedScript);
    
    // Get import statistics
    const statsQuery = `
      MATCH (n) WHERE any(label in labels(n) WHERE label ENDS WITH "_${versionName}")
      OPTIONAL MATCH (n)-[r]->(m) WHERE any(label in labels(m) WHERE label ENDS WITH "_${versionName}")
      RETURN 
        count(DISTINCT n) as nodeCount,
        count(DISTINCT r) as relCount
    `;
    const statsResult = await session.run(statsQuery);
    const stats = statsResult.records[0];
    
    res.json({
      success: true,
      message: `Graph imported successfully as version "${versionName}"`,
      versionName,
      validationResult: validation,
      stats: {
        nodesCreated: stats.get('nodeCount').toNumber(),
        relationshipsCreated: stats.get('relCount').toNumber()
      }
    });
    
  } catch (error) {
    // Clean up any partial import
    try {
      await session.run(`MATCH (n) WHERE any(label in labels(n) WHERE label ENDS WITH "_${versionName}") DETACH DELETE n`);
    } catch (cleanupError) {
      console.error('Failed to clean up partial import:', cleanupError);
    }
    
    console.error('Import error:', error);
    res.status(500).json({ 
      error: 'Failed to import graph', 
      details: error.message,
      versionName 
    });
  } finally {
    await session.close();
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