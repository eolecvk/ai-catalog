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