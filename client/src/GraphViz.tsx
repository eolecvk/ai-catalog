import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { GraphNode, GraphEdge } from './types';

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

// Quadtree implementation for spatial partitioning
class QuadTree {
  private bounds: { x: number; y: number; width: number; height: number };
  private nodes: GraphNode[];
  private children: QuadTree[];
  private maxNodes: number;
  private divided: boolean;

  constructor(bounds: { x: number; y: number; width: number; height: number }, maxNodes: number = 4) {
    this.bounds = bounds;
    this.nodes = [];
    this.children = [];
    this.maxNodes = maxNodes;
    this.divided = false;
  }

  insert(node: GraphNode): boolean {
    if (!this.contains(node)) return false;

    if (this.nodes.length < this.maxNodes && !this.divided) {
      this.nodes.push(node);
      return true;
    }

    if (!this.divided) {
      this.subdivide();
    }

    return this.children.some(child => child.insert(node));
  }

  private contains(node: GraphNode): boolean {
    return node.x! >= this.bounds.x &&
           node.x! < this.bounds.x + this.bounds.width &&
           node.y! >= this.bounds.y &&
           node.y! < this.bounds.y + this.bounds.height;
  }

  private subdivide(): void {
    const { x, y, width, height } = this.bounds;
    const halfWidth = width / 2;
    const halfHeight = height / 2;

    this.children = [
      new QuadTree({ x, y, width: halfWidth, height: halfHeight }, this.maxNodes),
      new QuadTree({ x: x + halfWidth, y, width: halfWidth, height: halfHeight }, this.maxNodes),
      new QuadTree({ x, y: y + halfHeight, width: halfWidth, height: halfHeight }, this.maxNodes),
      new QuadTree({ x: x + halfWidth, y: y + halfHeight, width: halfWidth, height: halfHeight }, this.maxNodes)
    ];

    // Redistribute nodes to children
    for (const node of this.nodes) {
      this.children.some(child => child.insert(node));
    }
    this.nodes = [];
    this.divided = true;
  }

  queryRange(range: { x: number; y: number; width: number; height: number }): GraphNode[] {
    const found: GraphNode[] = [];
    
    if (!this.intersects(range)) return found;

    // Add nodes from this quad
    for (const node of this.nodes) {
      if (range.x <= node.x! && node.x! < range.x + range.width &&
          range.y <= node.y! && node.y! < range.y + range.height) {
        found.push(node);
      }
    }

    // Query children if divided
    if (this.divided) {
      for (const child of this.children) {
        found.push(...child.queryRange(range));
      }
    }

    return found;
  }

  private intersects(range: { x: number; y: number; width: number; height: number }): boolean {
    return !(range.x > this.bounds.x + this.bounds.width ||
             range.x + range.width < this.bounds.x ||
             range.y > this.bounds.y + this.bounds.height ||
             range.y + range.height < this.bounds.y);
  }

  getAllNodes(): GraphNode[] {
    const allNodes = [...this.nodes];
    if (this.divided) {
      for (const child of this.children) {
        allNodes.push(...child.getAllNodes());
      }
    }
    return allNodes;
  }
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
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  const [simulationNodes, setSimulationNodes] = useState<GraphNode[]>([]);
  const [componentCount, setComponentCount] = useState<number>(1);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  
  // Performance thresholds for progressive rendering
  const performanceConfig = useMemo(() => {
    const nodeCount = nodes.length;
    return {
      useSimpleRendering: nodeCount > 100,
      disableShadows: nodeCount > 50,
      disableGradients: nodeCount > 150,
      disableAnimations: nodeCount > 200,
      simplifyForces: nodeCount > 75,
      reduceVisualEffects: nodeCount > 30
    };
  }, [nodes.length]);

