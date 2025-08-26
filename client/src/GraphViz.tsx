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
  height?: string;
}

const GraphViz: React.FC<GraphVizProps> = ({ 
  nodes, 
  edges, 
  nodeType,
  onNodeSelect, 
  onNodeDoubleClick,
  height = '600px' 
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  const [simulationNodes, setSimulationNodes] = useState<GraphNode[]>([]);
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const animationRef = useRef<number>();

  const width = 800;
  const heightNum = parseInt(height) || 600;

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

  // Simple force simulation
  const runSimulation = useCallback(() => {
    if (simulationNodes.length === 0) return;

    const alpha = 0.01;
    const centerForce = 0.005;
    const repelForce = 1200;
    const linkForce = 0.02;
    const linkDistance = 120;

    const newNodes = simulationNodes.map(node => ({ ...node }));

    // Center force
    const centerX = width / 2;
    const centerY = heightNum / 2;
    newNodes.forEach(node => {
      if (!node.fx && !node.fy) {
        const dx = centerX - (node.x || 0);
        const dy = centerY - (node.y || 0);
        node.vx = (node.vx || 0) + dx * centerForce;
        node.vy = (node.vy || 0) + dy * centerForce;
      }
    });

    // Repel force between nodes
    for (let i = 0; i < newNodes.length; i++) {
      for (let j = i + 1; j < newNodes.length; j++) {
        const nodeA = newNodes[i];
        const nodeB = newNodes[j];
        
        const dx = (nodeB.x || 0) - (nodeA.x || 0);
        const dy = (nodeB.y || 0) - (nodeA.y || 0);
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 0 && distance < 200) {
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

    // Link force
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
        node.vx = (node.vx || 0) * 0.9; // damping
        node.vy = (node.vy || 0) * 0.9;
        
        node.x = (node.x || 0) + (node.vx || 0);
        node.y = (node.y || 0) + (node.vy || 0);
        
        // Keep nodes in bounds
        const radius = getNodeRadius(node.group);
        node.x = Math.max(radius, Math.min(width - radius, node.x));
        node.y = Math.max(radius, Math.min(heightNum - radius, node.y));
      }
    });

    setSimulationNodes(newNodes);
  }, [simulationNodes, edges, width, heightNum]);

  // Initialize node positions
  useEffect(() => {
    if (nodes.length === 0) return;

    const initialNodes = nodes.map((node, i) => ({
      ...node,
      x: Math.random() * (width - 100) + 50,
      y: Math.random() * (heightNum - 100) + 50,
      vx: 0,
      vy: 0
    }));
    
    setSimulationNodes(initialNodes);
  }, [nodes, width, heightNum]);

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

  // Handle node interactions
  const handleNodeClick = (node: GraphNode, event: React.MouseEvent) => {
    event.stopPropagation();
    setSelectedNode(node.id);
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
          height, 
          border: '1px solid #bdc3c7',
          borderRadius: '8px',
          backgroundColor: '#f8f9fa',
          overflow: 'hidden',
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
                  {/* Edge label */}
                  {edge.label && distance > 40 && (
                    <text
                      x={(sourceX + targetX) / 2}
                      y={(sourceY + targetY) / 2}
                      textAnchor="middle"
                      fontSize="10"
                      fill="#6c757d"
                      dy="-5"
                    >
                      {edge.label}
                    </text>
                  )}
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
      
      <div className="graph-instructions">
        <p>
          <strong>Instructions:</strong> 
          Drag nodes to reposition • Click to select • Double-click to edit • Nodes auto-arrange based on relationships
        </p>
      </div>
    </div>
  );
};

export default GraphViz;