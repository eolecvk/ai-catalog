import React, { useState, useEffect, useRef, useCallback } from 'react';

interface GraphNode {
  id: string;
  label: string;
  group: string;
  properties: any;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number; // fixed x position
  fy?: number; // fixed y position
}

interface GraphEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  type?: string;
}

interface GraphVizProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  nodeType: string;
  onNodeSelect?: (nodeId: string, nodeData: any) => void;
  onNodeDoubleClick?: (nodeId: string, nodeData: any) => void;
  onNavigateToNode?: (nodeId: string) => void;
  height?: string;
}

const GraphViz: React.FC<GraphVizProps> = ({ 
  nodes, 
  edges, 
  nodeType,
  onNodeSelect, 
  onNodeDoubleClick,
  onNavigateToNode,
  height = '700px' 
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedNodeData, setSelectedNodeData] = useState<GraphNode | null>(null);
  const [showNodePanel, setShowNodePanel] = useState<boolean>(false);
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  const [simulationNodes, setSimulationNodes] = useState<GraphNode[]>([]);
  const [componentCount, setComponentCount] = useState<number>(1);
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [nodeConnections, setNodeConnections] = useState<any[]>([]);
  const [loadingConnections, setLoadingConnections] = useState<boolean>(false);
  const [editingNodeName, setEditingNodeName] = useState<boolean>(false);
  const [editedNodeName, setEditedNodeName] = useState<string>('');
  const animationRef = useRef<number>();

  // Calculate adaptive canvas size based on number of nodes and components
  const baseWidth = 1200;
  const baseHeight = parseInt(height) || 700;
  
  // Auto-zoom calculation: zoom out when there are many nodes
  const nodeCount = nodes.length;
  
  // Estimate component count based on node count and edge density for initial sizing
  // This is a rough estimate - the exact count will be calculated later in the simulation
  const estimatedComponentCount = Math.max(1, Math.min(nodeCount / 5, edges.length === 0 ? nodeCount : Math.ceil(nodeCount / 10)));
  
  // Scale factor based on complexity (more nodes = zoom out more)
  const nodeScaleFactor = Math.max(1, Math.sqrt(nodeCount / 20)); // Starts scaling after 20 nodes
  const componentScaleFactor = Math.max(1, estimatedComponentCount / 3); // Starts scaling after 3 components
  const combinedScaleFactor = Math.max(nodeScaleFactor, componentScaleFactor);
  
  // Apply scaling to canvas dimensions
  const width = Math.min(3000, baseWidth * combinedScaleFactor); // Cap at 3000px
  const heightNum = Math.min(2000, baseHeight * Math.max(1, combinedScaleFactor * 0.8)); // Cap at 2000px

  // Color scheme for different node types
  const getNodeColor = (group: string): string => {
    const colors: { [key: string]: string } = {
      'Industry': '#3498db',
      'Sector': '#e74c3c',
      'Department': '#f39c12',
      'PainPoint': '#e67e22',
      'ProjectBlueprint': '#9b59b6',
      'ProjectOpportunity': '#2ecc71',
      'Role': '#34495e',
      'SubModule': '#16a085',
      'Module': '#27ae60'
    };
    return colors[group] || '#95a5a6';
  };

  // Get icon for node type
  const getNodeIcon = (group: string): string => {
    const icons: { [key: string]: string } = {
      'Industry': '🏢',
      'Sector': '🏛️',
      'Department': '🏢',
      'PainPoint': '⚠️',
      'ProjectBlueprint': '📋',
      'ProjectOpportunity': '🚀',
      'Role': '👤',
      'SubModule': '🔧',
      'Module': '📦'
    };
    return icons[group] || '⭕';
  };

  // Get node radius based on type
  const getNodeRadius = (group: string): number => {
    const radii: { [key: string]: number } = {
      'Industry': 25,
      'Sector': 20,
      'Department': 18,
      'PainPoint': 16,
      'ProjectBlueprint': 18,
      'ProjectOpportunity': 20,
      'Role': 14,
      'SubModule': 12,
      'Module': 22
    };
    return radii[group] || 16;
  };

  // Detect connected components (subgraphs)
  const findConnectedComponents = useCallback((nodes: GraphNode[], edges: GraphEdge[]) => {
    const visited = new Set<string>();
    const components: GraphNode[][] = [];
    
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const adjacencyList = new Map<string, string[]>();
    
    // Build adjacency list
    nodes.forEach(node => adjacencyList.set(node.id, []));
    edges.forEach(edge => {
      adjacencyList.get(edge.from)?.push(edge.to);
      adjacencyList.get(edge.to)?.push(edge.from);
    });
    
    const dfs = (nodeId: string, component: GraphNode[]) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      const node = nodeMap.get(nodeId);
      if (node) component.push(node);
      
      adjacencyList.get(nodeId)?.forEach(neighborId => {
        if (!visited.has(neighborId)) {
          dfs(neighborId, component);
        }
      });
    };
    
    nodes.forEach(node => {
      if (!visited.has(node.id)) {
        const component: GraphNode[] = [];
        dfs(node.id, component);
        if (component.length > 0) {
          components.push(component);
        }
      }
    });
    
    return components;
  }, []);

  // Advanced force simulation with subgraph separation and hierarchy
  const runSimulation = useCallback(() => {
    if (simulationNodes.length === 0) return;

    const alpha = 0.01;
    const repelForce = 2000; // Increased repulsion
    const linkForce = 0.03;
    const linkDistance = 150; // Increased link distance
    const hierarchyForce = 0.008; // Force for vertical hierarchy

    const newNodes = simulationNodes.map(node => ({ ...node }));
    const components = findConnectedComponents(newNodes, edges);

    // Update component count state
    const numComponents = components.length;
    if (numComponents !== componentCount) {
      setComponentCount(numComponents);
    }

    // Calculate adaptive layout parameters based on number of components and nodes
    const totalNodes = newNodes.length;
    
    // Adaptive subgraph separation based on number of components and canvas size
    const baseSubgraphSeparation = Math.max(300, Math.min(500, width / (numComponents + 1)));
    const adaptiveSubgraphSeparation = numComponents > 4 ? baseSubgraphSeparation * 0.8 : baseSubgraphSeparation;
    
    // Calculate grid layout for better space utilization
    const componentsPerRow = Math.ceil(Math.sqrt(numComponents));
    const maxComponentsPerRow = Math.max(2, Math.min(componentsPerRow, Math.floor(width / adaptiveSubgraphSeparation)));
    
    // Position subgraphs in a grid pattern for better space utilization
    components.forEach((component, componentIndex) => {
      const row = Math.floor(componentIndex / maxComponentsPerRow);
      const col = componentIndex % maxComponentsPerRow;
      const totalRows = Math.ceil(numComponents / maxComponentsPerRow);
      
      // Calculate center position for this component
      const componentCenterX = (col + 0.5) * (width / maxComponentsPerRow);
      const componentCenterY = (row + 0.5) * (heightNum / totalRows);
      
      // Ensure components don't overlap by adding minimum separation
      const finalCenterX = Math.max(adaptiveSubgraphSeparation / 2, 
        Math.min(width - adaptiveSubgraphSeparation / 2, componentCenterX));
      const finalCenterY = Math.max(200, Math.min(heightNum - 200, componentCenterY));

      // Apply center force for each subgraph
      component.forEach(node => {
        if (!node.fx && !node.fy) {
          const dx = finalCenterX - (node.x || 0);
          const dy = finalCenterY - (node.y || 0);
          node.vx = (node.vx || 0) + dx * 0.003;
          node.vy = (node.vy || 0) + dy * 0.003;
        }
      });

      // Apply hierarchy force within each subgraph
      // Industries at top -> Sectors in middle -> Pain Points at bottom -> Other nodes
      component.forEach(node => {
        if (!node.fx && !node.fy) {
          let targetY = finalCenterY;
          
          // Top tier: Industry nodes (highest)
          if (node.group === 'Industry') {
            targetY = finalCenterY - 120;
          }
          // Middle tier: Sector and Department nodes
          else if (node.group === 'Sector' || node.group === 'Department') {
            targetY = finalCenterY - 30;
          }
          // Lower tier: Pain Points
          else if (node.group === 'PainPoint') {
            targetY = finalCenterY + 80;
          }
          // Bottom tier: Projects and related nodes
          else if (node.group === 'ProjectOpportunity' || node.group === 'ProjectBlueprint') {
            targetY = finalCenterY + 150;
          }
          // Mid-level: Roles, Modules, and other support nodes
          else {
            targetY = finalCenterY + 20;
          }
          
          const dy = targetY - (node.y || 0);
          node.vy = (node.vy || 0) + dy * hierarchyForce;
        }
      });
    });

    // Enhanced repel force between nodes
    for (let i = 0; i < newNodes.length; i++) {
      for (let j = i + 1; j < newNodes.length; j++) {
        const nodeA = newNodes[i];
        const nodeB = newNodes[j];
        
        const dx = (nodeB.x || 0) - (nodeA.x || 0);
        const dy = (nodeB.y || 0) - (nodeA.y || 0);
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Increased minimum distance threshold
        if (distance > 0 && distance < 300) {
          const force = repelForce / (distance * distance);
          const forceX = (dx / distance) * force;
          const forceY = (dy / distance) * force;
          
          if (!nodeA.fx && !nodeA.fy) {
            nodeA.vx = (nodeA.vx || 0) - forceX;
            nodeA.vy = (nodeA.vy || 0) - forceY;
          }
          if (!nodeB.fx && !nodeB.fy) {
            nodeB.vx = (nodeB.vx || 0) + forceX;
            nodeB.vy = (nodeB.vy || 0) + forceY;
          }
        }
      }
    }

    // Link force (attracts connected nodes)
    edges.forEach(edge => {
      const source = newNodes.find(n => n.id === edge.from);
      const target = newNodes.find(n => n.id === edge.to);
      
      if (source && target) {
        const dx = (target.x || 0) - (source.x || 0);
        const dy = (target.y || 0) - (source.y || 0);
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 0) {
          const force = (distance - linkDistance) * linkForce;
          const forceX = (dx / distance) * force;
          const forceY = (dy / distance) * force;
          
          if (!source.fx && !source.fy) {
            source.vx = (source.vx || 0) + forceX;
            source.vy = (source.vy || 0) + forceY;
          }
          if (!target.fx && !target.fy) {
            target.vx = (target.vx || 0) - forceX;
            target.vy = (target.vy || 0) - forceY;
          }
        }
      }
    });

    // Apply velocity and damping
    newNodes.forEach(node => {
      if (!node.fx && !node.fy) {
        node.vx = (node.vx || 0) * 0.85; // Slightly less damping for more movement
        node.vy = (node.vy || 0) * 0.85;
        
        node.x = (node.x || 0) + (node.vx || 0);
        node.y = (node.y || 0) + (node.vy || 0);
        
        // Keep nodes in bounds
        const radius = getNodeRadius(node.group);
        node.x = Math.max(radius + 10, Math.min(width - radius - 10, node.x));
        node.y = Math.max(radius + 10, Math.min(heightNum - radius - 10, node.y));
      }
    });

    setSimulationNodes(newNodes);
  }, [simulationNodes, edges, width, heightNum, findConnectedComponents]);

  // Initialize node positions with better spacing and hierarchy
  useEffect(() => {
    if (nodes.length === 0) return;

    // Find connected components for initial positioning
    const components = findConnectedComponents(nodes, edges);
    const allInitialNodes: GraphNode[] = [];
    
    components.forEach((component, componentIndex) => {
      // Calculate grid layout parameters (same as simulation)
      const numComponents = components.length;
      const componentsPerRow = Math.ceil(Math.sqrt(numComponents));
      const maxComponentsPerRow = Math.max(2, Math.min(componentsPerRow, Math.floor(width / 350)));
      
      // Position each subgraph in grid pattern
      const row = Math.floor(componentIndex / maxComponentsPerRow);
      const col = componentIndex % maxComponentsPerRow;
      const totalRows = Math.ceil(numComponents / maxComponentsPerRow);
      
      const baseX = (col + 0.5) * (width / maxComponentsPerRow);
      const baseY = (row + 0.5) * (heightNum / totalRows);
      
      component.forEach((node, nodeIndex) => {
        let x = baseX + (Math.random() - 0.5) * 200;
        let y = baseY + (Math.random() - 0.5) * 150;
        
        // Apply initial hierarchy positioning
        if (node.group === 'Industry') {
          y = baseY - 120 + (Math.random() - 0.5) * 30;
        } else if (node.group === 'Sector' || node.group === 'Department') {
          y = baseY - 30 + (Math.random() - 0.5) * 30;
        } else if (node.group === 'PainPoint') {
          y = baseY + 80 + (Math.random() - 0.5) * 40;
        } else if (node.group === 'ProjectOpportunity' || node.group === 'ProjectBlueprint') {
          y = baseY + 150 + (Math.random() - 0.5) * 30;
        } else {
          y = baseY + 20 + (Math.random() - 0.5) * 30;
        }
        
        // Ensure nodes stay in bounds
        const radius = getNodeRadius(node.group);
        x = Math.max(radius + 20, Math.min(width - radius - 20, x));
        y = Math.max(radius + 20, Math.min(heightNum - radius - 20, y));
        
        allInitialNodes.push({
          ...node,
          x,
          y,
          vx: 0,
          vy: 0
        });
      });
    });
    
    // Handle isolated nodes (not in any component)
    nodes.forEach((node, i) => {
      if (!allInitialNodes.find(n => n.id === node.id)) {
        allInitialNodes.push({
          ...node,
          x: Math.random() * (width - 100) + 50,
          y: Math.random() * (heightNum - 100) + 50,
          vx: 0,
          vy: 0
        });
      }
    });
    
    setSimulationNodes(allInitialNodes);
  }, [nodes, edges, width, heightNum, findConnectedComponents]);

  // Animation loop
  useEffect(() => {
    const animate = () => {
      runSimulation();
      animationRef.current = requestAnimationFrame(animate);
    };

    if (simulationNodes.length > 0) {
      animationRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [runSimulation, simulationNodes.length]);

  // Fetch all connections for a specific node
  const fetchNodeConnections = async (nodeId: string) => {
    setLoadingConnections(true);
    try {
      const response = await fetch(`/api/admin/node/${nodeId}/connections`);
      if (response.ok) {
        const data = await response.json();
        setNodeConnections(data.connections || []);
      } else {
        console.error('Failed to fetch node connections');
        setNodeConnections([]);
      }
    } catch (error) {
      console.error('Error fetching node connections:', error);
      setNodeConnections([]);
    } finally {
      setLoadingConnections(false);
    }
  };

  // Handle node interactions
  const handleNodeClick = (node: GraphNode, event: React.MouseEvent) => {
    event.stopPropagation();
    setSelectedNode(node.id);
    setSelectedNodeData(node);
    setShowNodePanel(true);
    
    // Initialize editing state
    setEditingNodeName(false);
    setEditedNodeName(node.label);
    
    // Fetch all connections for this node from the database
    fetchNodeConnections(node.id);
    
    if (onNodeSelect) {
      onNodeSelect(node.id, node);
    }
  };

  const handleNodeDoubleClick = (node: GraphNode, event: React.MouseEvent) => {
    event.stopPropagation();
    if (onNodeDoubleClick) {
      onNodeDoubleClick(node.id, node);
    }
  };

  // Drag handlers
  const handleMouseDown = (node: GraphNode, event: React.MouseEvent) => {
    event.preventDefault();
    setDraggedNode(node.id);
    
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;

    const handleMouseMove = (e: MouseEvent) => {
      const x = (e.clientX - rect.left - transform.x) / transform.k;
      const y = (e.clientY - rect.top - transform.y) / transform.k;
      
      setSimulationNodes(prev => prev.map(n => 
        n.id === node.id 
          ? { ...n, x, y, fx: x, fy: y, vx: 0, vy: 0 }
          : n
      ));
    };

    const handleMouseUp = () => {
      setDraggedNode(null);
      setSimulationNodes(prev => prev.map(n => 
        n.id === node.id 
          ? { ...n, fx: undefined, fy: undefined }
          : n
      ));
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Group nodes by type for legend
  const nodesByGroup = simulationNodes.reduce((acc, node) => {
    if (!acc[node.group]) {
      acc[node.group] = [];
    }
    acc[node.group].push(node);
    return acc;
  }, {} as { [key: string]: GraphNode[] });

  return (
    <div className="graph-viz-container">
      <div className="graph-controls">
        <div className="graph-legend">
          <h4>Graph Legend</h4>
          <div className="legend-items">
            {Object.keys(nodesByGroup).map(group => (
              <div key={group} className="legend-item">
                <div 
                  className="legend-color" 
                  style={{ backgroundColor: getNodeColor(group) }}
                ></div>
                <span>{getNodeIcon(group)} {group} ({nodesByGroup[group].length})</span>
              </div>
            ))}
          </div>
        </div>
        
        <div className="graph-info">
          <div className="info-stat">
            <strong>Nodes:</strong> {simulationNodes.length}
          </div>
          <div className="info-stat">
            <strong>Connections:</strong> {edges.length}
          </div>
          <div className="info-stat">
            <strong>Subgraphs:</strong> {componentCount}
          </div>
          {combinedScaleFactor > 1.2 && (
            <div className="info-stat" style={{ color: '#3498db' }}>
              <strong>Auto-zoom:</strong> {Math.round((1/combinedScaleFactor) * 100)}%
            </div>
          )}
          {selectedNode && (
            <div className="info-stat selected">
              <strong>Selected:</strong> {simulationNodes.find(n => n.id === selectedNode)?.label}
            </div>
          )}
        </div>
      </div>
      
      <div 
        className="graph-canvas-2d"
        style={{ 
          height: `${Math.min(800, heightNum + 50)}px`, // Adaptive height with max limit
          border: '1px solid #bdc3c7',
          borderRadius: '8px',
          backgroundColor: '#f8f9fa',
          overflow: 'auto', // Allow scrolling for large graphs
          position: 'relative'
        }}
      >
        <svg
          ref={svgRef}
          width={width}
          height={heightNum}
          viewBox={`0 0 ${width} ${heightNum}`}
          style={{ cursor: draggedNode ? 'grabbing' : 'grab' }}
        >
          {/* Grid background */}
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e9ecef" strokeWidth="0.5"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
          
          {/* Edges */}
          <g className="edges">
            {edges.map(edge => {
              const source = simulationNodes.find(n => n.id === edge.from);
              const target = simulationNodes.find(n => n.id === edge.to);
              
              if (!source || !target || !source.x || !source.y || !target.x || !target.y) {
                return null;
              }

              // Calculate edge path
              const dx = target.x - source.x;
              const dy = target.y - source.y;
              const distance = Math.sqrt(dx * dx + dy * dy);
              
              if (distance === 0) return null;
              
              const sourceRadius = getNodeRadius(source.group);
              const targetRadius = getNodeRadius(target.group);
              
              const sourceX = source.x + (dx / distance) * sourceRadius;
              const sourceY = source.y + (dy / distance) * sourceRadius;
              const targetX = target.x - (dx / distance) * targetRadius;
              const targetY = target.y - (dy / distance) * targetRadius;

              return (
                <g key={edge.id}>
                  <line
                    x1={sourceX}
                    y1={sourceY}
                    x2={targetX}
                    y2={targetY}
                    stroke="#7f8c8d"
                    strokeWidth="2"
                    opacity="0.6"
                  />
                  {/* Arrow */}
                  <polygon
                    points={`${targetX},${targetY} ${targetX - 8 + 3 * Math.cos(Math.atan2(dy, dx) + 0.5)},${targetY - 8 + 3 * Math.sin(Math.atan2(dy, dx) + 0.5)} ${targetX - 8 + 3 * Math.cos(Math.atan2(dy, dx) - 0.5)},${targetY - 8 + 3 * Math.sin(Math.atan2(dy, dx) - 0.5)}`}
                    fill="#7f8c8d"
                    opacity="0.6"
                  />
                </g>
              );
            })}
          </g>
          
          {/* Nodes */}
          <g className="nodes">
            {simulationNodes.map(node => {
              if (!node.x || !node.y) return null;
              
              const radius = getNodeRadius(node.group);
              const color = getNodeColor(node.group);
              const isSelected = selectedNode === node.id;
              const isDragged = draggedNode === node.id;
              
              return (
                <g key={node.id}>
                  {/* Node circle */}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={radius}
                    fill={color}
                    stroke={isSelected ? '#2c3e50' : '#ffffff'}
                    strokeWidth={isSelected ? 3 : 2}
                    opacity={isDragged ? 0.8 : 1}
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => handleNodeClick(node, e)}
                    onDoubleClick={(e) => handleNodeDoubleClick(node, e)}
                    onMouseDown={(e) => handleMouseDown(node, e)}
                  />
                  
                  {/* Node label */}
                  <text
                    x={node.x}
                    y={node.y + radius + 15}
                    textAnchor="middle"
                    fontSize="12"
                    fill="#2c3e50"
                    fontWeight="500"
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {node.label.length > 15 ? `${node.label.substring(0, 15)}...` : node.label}
                  </text>
                  
                  {/* Node icon */}
                  <text
                    x={node.x}
                    y={node.y + 4}
                    textAnchor="middle"
                    fontSize="14"
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {getNodeIcon(node.group)}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Node Panel Overlay */}
      {showNodePanel && (
        <div 
          className={`node-panel-overlay ${showNodePanel ? 'show' : ''}`}
          onClick={() => setShowNodePanel(false)}
        />
      )}

      {/* Node Details Panel */}
      <div className={`node-details-panel ${showNodePanel ? 'open' : ''}`}>
        {selectedNodeData && (
          <>
            {/* Panel Header */}
            <div className="node-panel-header">
              <div className="node-panel-title-container">
                {editingNodeName ? (
                  <input 
                    type="text" 
                    className="node-panel-title-input editing"
                    value={editedNodeName}
                    onChange={(e) => setEditedNodeName(e.target.value)}
                    onBlur={() => {
                      // Save name change
                      console.log('Saving node name change:', editedNodeName);
                      setEditingNodeName(false);
                      // This would typically call an API to update the node name
                      alert('Node name editing would update the database (read-only mode)');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.currentTarget.blur();
                      } else if (e.key === 'Escape') {
                        setEditedNodeName(selectedNodeData.label);
                        setEditingNodeName(false);
                      }
                    }}
                    autoFocus
                    placeholder="Enter node name"
                  />
                ) : (
                  <div className="node-panel-title-display">
                    <span className="node-panel-title-text">{editedNodeName}</span>
                    <button 
                      className="node-edit-btn"
                      onClick={() => setEditingNodeName(true)}
                      title="Edit node name"
                    >
                      ✏️
                    </button>
                  </div>
                )}
              </div>
              <div className="node-panel-type">{selectedNodeData.group}</div>
              <button 
                className="node-panel-close"
                onClick={() => setShowNodePanel(false)}
              >
                ✕
              </button>
            </div>

            {/* Panel Content */}
            <div className="node-panel-content">
              {/* Properties Section */}
              <div className="node-panel-section">
                <h3 className="node-panel-section-title">Properties</h3>
                {Object.entries(selectedNodeData.properties || {}).map(([key, value]) => {
                  // Filter out non-useful properties from user perspective
                  if (key === 'original_id' || key === 'label' || key === 'name' || key === 'id') {
                    return null;
                  }
                  
                  return (
                    <div key={key} className="node-property">
                      <span className="property-label">{key.charAt(0).toUpperCase() + key.slice(1)}:</span>
                      <input 
                        type="text" 
                        className="form-input"
                        defaultValue={String(value)}
                        placeholder={`Enter ${key}`}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Connections Section */}
              <div className="node-panel-section">
                <h3 className="node-panel-section-title">
                  Connections {loadingConnections && <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>(loading...)</span>}
                  <button 
                    className="add-item-btn"
                    style={{ marginLeft: 'auto', fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                    onClick={() => {
                      // Add connection logic would go here
                      console.log('Add new connection clicked');
                    }}
                  >
                    + Add
                  </button>
                </h3>
                <div className="connections-list">
                  {/* Group connections by relationship type */}
                  {(() => {
                    // Group connections by relationship type
                    const groupedConnections = nodeConnections.reduce((groups, connection) => {
                      const type = connection.type || 'Other';
                      if (!groups[type]) groups[type] = [];
                      groups[type].push(connection);
                      return groups;
                    }, {} as { [key: string]: any[] });

                    return Object.entries(groupedConnections).map(([connectionType, connections]) => {
                      const connectionsArray = connections as any[];
                      return (
                        <div key={connectionType} className="connection-group">
                          <h4 className="connection-group-title">
                            {connectionType.replace('_', ' ')} ({connectionsArray.length})
                          </h4>
                          <div className="connection-group-items">
                            {connectionsArray.map((connection: any) => {
                              const isIncoming = connection.direction === 'incoming';
                              const connectedNode = isIncoming ? connection.sourceNode : connection.targetNode;
                              const isNodeVisible = simulationNodes.some(n => n.id === connectedNode?.id);
                              
                              return (
                                <div key={connection.id} className="connection-item clickable">
                                  <div className={`connection-direction ${isIncoming ? 'incoming' : 'outgoing'}`}>
                                    {isIncoming ? '←' : '→'}
                                  </div>
                                  <div 
                                    className="connection-details"
                                    onClick={() => {
                                      if (connectedNode?.id && onNavigateToNode) {
                                        console.log('Navigate to node:', connectedNode.id, connectedNode.label);
                                        onNavigateToNode(connectedNode.id);
                                      }
                                    }}
                                    style={{ cursor: 'pointer' }}
                                  >
                                    <div className="connection-node">
                                      <span>{getNodeIcon(connectedNode?.group || 'unknown')} </span>
                                      <span style={{ 
                                        color: isNodeVisible ? '#1f2937' : '#9ca3af',
                                        textDecoration: 'underline',
                                        textDecorationColor: '#3b82f6'
                                      }}>
                                        {connectedNode?.label || 'Unknown Node'}
                                      </span>
                                      {!isNodeVisible && (
                                        <span style={{ fontSize: '0.7rem', color: '#6b7280', fontStyle: 'italic' }}> (not in current view)</span>
                                      )}
                                    </div>
                                  </div>
                                  <button 
                                    className="remove-item-btn"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      // Remove connection logic would go here
                                      console.log(`Remove connection ${connection.id}`);
                                    }}
                                  >
                                    ×
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    });
                  })()}

                  {/* Loading state */}
                  {loadingConnections && (
                    <div className="empty-connections">
                      <div className="empty-connections-icon">⏳</div>
                      Loading connections...
                    </div>
                  )}

                  {/* No connections message */}
                  {!loadingConnections && nodeConnections.length === 0 && (
                    <div className="empty-connections">
                      <div className="empty-connections-icon">🔗</div>
                      No connections found
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Panel Actions */}
            <div className="node-panel-actions">
              <button 
                className="node-action-btn primary"
                onClick={() => {
                  // Save changes logic would go here
                  console.log('Saving node changes...');
                  setShowNodePanel(false);
                }}
              >
                💾 Save Changes
              </button>
              {(() => {
                // Check if node has any connections (use fetched connections for accurate count)
                const hasConnections = nodeConnections.length > 0;
                
                return (
                  <button 
                    className={`node-action-btn ${hasConnections ? 'danger-disabled' : 'danger'}`}
                    disabled={hasConnections}
                    onClick={() => {
                      if (hasConnections) {
                        alert('Remove all connections before deleting this node');
                      } else {
                        if (window.confirm(`Are you sure you want to delete "${selectedNodeData.label}"?`)) {
                          console.log('Deleting node:', selectedNodeData.id);
                          setShowNodePanel(false);
                          // Delete logic would go here
                        }
                      }
                    }}
                    title={hasConnections ? 'Remove all connections before deleting this node' : 'Delete this node'}
                  >
                    🗑️ Delete Node
                  </button>
                );
              })()}
            </div>
          </>
        )}
      </div>
      
      <div className="graph-instructions">
        <p>
          <strong>Instructions:</strong> 
          Drag nodes to reposition • Click to select • Double-click to edit • 
          Subgraphs auto-arranged in grid layout • Auto-zoom adjusts for complex graphs • 
          Visual hierarchy: Industries (top) → Sectors/Departments → Pain Points → Projects (bottom)
        </p>
      </div>
    </div>
  );
};

export default GraphViz;