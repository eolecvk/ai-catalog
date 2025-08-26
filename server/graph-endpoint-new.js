app.get('/api/admin/graph/:nodeType', async (req, res) => {
  const session = driver.session();
  const { nodeType } = req.params;
  const { industry, sector, department } = req.query;
  const version = req.query.version || GRAPH_VERSIONS.BASE;
  
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
        // Sectors: Show sectors connected to selected industry (or all if no industry selected)
        let sectorQuery;
        if (industry) {
          sectorQuery = getVersionedQuery(`
            MATCH (i:Industry {name: $industry})-[r:HAS_SECTOR]->(s:Sector) 
            RETURN i, r, s
          `, version);
        } else {
          sectorQuery = getVersionedQuery(`
            MATCH (i:Industry)-[r:HAS_SECTOR]->(s:Sector) 
            RETURN i, r, s
          `, version);
        }
        
        const sectorParams = industry ? { industry } : {};
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
        // PainPoints: Filter by industry, sector, department or show all
        let painPointQuery = `MATCH (p:PainPoint)`;
        let whereConditions = [];
        let painPointParams = {};
        
        if (industry || sector || department) {
          if (industry) {
            painPointQuery += ` MATCH (i:Industry {name: $industry})`;
            painPointParams.industry = industry;
            if (sector) {
              painPointQuery += `-[:HAS_SECTOR]->(s:Sector {name: $sector})`;
              painPointParams.sector = sector;
              whereConditions.push(`(s)-[:EXPERIENCES]->(p)`);
            } else {
              whereConditions.push(`EXISTS((i)-[:HAS_SECTOR]->()-[:EXPERIENCES]->(p))`);
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