  // Use props directly - single source of truth from App.tsx
  const currentGraphData = { nodes, edges };
  // Debug: Log when props change
  useEffect(() => {
    console.log('🎨 GRAPHVIZ - Data updated:', { nodes: nodes.length, edges: edges.length });
    if (nodes.length > 0) {
      console.log('🔍 First 3 node IDs:', nodes.slice(0, 3).map(n => n.id));
      const nodeTypes = new Set(nodes.slice(0, 10).map(n => n.group));
      console.log('📋 Sample node types:', Array.from(nodeTypes));
    }
  }, [nodes, edges]);
  
  // Debug: Log when props specifically change
  useEffect(() => {
    console.log('🎨 GRAPHVIZ PROPS UPDATED:');
    console.log('- nodes prop:', nodes.length);
    console.log('- edges prop:', edges.length);
    console.log('- Sample node IDs from props:', nodes.slice(0, 5).map(n => n.id));
  }, [nodes, edges]);
  const animationRef = useRef<number>();
  const [isAnimationRunning, setIsAnimationRunning] = useState(false);
  const [simulationStable, setSimulationStable] = useState(false);
  const lastFrameTime = useRef<number>(0);
  const frameInterval = 1000 / 30; // 30fps = ~33.33ms per frame
  
  // Performance monitoring
  const performanceMetrics = useRef({
    frameCount: 0,
    totalFrameTime: 0,
    lastSecond: Date.now(),
    currentFps: 0,
    simulationTime: 0,
    renderTime: 0
  });
  const containerRef = useRef<HTMLDivElement>(null);

  // Batched state updates to reduce re-renders
  const batchedUpdateNodes = useCallback((updater: (prev: GraphNode[]) => GraphNode[]) => {
    setSimulationNodes(updater);
  }, []);

  // Chat functionality




  // Sync focused node from prop
  useEffect(() => {
    if (focusedNode !== null) {
      setFocusedNodeId(focusedNode);
    }
  }, [focusedNode]);

  // Listen for container resize when using percentage heights
  useEffect(() => {
    if (height === "100%") {
      const handleResize = () => {
        // Trigger recalculation of canvas size
        batchedUpdateNodes(prev => [...prev]);
      };

      const resizeObserver = new ResizeObserver(handleResize);
      if (containerRef.current) {
        resizeObserver.observe(containerRef.current);
      }

      return () => {
        resizeObserver.disconnect();
        console.log('🧹 ResizeObserver disconnected');
      };
    }
  }, [height, batchedUpdateNodes]);

  // Memoize expensive calculations
  const memoizedCanvasSize = useMemo(() => {
    console.log('🔄 Recalculating canvas size');
    // Base dimensions that work well for most graphs
    const baseWidth = 1200; // Full width since no side panel
    let baseHeight = 700; // Default fallback
    
    // Handle percentage heights by using container dimensions
    if (height === "100%" && containerRef.current) {
      const containerHeight = containerRef.current.clientHeight;
      if (containerHeight > 0) {
        baseHeight = Math.max(400, containerHeight - 100); // Subtract padding/margins
      }
    } else {
      baseHeight = parseInt(height) || 700;
    }
    
    // Auto-zoom calculation: zoom out when there are many nodes
    const nodeCount = currentGraphData.nodes.length;
    
    // Estimate component count based on node count and edge density for initial sizing
    const estimatedComponentCount = Math.max(1, Math.min(nodeCount / 5, currentGraphData.edges.length === 0 ? nodeCount : Math.ceil(nodeCount / 10)));
    
    // Scale factor based on complexity (more nodes = zoom out more)
    const nodeScaleFactor = Math.max(1, Math.sqrt(nodeCount / 20)); // Starts scaling after 20 nodes
    const componentScaleFactor = Math.max(1, estimatedComponentCount / 3); // Starts scaling after 3 components
    const combinedScaleFactor = Math.max(nodeScaleFactor, componentScaleFactor);
    
    // Apply scaling to canvas dimensions, but keep within reasonable bounds for the layout
    const width = Math.min(2000, baseWidth * combinedScaleFactor);
    const heightNum = Math.min(1500, baseHeight * Math.max(1, combinedScaleFactor * 0.8));
    
    return { width, heightNum, combinedScaleFactor };
  }, [nodes.length, edges.length, height, containerRef.current?.clientHeight]);

