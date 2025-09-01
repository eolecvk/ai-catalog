import React, { useState, useEffect, useRef, useCallback } from 'react';
import ChatInterface from './components/ChatInterface';
import { GraphNode, GraphEdge, ChatQueryResult } from './types';

interface GraphVizProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  nodeType: string;
  onNodeSelect?: (nodeId: string, nodeData: any) => void;
  onNodeDoubleClick?: (nodeId: string, nodeData: any) => void;
  onNavigateToNode?: (nodeId: string) => void;
  height?: string;
  focusedNode?: string | null;
  enableChat?: boolean;
  graphVersion?: string;
  onGraphDataUpdate?: (nodes: GraphNode[], edges: GraphEdge[]) => void;
}

const GraphViz: React.FC<GraphVizProps> = ({ 
  nodes, 
  edges, 
  nodeType,
  onNodeSelect, 
  onNodeDoubleClick,
  onNavigateToNode,
  height = '700px',
  focusedNode = null,
  enableChat = true,
  graphVersion = 'base',
  onGraphDataUpdate
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedNodeData, setSelectedNodeData] = useState<GraphNode | null>(null);
  const [showNodePanel, setShowNodePanel] = useState<boolean>(true);
  const [sidePanelCollapsed, setSidePanelCollapsed] = useState<boolean>(false);
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  const [simulationNodes, setSimulationNodes] = useState<GraphNode[]>([]);
  const [componentCount, setComponentCount] = useState<number>(1);
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [nodeConnections, setNodeConnections] = useState<any[]>([]);
  const [loadingConnections, setLoadingConnections] = useState<boolean>(false);
  const [editingNodeName, setEditingNodeName] = useState<boolean>(false);
  const [editedNodeName, setEditedNodeName] = useState<string>('');
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState<boolean>(false);
  const [chatQueryResults, setChatQueryResults] = useState<{ nodes: GraphNode[], edges: GraphEdge[] } | null>(null);
  const [showingChatResults, setShowingChatResults] = useState<boolean>(false);
  const animationRef = useRef<number>();
  const containerRef = useRef<HTMLDivElement>(null);

  // Chat functionality
  const handleChatToggle = () => {
    setChatOpen(!chatOpen);
  };

  const handleApplyQueryResult = (queryResult: ChatQueryResult) => {
    setChatQueryResults(queryResult.graphData);
    setShowingChatResults(true);
    
    // Update the graph data if callback is provided
    if (onGraphDataUpdate) {
      onGraphDataUpdate(queryResult.graphData.nodes, queryResult.graphData.edges);
    }
  };

  const handleReturnToOriginalView = () => {
    setChatQueryResults(null);
    setShowingChatResults(false);
    
    // Return to original graph data
    if (onGraphDataUpdate) {
      onGraphDataUpdate(nodes, edges);
    }
  };

  // Get the current graph data (either original or chat results)
  const getCurrentGraphData = () => {
    if (showingChatResults && chatQueryResults) {
      return chatQueryResults;
    }
    return { nodes, edges };
  };

  // Sync focused node from prop
  useEffect(() => {
    if (focusedNode !== null) {
      setFocusedNodeId(focusedNode);
      // If the focused node is provided, also auto-select it for the side panel
      const focusedNodeData = nodes.find(n => n.id === focusedNode);
      if (focusedNodeData) {
        setSelectedNode(focusedNode);
        setSelectedNodeData(focusedNodeData);
        setEditedNodeName(focusedNodeData.label);
        fetchNodeConnections(focusedNode);
      }
    }
  }, [focusedNode, nodes]);

  // Calculate adaptive canvas size based on available space and content
  const getCanvasSize = useCallback(() => {
    // Base dimensions that work well for most graphs
    const baseWidth = sidePanelCollapsed ? 1200 : 800; // Adjust for panel visibility
    const baseHeight = parseInt(height) || 700;
    
    // Auto-zoom calculation: zoom out when there are many nodes
    const nodeCount = nodes.length;
    
    // Estimate component count based on node count and edge density for initial sizing
    const estimatedComponentCount = Math.max(1, Math.min(nodeCount / 5, edges.length === 0 ? nodeCount : Math.ceil(nodeCount / 10)));
    
    // Scale factor based on complexity (more nodes = zoom out more)
    const nodeScaleFactor = Math.max(1, Math.sqrt(nodeCount / 20)); // Starts scaling after 20 nodes
    const componentScaleFactor = Math.max(1, estimatedComponentCount / 3); // Starts scaling after 3 components
    const combinedScaleFactor = Math.max(nodeScaleFactor, componentScaleFactor);
    
    // Apply scaling to canvas dimensions, but keep within reasonable bounds for the layout
    const width = Math.min(2000, baseWidth * combinedScaleFactor);
    const heightNum = Math.min(1500, baseHeight * Math.max(1, combinedScaleFactor * 0.8));
    
    return { width, heightNum, combinedScaleFactor };
  }, [nodes.length, edges.length, height, sidePanelCollapsed]);

  const { width, heightNum, combinedScaleFactor } = getCanvasSize();

  // Color scheme for different node types
  const getNodeColor = (group: string): string => {
    const colors: { [key: string]: string } = {
      'Industry': '#2980b9',       // Professional blue
      'Sector': '#c0392b',         // Rich red
      'Department': '#d35400',     // Vibrant orange
      'PainPoint': '#e67e22',      // Warning orange
      'ProjectBlueprint': '#8e44ad', // Rich purple
      'ProjectOpportunity': '#16a085', // Teal green
      'Role': '#2c3e50',           // Dark blue-gray
      'SubModule': '#7f8c8d',      // Medium gray
      'Module': '#27ae60'          // Fresh green
    };
    return colors[group] || '#95a5a6';
  };

  // Get gradient URL for node type
  const getNodeGradient = (group: string): string => {
    const gradients: { [key: string]: string } = {
      'Industry': 'url(#industryGradient)',
      'Sector': 'url(#sectorGradient)',
      'Department': 'url(#departmentGradient)',
      'PainPoint': 'url(#painpointGradient)',
      'ProjectBlueprint': 'url(#projectblueprintGradient)',
      'ProjectOpportunity': 'url(#projectopportunityGradient)',
      'Role': 'url(#roleGradient)',
      'SubModule': 'url(#submoduleGradient)',
      'Module': 'url(#moduleGradient)'
    };
    return gradients[group] || getNodeColor(group);
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
      'Industry': 32,      // Largest - top hierarchy
      'Sector': 26,        // Second largest 
      'Department': 22,    // Medium
      'PainPoint': 20,     // Medium-small
      'ProjectBlueprint': 22,
      'ProjectOpportunity': 24,
      'Role': 18,          // Small
      'SubModule': 16,     // Smallest
      'Module': 28
    };
    return radii[group] || 20;
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

    const currentData = getCurrentGraphData();
    const alpha = 0.01;
    const repelForce = 2000; // Increased repulsion
    const linkForce = 0.03;
    const linkDistance = 150; // Increased link distance
    const hierarchyForce = 0.008; // Force for vertical hierarchy

    const newNodes = simulationNodes.map(node => ({ ...node }));
    const components = findConnectedComponents(newNodes, currentData.edges);

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
    
    // Calculate the actual grid dimensions needed
    const actualComponentsPerRow = Math.min(maxComponentsPerRow, numComponents);
    const actualRows = Math.ceil(numComponents / maxComponentsPerRow);
    
    // Calculate the total space needed for the grid
    const gridWidth = actualComponentsPerRow * adaptiveSubgraphSeparation;
    const gridHeight = actualRows * (heightNum / Math.max(1, actualRows));
    
    // Calculate centering offset to center the grid within the viewport
    // For single component, center it directly
    const centerOffsetX = numComponents === 1 ? 0 : Math.max(0, (width - gridWidth) / 2);
    const centerOffsetY = numComponents === 1 ? 0 : Math.max(0, (heightNum - gridHeight) / 2);
    
    // Position subgraphs in a centered grid pattern
    components.forEach((component, componentIndex) => {
      const row = Math.floor(componentIndex / maxComponentsPerRow);
      const col = componentIndex % maxComponentsPerRow;
      
      // Calculate center position for this component with centering offset
      const componentCenterX = numComponents === 1 ? width / 2 : centerOffsetX + (col + 0.5) * (gridWidth / actualComponentsPerRow);
      const componentCenterY = numComponents === 1 ? heightNum / 2 : centerOffsetY + (row + 0.5) * (gridHeight / actualRows);
      
      // Ensure components stay within bounds
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
    currentData.edges.forEach(edge => {
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
  }, [simulationNodes, width, heightNum, findConnectedComponents, showingChatResults, chatQueryResults, nodes, edges]);

  // Initialize node positions with better spacing and hierarchy
  useEffect(() => {
    const currentData = getCurrentGraphData();
    if (currentData.nodes.length === 0) return;

    // Find connected components for initial positioning
    const components = findConnectedComponents(currentData.nodes, currentData.edges);
    const allInitialNodes: GraphNode[] = [];
    
    components.forEach((component, componentIndex) => {
      // Calculate grid layout parameters (same as simulation)
      const numComponents = components.length;
      const componentsPerRow = Math.ceil(Math.sqrt(numComponents));
      const maxComponentsPerRow = Math.max(2, Math.min(componentsPerRow, Math.floor(width / 350)));
      
      // Calculate centering offsets (same logic as simulation)
      const actualComponentsPerRow = Math.min(maxComponentsPerRow, numComponents);
      const actualRows = Math.ceil(numComponents / maxComponentsPerRow);
      const gridWidth = actualComponentsPerRow * 350; // Using 350 as base separation
      const gridHeight = actualRows * (heightNum / Math.max(1, actualRows));
      const centerOffsetX = numComponents === 1 ? 0 : Math.max(0, (width - gridWidth) / 2);
      const centerOffsetY = numComponents === 1 ? 0 : Math.max(0, (heightNum - gridHeight) / 2);
      
      // Position each subgraph in centered grid pattern
      const row = Math.floor(componentIndex / maxComponentsPerRow);
      const col = componentIndex % maxComponentsPerRow;
      
      const baseX = numComponents === 1 ? width / 2 : centerOffsetX + (col + 0.5) * (gridWidth / actualComponentsPerRow);
      const baseY = numComponents === 1 ? heightNum / 2 : centerOffsetY + (row + 0.5) * (gridHeight / actualRows);
      
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
    currentData.nodes.forEach((node, i) => {
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
  }, [nodes, edges, width, heightNum, findConnectedComponents, showingChatResults, chatQueryResults]);

  // Toggle side panel visibility
  const toggleSidePanel = () => {
    setSidePanelCollapsed(!sidePanelCollapsed);
  };

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
    event.preventDefault();
    
    // Update node selection and focus
    setSelectedNode(node.id);
    setSelectedNodeData(node);
    setFocusedNodeId(node.id);
    
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

  // Handle clicking on graph background to clear focus (but keep panel open)
  const handleGraphBackgroundClick = (event: React.MouseEvent) => {
    // Only clear focus if clicking directly on the background rectangle
    if (event.target === event.currentTarget) {
      setFocusedNodeId(null);
      setSelectedNode(null);
      setSelectedNodeData(null);
      // Note: We don't close the panel anymore
    }
  };

  // Handle connection click from side panel
  const handleConnectionClick = (nodeId: string, nodeData?: any) => {
    // First try to find the node in current simulation nodes
    let targetNode = simulationNodes.find(n => n.id === nodeId);
    
    // If not found in simulation, use the node data from connection or create a basic node object
    if (!targetNode && nodeData) {
      targetNode = {
        id: nodeData.id || nodeId,
        label: nodeData.label || nodeData.name || 'Unknown Node',
        group: nodeData.group || 'Other',
        properties: nodeData.properties || {},
        x: 0,
        y: 0,
        vx: 0,
        vy: 0
      };
    }
    
    if (targetNode) {
      setFocusedNodeId(nodeId);
      setSelectedNode(nodeId);
      setSelectedNodeData(targetNode);
      fetchNodeConnections(nodeId);
      
      if (onNavigateToNode) {
        onNavigateToNode(nodeId);
      }
    } else {
      console.warn('Target node not found:', nodeId);
    }
  };

  // Get direct connections for a node
  const getDirectConnections = useCallback((nodeId: string): Set<string> => {
    const currentData = getCurrentGraphData();
    const connections = new Set<string>();
    currentData.edges.forEach(edge => {
      if (edge.from === nodeId) {
        connections.add(edge.to);
      }
      if (edge.to === nodeId) {
        connections.add(edge.from);
      }
    });
    return connections;
  }, [showingChatResults, chatQueryResults, nodes, edges]);

  // Determine if a node should be faded
  const shouldFadeNode = useCallback((nodeId: string): boolean => {
    if (!focusedNodeId) return false;
    if (nodeId === focusedNodeId) return false;
    
    const directConnections = getDirectConnections(focusedNodeId);
    return !directConnections.has(nodeId);
  }, [focusedNodeId, getDirectConnections]);

  // Determine if an edge should be faded
  const shouldFadeEdge = useCallback((edge: GraphEdge): boolean => {
    if (!focusedNodeId) return false;
    return edge.from !== focusedNodeId && edge.to !== focusedNodeId;
  }, [focusedNodeId]);

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
    <div ref={containerRef} className="graph-viz-container">

      {/* Main Content Area - Side by Side Layout */}
      <div className="graph-main-content">
        {/* Panel Toggle Button - Fixed Position */}
        <button 
          className="side-panel-toggle-btn-fixed"
          onClick={toggleSidePanel}
          title={sidePanelCollapsed ? "Show side panel" : "Hide side panel"}
        >
          {sidePanelCollapsed ? '◀' : '▶'}
        </button>
        
        {/* Graph Canvas */}
        <div 
          className={`graph-canvas-container ${sidePanelCollapsed ? 'full-width' : ''}`}
        >
          <div 
            className={`graph-canvas-2d ${focusedNodeId ? 'focused' : ''}`}
            style={{ 
              height: '100%',
              minHeight: '500px',
              border: '1px solid #bdc3c7',
              borderRadius: '8px',
              backgroundColor: '#f8f9fa',
              overflow: 'hidden',
              position: 'relative',
              padding: '1rem'
            }}
          >
            {/* Graph Stats Overlay */}
            <div className="graph-stats-overlay">
              <div className="graph-stat">
                <strong>{simulationNodes.length}</strong> nodes
              </div>
              <div className="graph-stat">
                <strong>{edges.length}</strong> connections
              </div>
              <div className="graph-stat">
                <strong>{componentCount}</strong> subgraphs
              </div>
              {combinedScaleFactor > 1.2 && (
                <div className="graph-stat auto-zoom">
                  <strong>{Math.round((1/combinedScaleFactor) * 100)}%</strong> zoom
                </div>
              )}
            </div>
            <svg
              ref={svgRef}
              width="100%"
              height="100%"
              viewBox={`0 0 ${width} ${heightNum}`}
              preserveAspectRatio="xMidYMid meet"
              style={{ 
                cursor: draggedNode ? 'grabbing' : 'grab',
                maxWidth: '100%',
                maxHeight: '100%'
              }}
            >
          {/* Grid background and gradients */}
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e9ecef" strokeWidth="0.5"/>
            </pattern>
            
            {/* Node shadow filter */}
            <filter id="nodeShadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="2" dy="2" stdDeviation="3" floodOpacity="0.3"/>
            </filter>
            
            {/* Gradients for each node type */}
            <radialGradient id="industryGradient" cx="30%" cy="30%">
              <stop offset="0%" stopColor="#3498db"/>
              <stop offset="100%" stopColor="#2980b9"/>
            </radialGradient>
            
            <radialGradient id="sectorGradient" cx="30%" cy="30%">
              <stop offset="0%" stopColor="#e74c3c"/>
              <stop offset="100%" stopColor="#c0392b"/>
            </radialGradient>
            
            <radialGradient id="departmentGradient" cx="30%" cy="30%">
              <stop offset="0%" stopColor="#f39c12"/>
              <stop offset="100%" stopColor="#d35400"/>
            </radialGradient>
            
            <radialGradient id="painpointGradient" cx="30%" cy="30%">
              <stop offset="0%" stopColor="#f39c12"/>
              <stop offset="100%" stopColor="#e67e22"/>
            </radialGradient>
            
            <radialGradient id="projectblueprintGradient" cx="30%" cy="30%">
              <stop offset="0%" stopColor="#9b59b6"/>
              <stop offset="100%" stopColor="#8e44ad"/>
            </radialGradient>
            
            <radialGradient id="projectopportunityGradient" cx="30%" cy="30%">
              <stop offset="0%" stopColor="#1abc9c"/>
              <stop offset="100%" stopColor="#16a085"/>
            </radialGradient>
            
            <radialGradient id="roleGradient" cx="30%" cy="30%">
              <stop offset="0%" stopColor="#34495e"/>
              <stop offset="100%" stopColor="#2c3e50"/>
            </radialGradient>
            
            <radialGradient id="submoduleGradient" cx="30%" cy="30%">
              <stop offset="0%" stopColor="#95a5a6"/>
              <stop offset="100%" stopColor="#7f8c8d"/>
            </radialGradient>
            
            <radialGradient id="moduleGradient" cx="30%" cy="30%">
              <stop offset="0%" stopColor="#2ecc71"/>
              <stop offset="100%" stopColor="#27ae60"/>
            </radialGradient>
          </defs>
          <rect 
            width="100%" 
            height="100%" 
            fill="url(#grid)" 
            onClick={handleGraphBackgroundClick}
            style={{ cursor: 'default' }}
          />
          
          {/* Edges */}
          <g className="edges">
            {getCurrentGraphData().edges.map(edge => {
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
                    opacity={shouldFadeEdge(edge) ? "0.15" : "0.6"}
                    style={{
                      transition: 'opacity 0.3s ease-in-out'
                    }}
                  />
                  {/* Arrow */}
                  <polygon
                    points={`${targetX},${targetY} ${targetX - 8 + 3 * Math.cos(Math.atan2(dy, dx) + 0.5)},${targetY - 8 + 3 * Math.sin(Math.atan2(dy, dx) + 0.5)} ${targetX - 8 + 3 * Math.cos(Math.atan2(dy, dx) - 0.5)},${targetY - 8 + 3 * Math.sin(Math.atan2(dy, dx) - 0.5)}`}
                    fill="#7f8c8d"
                    opacity={shouldFadeEdge(edge) ? "0.15" : "0.6"}
                    style={{
                      transition: 'opacity 0.3s ease-in-out'
                    }}
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
              const gradient = getNodeGradient(node.group);
              const isSelected = selectedNode === node.id;
              const isDragged = draggedNode === node.id;
              const isFocused = focusedNodeId === node.id;
              const shouldFade = shouldFadeNode(node.id);
              
              return (
                <g key={node.id}>
                  {/* Node circle */}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={radius}
                    fill={gradient}
                    stroke={isFocused ? '#e74c3c' : (isSelected ? '#2c3e50' : '#ffffff')}
                    strokeWidth={isFocused ? 5 : (isSelected ? 4 : 3)}
                    opacity={shouldFade ? 0.25 : (isDragged ? 0.8 : 1)}
                    filter="url(#nodeShadow)"
                    style={{ 
                      cursor: 'pointer',
                      transition: 'opacity 0.3s ease-in-out, stroke 0.3s ease-in-out, stroke-width 0.3s ease-in-out'
                    }}
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
                    fontWeight={isFocused ? '700' : '500'}
                    opacity={shouldFade ? 0.3 : 1}
                    style={{ 
                      pointerEvents: 'none', 
                      userSelect: 'none',
                      transition: 'opacity 0.3s ease-in-out, font-weight 0.3s ease-in-out'
                    }}
                  >
                    {(() => {
                      // Split long labels into multiple lines
                      const maxCharsPerLine = 15;
                      const words = node.label.split(' ');
                      const lines: string[] = [];
                      let currentLine = '';
                      
                      for (const word of words) {
                        if ((currentLine + word).length <= maxCharsPerLine) {
                          currentLine += (currentLine ? ' ' : '') + word;
                        } else {
                          if (currentLine) {
                            lines.push(currentLine);
                            currentLine = word;
                          } else {
                            // Word is too long, split it
                            lines.push(word.substring(0, maxCharsPerLine));
                            currentLine = word.substring(maxCharsPerLine);
                          }
                        }
                      }
                      if (currentLine) lines.push(currentLine);
                      
                      // Limit to 3 lines max
                      const maxLines = 3;
                      if (lines.length > maxLines) {
                        lines[maxLines - 1] = lines[maxLines - 1].substring(0, maxCharsPerLine - 3) + '...';
                        lines.splice(maxLines);
                      }
                      
                      return lines.map((line, index) => (
                        <tspan
                          key={index}
                          x={node.x}
                          dy={index === 0 ? 0 : '1.2em'}
                        >
                          {line}
                        </tspan>
                      ));
                    })()}
                  </text>
                  
                  {/* Node icon */}
                  <text
                    x={node.x}
                    y={node.y + 4}
                    textAnchor="middle"
                    fontSize={isFocused ? '16' : '14'}
                    opacity={shouldFade ? 0.3 : 1}
                    style={{ 
                      pointerEvents: 'none', 
                      userSelect: 'none',
                      transition: 'opacity 0.3s ease-in-out, font-size 0.3s ease-in-out'
                    }}
                  >
                    {getNodeIcon(node.group)}
                  </text>
                </g>
              );
            })}
          </g>
          </svg>
          </div>
        </div>

        {/* Side Panel */}
        <div className={`graph-side-panel ${sidePanelCollapsed ? 'collapsed' : ''}`}>
          {!sidePanelCollapsed && (
            <div className="side-panel-content">
              {selectedNodeData ? (
                <>
                  {/* Panel Header */}
                  <div className="side-panel-header">
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
                  {/* Group connections by connected node type */}
                  {(() => {
                    // Helper function to get plural form of node type
                    const getPluralNodeType = (nodeType: string): string => {
                      const pluralMapping: { [key: string]: string } = {
                        'Industry': 'Industries',
                        'Sector': 'Sectors', 
                        'Department': 'Departments',
                        'PainPoint': 'Pain Points',
                        'ProjectBlueprint': 'Project Blueprints',
                        'ProjectOpportunity': 'Project Opportunities',
                        'Role': 'Roles',
                        'SubModule': 'Sub Modules',
                        'Module': 'Modules'
                      };
                      return pluralMapping[nodeType] || nodeType + 's';
                    };

                    // Group connections by connected node type
                    const groupedConnections = nodeConnections.reduce((groups, connection) => {
                      const isIncoming = connection.direction === 'incoming';
                      const connectedNode = isIncoming ? connection.sourceNode : connection.targetNode;
                      const nodeType = connectedNode?.group || 'Other';
                      if (!groups[nodeType]) groups[nodeType] = [];
                      groups[nodeType].push(connection);
                      return groups;
                    }, {} as { [key: string]: any[] });

                    return Object.entries(groupedConnections).map(([nodeType, connections]) => {
                      const connectionsArray = connections as any[];
                      return (
                        <div key={nodeType} className="connection-group">
                          <h4 className="connection-group-title">
                            {getPluralNodeType(nodeType)} ({connectionsArray.length})
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
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (connectedNode?.id) {
                                        handleConnectionClick(connectedNode.id, connectedNode);
                                      }
                                    }}
                                    style={{ cursor: 'pointer' }}
                                  >
                                    <div className="connection-node">
                                      <span style={{ 
                                        color: isNodeVisible ? '#1f2937' : '#9ca3af',
                                        textDecoration: 'underline',
                                        textDecorationColor: '#3b82f6'
                                      }}>
                                        {connectedNode?.label || 'Unknown Node'}
                                      </span>
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
            ) : (
              <div className="side-panel-empty">
                <div className="empty-icon">🎯</div>
                <p>Click on a node to view its details and connections</p>
              </div>
            )}
            </div>
          )}
        </div>
      </div>

      {/* Chat Interface */}
      {enableChat && (
        <ChatInterface
          isOpen={chatOpen}
          onToggle={handleChatToggle}
          onApplyQueryResult={handleApplyQueryResult}
          graphContext={{
            currentNodeType: nodeType,
            selectedNodes: selectedNode ? [selectedNode] : [],
            graphVersion: graphVersion
          }}
        />
      )}

      {/* Return to Original View Button */}
      {showingChatResults && (
        <div className="graph-view-controls">
          <button
            className="return-to-original-btn"
            onClick={handleReturnToOriginalView}
            title="Return to original graph view"
          >
            ← Return to Original View
          </button>
        </div>
      )}
      
      <div className="graph-instructions">
        <p>
          <strong>Instructions:</strong> 
          Drag nodes to reposition • Click to focus and view connections • Double-click to edit • 
          Click connections in side panel to navigate • Toggle side panel with ▶/◀ button • 
          Subgraphs auto-arranged in grid layout • Auto-zoom adjusts for complex graphs • 
          Visual hierarchy: Industries (top) → Sectors/Departments → Pain Points → Projects (bottom)
          {enableChat && ' • Use the chat interface to explore graph data with natural language queries'}
        </p>
      </div>
    </div>
  );
};

export default GraphViz;