  // Calculate adaptive canvas size based on available space and content
  const getCanvasSize = useCallback(() => {
    return memoizedCanvasSize;
  }, [memoizedCanvasSize]);

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

  // Get icon for node type - using industry emoji (🏢) for all as requested
  const getNodeIcon = (group: string): string => {
    // Use industry emoji for all graph nodes as requested
    return '🏢';
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

  // Memoize connected components calculation
  const memoizedComponents = useMemo(() => {
    console.log('🔄 Recalculating connected components');
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
  }, [nodes, edges]);

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
    
    return memoizedComponents;
  }, [memoizedComponents]);

  // Advanced force simulation with subgraph separation and hierarchy
  const runSimulation = useCallback(() => {
    if (simulationNodes.length === 0) return;

    const activeGraphData = currentGraphData;
    
    // Adaptive force parameters based on performance config
    const repelForce = performanceConfig.simplifyForces ? 1000 : 2000; 
    const linkForce = performanceConfig.simplifyForces ? 0.02 : 0.03;
    const linkDistance = performanceConfig.simplifyForces ? 100 : 150;
    const hierarchyForce = performanceConfig.simplifyForces ? 0.005 : 0.008;

    const newNodes = simulationNodes.map(node => ({ ...node }));
    const components = findConnectedComponents(newNodes, activeGraphData.edges);

    // Update component count state
    const numComponents = components.length;
    if (numComponents !== componentCount) {
      setComponentCount(numComponents);
    }
    
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

    // Optimized repel force using spatial partitioning
    if (newNodes.length > 20) {
      // Use quadtree for large graphs (O(n log n) complexity)
      const quadTree = new QuadTree({ x: 0, y: 0, width, height: heightNum });
      newNodes.forEach(node => quadTree.insert(node));
      
      const searchRadius = 300;
      newNodes.forEach(nodeA => {
        if (nodeA.fx && nodeA.fy) return; // Skip fixed nodes
        
        // Query nearby nodes only
        const range = {
          x: (nodeA.x || 0) - searchRadius,
          y: (nodeA.y || 0) - searchRadius,
          width: searchRadius * 2,
          height: searchRadius * 2
        };
        
        const nearbyNodes = quadTree.queryRange(range);
        
        nearbyNodes.forEach(nodeB => {
          if (nodeA.id === nodeB.id) return;
          
          const dx = (nodeB.x || 0) - (nodeA.x || 0);
          const dy = (nodeB.y || 0) - (nodeA.y || 0);
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance > 0 && distance < searchRadius) {
            const force = repelForce / (distance * distance);
            const forceX = (dx / distance) * force * 0.5; // Reduced force for stability
            const forceY = (dy / distance) * force * 0.5;
            
            nodeA.vx = (nodeA.vx || 0) - forceX;
            nodeA.vy = (nodeA.vy || 0) - forceY;
          }
        });
      });
    } else {
      // Use simple O(n²) for small graphs
      for (let i = 0; i < newNodes.length; i++) {
        for (let j = i + 1; j < newNodes.length; j++) {
          const nodeA = newNodes[i];
          const nodeB = newNodes[j];
          
          const dx = (nodeB.x || 0) - (nodeA.x || 0);
          const dy = (nodeB.y || 0) - (nodeA.y || 0);
          const distance = Math.sqrt(dx * dx + dy * dy);
          
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
    }

    // Link force (attracts connected nodes)
    activeGraphData.edges.forEach(edge => {
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

    batchedUpdateNodes(() => newNodes);
  }, [simulationNodes, width, heightNum, findConnectedComponents, componentCount, nodes, edges, batchedUpdateNodes, performanceConfig]);

  // Restart animation when graph data changes
  useEffect(() => {
    if (simulationNodes.length > 0) {
      console.log('🔄 Graph data changed - restarting animation');
      setSimulationStable(false);
      setIsAnimationRunning(false); // Will be restarted by animation loop effect
    }
  }, [nodes, edges]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('🧹 GraphViz cleanup: stopping animation and clearing timeouts');
      setIsAnimationRunning(false);
      setSimulationStable(true);
    };
  }, []);

  // Initialize node positions with better spacing and hierarchy (smooth updates)
  useEffect(() => {
    console.log('🔄 GraphViz useEffect triggered');
    console.log('🔄 Props: nodes.length=', nodes.length, 'edges.length=', edges.length);
    
    const activeData = currentGraphData;
    console.log('🔄 activeData: nodes=', activeData.nodes.length, 'edges=', activeData.edges.length);
    
    // If no nodes, clear simulation nodes to match
    if (activeData.nodes.length === 0) {
      console.log('🔄 No nodes, clearing simulationNodes');
      setSimulationNodes([]);
      return;
    }

    // Create a map of existing positions to preserve them
    const existingPositions = new Map<string, { x: number, y: number, vx: number, vy: number }>();
    if (simulationNodes && simulationNodes.length > 0) {
      simulationNodes.forEach(node => {
        existingPositions.set(node.id, { x: node.x || 0, y: node.y || 0, vx: node.vx || 0, vy: node.vy || 0 });
      });
    }

    // Find connected components for initial positioning
    const components = findConnectedComponents(activeData.nodes, activeData.edges);
    const allUpdatedNodes: GraphNode[] = [];
    
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
        // Use existing position if available, otherwise calculate new position
        const existing = existingPositions.get(node.id);
        
        let x, y, vx, vy;
        if (existing) {
          // Preserve existing position and velocity for smooth transitions
          x = existing.x;
          y = existing.y;
          vx = existing.vx;
          vy = existing.vy;
        } else {
          // Calculate new position only for new nodes
          x = baseX + (Math.random() - 0.5) * 200;
          y = baseY + (Math.random() - 0.5) * 150;
          
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
          
          vx = 0;
          vy = 0;
        }
        
        allUpdatedNodes.push({
          ...node,
          x,
          y,
          vx,
          vy
        });
      });
    });
    
    // Handle isolated nodes (not in any component)
    activeData.nodes.forEach((node, i) => {
      if (!allUpdatedNodes.find(n => n.id === node.id)) {
        const existing = existingPositions.get(node.id);
        
        if (existing) {
          // Preserve existing position
          allUpdatedNodes.push({
            ...node,
            x: existing.x,
            y: existing.y,
            vx: existing.vx,
            vy: existing.vy
          });
        } else {
          // New isolated node gets random position
          allUpdatedNodes.push({
            ...node,
            x: Math.random() * (width - 100) + 50,
            y: Math.random() * (heightNum - 100) + 50,
            vx: 0,
            vy: 0
          });
        }
      }
    });
    
    batchedUpdateNodes(() => allUpdatedNodes);
  }, [nodes, edges, width, heightNum, findConnectedComponents, batchedUpdateNodes]);

  // Toggle side panel visibility


  // Check if simulation is stable (nodes have low velocity)
  const checkSimulationStability = useCallback(() => {
    if (simulationNodes.length === 0) return true;
    
    const velocityThreshold = 0.5;
    const totalVelocity = simulationNodes.reduce((sum, node) => {
      const vx = node.vx || 0;
      const vy = node.vy || 0;
      return sum + Math.sqrt(vx * vx + vy * vy);
    }, 0);
    
    const avgVelocity = totalVelocity / simulationNodes.length;
    return avgVelocity < velocityThreshold;
  }, [simulationNodes]);

  // 30fps animation loop with intelligent stopping
  useEffect(() => {
    let timeoutId: number;
    
    const animate = (currentTime: number) => {
      // Throttle to 30fps
      if (currentTime - lastFrameTime.current >= frameInterval) {
        lastFrameTime.current = currentTime;
        
        // Performance monitoring
        const frameStart = performance.now();
        
        // Check if simulation should stop
        const stable = checkSimulationStability();
        if (stable && !simulationStable) {
          console.log('🎯 Simulation stabilized - stopping animation');
          console.log('📊 Performance metrics:', {
            avgFps: Math.round(performanceMetrics.current.currentFps),
            totalFrames: performanceMetrics.current.frameCount,
            avgSimulationTime: Math.round(performanceMetrics.current.simulationTime / Math.max(1, performanceMetrics.current.frameCount)),
            nodeCount: simulationNodes.length,
            performanceMode: performanceConfig.useSimpleRendering
          });
          setSimulationStable(true);
          setIsAnimationRunning(false);
          return;
        }
        
        if (!stable && simulationStable) {
          setSimulationStable(false);
        }
        
        const simulationStart = performance.now();
        runSimulation();
        const simulationEnd = performance.now();
        
        // Update performance metrics
        const frameEnd = performance.now();
        const frameTime = frameEnd - frameStart;
        const simTime = simulationEnd - simulationStart;
        
        performanceMetrics.current.frameCount++;
        performanceMetrics.current.totalFrameTime += frameTime;
        performanceMetrics.current.simulationTime += simTime;
        
        // Calculate FPS every second
        const now = Date.now();
        if (now - performanceMetrics.current.lastSecond >= 1000) {
          performanceMetrics.current.currentFps = performanceMetrics.current.frameCount;
          performanceMetrics.current.frameCount = 0;
          performanceMetrics.current.lastSecond = now;
          
          // Log performance warnings
          if (performanceMetrics.current.currentFps < 20) {
            console.warn(`⚠️ Low FPS detected: ${performanceMetrics.current.currentFps} (${simulationNodes.length} nodes)`);
          }
          if (simTime > 16) { // More than one frame time at 60fps
            console.warn(`⚠️ Slow simulation: ${Math.round(simTime)}ms per frame`);
          }
        }
      }
      
      // Continue animation if still running
      if (isAnimationRunning) {
        timeoutId = window.setTimeout(() => {
          animate(performance.now());
        }, frameInterval);
      }
    };

    if (simulationNodes.length > 0 && !simulationStable) {
      if (!isAnimationRunning) {
        console.log('🏃 Starting animation loop at 30fps');
        setIsAnimationRunning(true);
        lastFrameTime.current = performance.now();
        animate(performance.now());
      }
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      // Ensure animation is stopped on cleanup
      setIsAnimationRunning(false);
    };
  }, [runSimulation, simulationNodes.length, checkSimulationStability, simulationStable, isAnimationRunning]);


  // Handle node interactions
  const handleNodeClick = (node: GraphNode, event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    
    setFocusedNodeId(node.id);
    
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
    }
  };


  // Get direct connections for a node
  const getDirectConnections = useCallback((nodeId: string): Set<string> => {
    const connections = new Set<string>();
    edges.forEach(edge => {
      if (edge.from === nodeId) {
        connections.add(edge.to);
      }
      if (edge.to === nodeId) {
        connections.add(edge.from);
      }
    });
    return connections;
  }, [edges]);

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
      
      batchedUpdateNodes(prev => prev.map(n => 
        n.id === node.id 
          ? { ...n, x, y, fx: x, fy: y, vx: 0, vy: 0 }
          : n
      ));
    };

    const handleMouseUp = () => {
      setDraggedNode(null);
      batchedUpdateNodes(prev => prev.map(n => 
        n.id === node.id 
          ? { ...n, fx: undefined, fy: undefined }
          : n
      ));
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      console.log('🧹 Mouse event listeners removed');
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };


  return (
    <div ref={containerRef} className="graph-viz-container">

      {/* Main Content Area - Two Panel Layout */}
      <div className="graph-main-content two-panel-layout">

        {/* Graph Canvas - Center Panel */}
        <div 
          className={`graph-canvas-container center-panel full-width`}
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
                <strong>{nodes.length}</strong> nodes
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
              {performanceConfig.useSimpleRendering && (
                <div className="graph-stat performance-mode" style={{color: '#e67e22'}}>
                  <strong>⚡</strong> Performance Mode
                </div>
              )}
              {isAnimationRunning && performanceMetrics.current.currentFps > 0 && (
                <div className="graph-stat fps-counter" style={{color: performanceMetrics.current.currentFps < 20 ? '#e74c3c' : '#27ae60'}}>
                  <strong>{Math.round(performanceMetrics.current.currentFps)}</strong> fps
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
            
            {/* Conditional filters based on performance config */}
            {!performanceConfig.disableShadows && (
              <>
                {/* Node shadow filter */}
                <filter id="nodeShadow" x="-50%" y="-50%" width="200%" height="200%">
                  <feDropShadow dx="2" dy="2" stdDeviation="3" floodOpacity="0.3"/>
                </filter>
                
                {/* Connection shadow filter */}
                <filter id="connectionShadow" x="-50%" y="-50%" width="200%" height="200%">
                  <feDropShadow dx="1" dy="1" stdDeviation="2" floodOpacity="0.2"/>
                </filter>
              </>
            )}
            
            {/* Connection gradients */}
            <linearGradient id="connectionGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#3498db" stopOpacity="0.8"/>
              <stop offset="50%" stopColor="#2c3e50" stopOpacity="0.7"/>
              <stop offset="100%" stopColor="#3498db" stopOpacity="0.8"/>
            </linearGradient>
            
            <linearGradient id="focusedConnectionGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#e74c3c" stopOpacity="0.9"/>
              <stop offset="50%" stopColor="#c0392b" stopOpacity="0.8"/>
              <stop offset="100%" stopColor="#e74c3c" stopOpacity="0.9"/>
            </linearGradient>
            
            {/* Professional arrow markers - consistent sizes */}
            <marker id="arrowhead" markerWidth="8" markerHeight="7" refX="7" refY="3.5" orient="auto" markerUnits="userSpaceOnUse">
              <path d="M0,0 L0,7 L8,3.5 z" fill="url(#connectionGradient)" stroke="#2c3e50" strokeWidth="0.3"/>
            </marker>
            
            <marker id="focusedArrowhead" markerWidth="8" markerHeight="7" refX="7" refY="3.5" orient="auto" markerUnits="userSpaceOnUse">
              <path d="M0,0 L0,7 L8,3.5 z" fill="url(#focusedConnectionGradient)" stroke="#c0392b" strokeWidth="0.3"/>
            </marker>
            
            <marker id="fadedArrowhead" markerWidth="8" markerHeight="7" refX="7" refY="3.5" orient="auto" markerUnits="userSpaceOnUse">
              <path d="M0,0 L0,7 L8,3.5 z" fill="#bdc3c7" stroke="#95a5a6" strokeWidth="0.3"/>
            </marker>
            
            {/* Conditional gradients for each node type */}
            {!performanceConfig.disableGradients && (
              <>
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
              </>
            )}
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
{/* Edge rendering with fallback positioning */}
            {edges.map((edge, edgeIndex) => {
              const source = simulationNodes.find(n => n.id === edge.from);
              const target = simulationNodes.find(n => n.id === edge.to);
              
              // Skip edges that can't find positioned nodes
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

              // Determine connection styling based on focus state
              const isFaded = shouldFadeEdge(edge);
              const isFocused = focusedNodeId && (edge.from === focusedNodeId || edge.to === focusedNodeId);
              
              // Professional connection styling
              const getConnectionStyle = () => {
                if (isFaded) {
                  return {
                    stroke: '#bdc3c7',
                    strokeWidth: '1.5',
                    opacity: '0.15',
                    markerEnd: 'url(#fadedArrowhead)'
                  };
                } else if (isFocused) {
                  return {
                    stroke: 'url(#focusedConnectionGradient)',
                    strokeWidth: '3',
                    opacity: '0.9',
                    markerEnd: 'url(#focusedArrowhead)'
                  };
                } else {
                  return {
                    stroke: 'url(#connectionGradient)',
                    strokeWidth: '2.5',
                    opacity: '0.7',
                    markerEnd: 'url(#arrowhead)'
                  };
                }
              };
              
              const connectionStyle = getConnectionStyle();

              return (
                <g key={edge.id}>
                  {/* Connection shadow (subtle depth) */}
                  <line
                    x1={sourceX + 1}
                    y1={sourceY + 1}
                    x2={targetX + 1}
                    y2={targetY + 1}
                    stroke="rgba(0,0,0,0.1)"
                    strokeWidth={connectionStyle.strokeWidth}
                    opacity={connectionStyle.opacity}
                    style={{
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                  />
                  
                  {/* Main connection line */}
                  <line
                    x1={sourceX}
                    y1={sourceY}
                    x2={targetX}
                    y2={targetY}
                    stroke={connectionStyle.stroke}
                    strokeWidth={connectionStyle.strokeWidth}
                    opacity={connectionStyle.opacity}
                    markerEnd={connectionStyle.markerEnd}
                    strokeLinecap="round"
                    filter={isFocused && !performanceConfig.disableShadows ? "url(#connectionShadow)" : "none"}
                    style={{
                      transition: performanceConfig.disableAnimations ? 'none' : 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      cursor: 'pointer'
                    }}
                  />
                  
                  {/* Interactive hover area (invisible but clickable) */}
                  <line
                    x1={sourceX}
                    y1={sourceY}
                    x2={targetX}
                    y2={targetY}
                    stroke="transparent"
                    strokeWidth="8"
                    style={{
                      cursor: 'pointer'
                    }}
                    onMouseEnter={(e) => {
                      const mainLine = e.currentTarget.previousSibling as SVGLineElement;
                      if (mainLine && !isFaded) {
                        mainLine.style.strokeWidth = isFocused ? '3.5' : '3';
                        mainLine.style.opacity = isFocused ? '1' : '0.8';
                      }
                    }}
                    onMouseLeave={(e) => {
                      const mainLine = e.currentTarget.previousSibling as SVGLineElement;
                      if (mainLine && !isFaded) {
                        mainLine.style.strokeWidth = connectionStyle.strokeWidth;
                        mainLine.style.opacity = connectionStyle.opacity;
                      }
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
              const gradient = performanceConfig.disableGradients ? getNodeColor(node.group) : getNodeGradient(node.group);
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
                    stroke={isFocused ? '#e74c3c' : '#ffffff'}
                    strokeWidth={isFocused ? 5 : 3}
                    opacity={shouldFade ? 0.25 : (isDragged ? 0.8 : 1)}
                    filter={performanceConfig.disableShadows ? "none" : "url(#nodeShadow)"}
                    style={{ 
                      cursor: 'pointer',
                      transition: performanceConfig.disableAnimations ? 'none' : 'opacity 0.3s ease-in-out, stroke 0.3s ease-in-out, stroke-width 0.3s ease-in-out'
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

      </div>


      
    </div>
  );
};

// Memoize the entire component to prevent unnecessary re-renders
const GraphVizMemoized = memo(GraphViz, (prevProps, nextProps) => {
  // Custom comparison for better performance
  return (
    prevProps.nodes.length === nextProps.nodes.length &&
    prevProps.edges.length === nextProps.edges.length &&
    prevProps.nodeType === nextProps.nodeType &&
    prevProps.height === nextProps.height &&
    prevProps.focusedNode === nextProps.focusedNode &&
    prevProps.graphVersion === nextProps.graphVersion &&
    // Deep compare first few nodes for changes
    JSON.stringify(prevProps.nodes.slice(0, 5)) === JSON.stringify(nextProps.nodes.slice(0, 5)) &&
    JSON.stringify(prevProps.edges.slice(0, 10)) === JSON.stringify(nextProps.edges.slice(0, 10))
  );
});

GraphVizMemoized.displayName = 'GraphViz';

export default GraphVizMemoized;