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
  hasData?: boolean;
  // Version management props
  availableVersions?: string[];
  onVersionChange?: (version: string) => void;
  onManageVersions?: () => void;
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
  onGraphDataUpdate,
  hasData = true,
  availableVersions = [],
  onVersionChange,
  onManageVersions
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [simulationNodes, setSimulationNodes] = useState<GraphNode[]>([]);
  const [componentCount, setComponentCount] = useState<number>(1);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  // Legacy transform state removed - now using panOffset and manualZoom consistently
  const [manualZoom, setManualZoom] = useState<number>(1); // User-controlled zoom
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 }); // User-controlled pan
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
  const canvasContainerRef = useRef<HTMLDivElement>(null);

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

  // State to force canvas size recalculation
  const [resizeCounter, setResizeCounter] = useState(0);

  // Listen for container resize to make graph responsive
  useEffect(() => {
    const handleResize = (entries: ResizeObserverEntry[]) => {
      console.log('🔄 Container resize detected:', entries[0]?.contentRect);
      // Force recalculation of canvas size by updating counter
      setResizeCounter(prev => prev + 1);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    if (canvasContainerRef.current) {
      resizeObserver.observe(canvasContainerRef.current);
      console.log('👁️ Observing canvas container resize:', canvasContainerRef.current.clientWidth, 'x', canvasContainerRef.current.clientHeight);
    }

    return () => {
      resizeObserver.disconnect();
      console.log('🧹 ResizeObserver disconnected');
    };
  }, []);

  // Additional window resize listener as fallback
  useEffect(() => {
    const handleWindowResize = () => {
      console.log('🪟 Window resize detected');
      setResizeCounter(prev => prev + 1);
    };

    window.addEventListener('resize', handleWindowResize);
    return () => {
      window.removeEventListener('resize', handleWindowResize);
    };
  }, []);

  // Memoize expensive calculations - removed window size dependencies for stable node sizing
  const memoizedCanvasSize = useMemo(() => {
    console.log('🔄 Recalculating canvas size');
    
    // Use fixed base dimensions to prevent node size changes on window resize
    const baseWidth = 1200;
    const baseHeight = parseInt(height) || 700;
    
    // Auto-zoom calculation: zoom out when there are many nodes
    const nodeCount = currentGraphData.nodes.length;
    
    // Estimate component count based on node count and edge density for initial sizing
    const estimatedComponentCount = Math.max(1, Math.min(nodeCount / 5, currentGraphData.edges.length === 0 ? nodeCount : Math.ceil(nodeCount / 10)));
    
    // Scale factor based on complexity (more nodes = zoom out more)
    const nodeScaleFactor = Math.max(1, Math.sqrt(nodeCount / 20)); // Starts scaling after 20 nodes
    const componentScaleFactor = Math.max(1, estimatedComponentCount / 3); // Starts scaling after 3 components
    const combinedScaleFactor = Math.max(nodeScaleFactor, componentScaleFactor);
    
    // Scale dimensions based on content complexity only, not container size
    const scaledWidth = Math.max(baseWidth, baseWidth * combinedScaleFactor);
    const scaledHeight = Math.max(baseHeight, baseHeight * Math.max(1, combinedScaleFactor * 0.8));
    
    console.log('📏 Fixed canvas dimensions:', scaledWidth, 'x', scaledHeight, 'scale:', combinedScaleFactor);
    
    return { width: scaledWidth, heightNum: scaledHeight, combinedScaleFactor };
  }, [nodes.length, edges.length, height]);

  // Calculate adaptive canvas size based on available space and content
  const getCanvasSize = useCallback(() => {
    return memoizedCanvasSize;
  }, [memoizedCanvasSize]);

  const { width, heightNum, combinedScaleFactor } = getCanvasSize();

  // Calculate actual bounds of all positioned nodes
  const calculateNodeBounds = useCallback(() => {
    if (simulationNodes.length === 0) {
      return { minX: 0, maxX: width, minY: 0, maxY: heightNum };
    }

    const padding = 100; // Padding around node bounds
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    
    simulationNodes.forEach(node => {
      if (node.x !== undefined && node.y !== undefined) {
        const radius = getNodeRadius(node.group);
        minX = Math.min(minX, node.x - radius);
        maxX = Math.max(maxX, node.x + radius);
        minY = Math.min(minY, node.y - radius);
        maxY = Math.max(maxY, node.y + radius);
      }
    });

    // If no positioned nodes found, return default bounds
    if (minX === Infinity) {
      return { minX: 0, maxX: width, minY: 0, maxY: heightNum };
    }

    // Add padding and ensure minimum size
    const boundsWidth = Math.max(400, maxX - minX + 2 * padding);
    const boundsHeight = Math.max(300, maxY - minY + 2 * padding);
    
    return {
      minX: minX - padding,
      maxX: minX + boundsWidth,
      minY: minY - padding, 
      maxY: minY + boundsHeight
    };
  }, [simulationNodes, width, heightNum]);

  // Get dynamic viewBox that encompasses all nodes
  const getViewBox = useCallback(() => {
    const bounds = calculateNodeBounds();
    return `${bounds.minX} ${bounds.minY} ${bounds.maxX - bounds.minX} ${bounds.maxY - bounds.minY}`;
  }, [calculateNodeBounds]);

  // Calculate center point for zoom operations
  const getZoomCenter = useCallback(() => {
    // Use viewport center for consistent zoom behavior
    return {
      x: width / 2,
      y: heightNum / 2
    };
  }, [width, heightNum]);

  // Generate center-based transform string for zoom and pan
  const getCenterBasedTransform = useCallback(() => {
    const center = getZoomCenter();
    
    // Apply transformations: translate to center + pan, scale, translate back from center
    // Formula: translate(cx + panX, cy + panY) scale(zoom) translate(-cx, -cy)
    const transform = `translate(${center.x + panOffset.x}, ${center.y + panOffset.y}) scale(${manualZoom}) translate(${-center.x}, ${-center.y})`;
    
    // Debug logging for transform changes and node positions
    if (manualZoom !== 1 || panOffset.x !== 0 || panOffset.y !== 0) {
      console.log(`[GraphViz] Transform: center=(${center.x},${center.y}), pan=(${panOffset.x},${panOffset.y}), zoom=${manualZoom.toFixed(2)}`);
      
      // Log a few node positions for debugging clustering
      if (simulationNodes.length > 0) {
        const sampleNodes = simulationNodes.slice(0, 3).map(n => ({
          id: n.id,
          position: `(${n.x?.toFixed(1)}, ${n.y?.toFixed(1)})`,
          label: n.label
        }));
        console.log(`[GraphViz] Sample node positions:`, sampleNodes);
      }
    }
    
    return transform;
  }, [getZoomCenter, panOffset.x, panOffset.y, manualZoom]);

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

  // Get icon for node type - using factory emoji for Industry nodes
  const getNodeIcon = (group: string): string => {
    const icons: { [key: string]: string } = {
      'Industry': '🏭',        // Factory emoji for Industry nodes
      'Sector': '🏢',          // Office building for sectors
      'Department': '🏛️',      // Classical building for departments
      'PainPoint': '⚠️',       // Warning sign for pain points
      'ProjectOpportunity': '💡', // Light bulb for opportunities
      'ProjectBlueprint': '📋', // Clipboard for blueprints
      'Role': '👤',            // Person for roles
      'Module': '🧩',          // Puzzle piece for modules
      'SubModule': '🔧'        // Wrench for submodules
    };
    return icons[group] || '🔵'; // Default blue circle
  };

  // Get node radius based on type and zoom level for better visual balance
  const getNodeRadius = useCallback((group: string): number => {
    const baseRadii: { [key: string]: number } = {
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
    
    const baseRadius = baseRadii[group] || 20;
    
    // Scale inversely with zoom - as user zooms in, nodes get relatively smaller to maintain visual balance
    // This prevents nodes from becoming too dominant at high zoom levels
    const zoomAdjustment = Math.max(0.7, Math.min(1.3, 1 / Math.sqrt(manualZoom)));
    
    return Math.round(baseRadius * zoomAdjustment);
  }, [manualZoom]);

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

  // Build hierarchy structure from nodes and edges
  const buildHierarchy = useCallback((nodes: GraphNode[], edges: any[]) => {
    console.log(`[GraphViz] buildHierarchy DEBUG: Processing ${nodes.length} nodes, ${edges.length} edges`);
    console.log(`[GraphViz] Node sample:`, nodes.slice(0, 3).map(n => ({ id: n.id, label: n.label, group: n.group })));
    console.log(`[GraphViz] Edge sample:`, edges.slice(0, 3).map(e => ({ source: e.source, target: e.target, type: e.type })));
    
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const childrenMap = new Map<string, string[]>(); // parent -> children
    const parentMap = new Map<string, string>(); // child -> parent
    
    // Build parent-child relationships from edges
    edges.forEach((edge, index) => {
      const sourceId = edge.source?.toString() || edge.source;
      const targetId = edge.target?.toString() || edge.target;
      
      if (nodeMap.has(sourceId) && nodeMap.has(targetId)) {
        // Add child to parent's children list
        if (!childrenMap.has(sourceId)) {
          childrenMap.set(sourceId, []);
        }
        childrenMap.get(sourceId)!.push(targetId);
        
        // Set parent for child
        parentMap.set(targetId, sourceId);
        
        if (index < 5) { // Log first 5 relationships for debugging
          console.log(`[GraphViz] Relationship ${index}: ${sourceId} -> ${targetId}`);
        }
      } else {
        if (index < 5) {
          console.log(`[GraphViz] Skipped edge ${index}: source ${sourceId} in map: ${nodeMap.has(sourceId)}, target ${targetId} in map: ${nodeMap.has(targetId)}`);
        }
      }
    });
    
    console.log(`[GraphViz] Built ${parentMap.size} parent-child relationships`);
    console.log(`[GraphViz] Children map size: ${childrenMap.size}`);
    
    // Find root nodes (nodes with no parents in this component)
    const rootNodes = nodes.filter(node => !parentMap.has(node.id));
    console.log(`[GraphViz] Found ${rootNodes.length} root nodes:`, rootNodes.map(n => `${n.label}(${n.group})`));
    
    // If no root nodes found, use node type hierarchy as fallback
    if (rootNodes.length === 0) {
      console.log(`[GraphViz] No root nodes found, using type-based hierarchy`);
      const industryNodes = nodes.filter(n => n.group === 'Industry');
      if (industryNodes.length > 0) {
        console.log(`[GraphViz] Using ${industryNodes.length} Industry nodes as roots`);
        rootNodes.push(...industryNodes);
      } else {
        // Fallback: use all nodes as a single layer
        console.log(`[GraphViz] No Industry nodes, treating all as root level`);
        return {
          layers: [nodes],
          childrenMap,
          parentMap,
          rootNodes: nodes
        };
      }
    }
    
    // Build layers using BFS from root nodes
    const layers: GraphNode[][] = [];
    const visited = new Set<string>();
    const queue: { node: GraphNode; level: number }[] = [];
    
    // Start with root nodes at level 0
    rootNodes.forEach(root => {
      queue.push({ node: root, level: 0 });
    });
    
    while (queue.length > 0) {
      const { node, level } = queue.shift()!;
      
      if (visited.has(node.id)) continue;
      visited.add(node.id);
      
      // Ensure layers array is long enough
      while (layers.length <= level) {
        layers.push([]);
      }
      
      layers[level].push(node);
      
      // Add children to next level
      const children = childrenMap.get(node.id) || [];
      children.forEach(childId => {
        const childNode = nodeMap.get(childId);
        if (childNode && !visited.has(childId)) {
          queue.push({ node: childNode, level: level + 1 });
        }
      });
    }
    
    // Add any remaining nodes (disconnected) to appropriate layers based on type
    const unvisited = nodes.filter(node => !visited.has(node.id));
    if (unvisited.length > 0) {
      console.log(`[GraphViz] Processing ${unvisited.length} unvisited nodes by type`);
      
      // Organize unvisited nodes by semantic hierarchy
      const typeHierarchy = {
        'Industry': 0,
        'Sector': 1,
        'Department': 1,
        'PainPoint': 2,
        'ProjectOpportunity': 3,
        'ProjectBlueprint': 4,
        'Role': 5,
        'Module': 5,
        'SubModule': 6
      };
      
      unvisited.forEach(node => {
        const targetLevel = typeHierarchy[node.group as keyof typeof typeHierarchy] ?? layers.length;
        
        // Ensure layers array is long enough
        while (layers.length <= targetLevel) {
          layers.push([]);
        }
        
        layers[targetLevel].push(node);
        console.log(`[GraphViz] Added ${node.label}(${node.group}) to layer ${targetLevel}`);
      });
    }
    
    // If still only one layer, force type-based organization
    if (layers.length <= 1 && nodes.length > 1) {
      console.log(`[GraphViz] Forcing type-based hierarchy organization`);
      const typeBasedLayers: GraphNode[][] = [];
      
      const typeOrder = ['Industry', 'Sector', 'Department', 'PainPoint', 'ProjectOpportunity', 'ProjectBlueprint', 'Role', 'Module', 'SubModule'];
      
      typeOrder.forEach(nodeType => {
        const nodesOfType = nodes.filter(n => n.group === nodeType);
        if (nodesOfType.length > 0) {
          typeBasedLayers.push(nodesOfType);
          console.log(`[GraphViz] Type-based layer ${typeBasedLayers.length - 1}: ${nodesOfType.length} ${nodeType} nodes`);
        }
      });
      
      // Add any remaining node types not in the standard hierarchy
      const handledTypes = new Set(typeOrder);
      const remainingNodes = nodes.filter(n => !handledTypes.has(n.group));
      if (remainingNodes.length > 0) {
        typeBasedLayers.push(remainingNodes);
        console.log(`[GraphViz] Type-based layer ${typeBasedLayers.length - 1}: ${remainingNodes.length} other nodes`);
      }
      
      return {
        layers: typeBasedLayers,
        childrenMap,
        parentMap,
        rootNodes: typeBasedLayers[0] || []
      };
    }
    
    console.log(`[GraphViz] Final hierarchy: ${layers.length} layers, ${layers.map((l, i) => `L${i}:${l.length}`).join(', ')}`);
    
    return {
      layers,
      childrenMap,
      parentMap,
      rootNodes
    };
  }, []);

  // Position nodes in hierarchical tree structure
  const positionHierarchicalTree = useCallback((
    hierarchy: any,
    nodeSpacing: number,
    layerHeight: number,
    canvasWidth: number,
    startY: number
  ) => {
    const positionedNodes: GraphNode[] = [];
    
    hierarchy.layers.forEach((layer: GraphNode[], layerIndex: number) => {
      const layerY = startY + (layerIndex * layerHeight);
      
      // Calculate total width needed for this layer
      const totalLayerWidth = (layer.length - 1) * nodeSpacing;
      const layerStartX = Math.max(nodeSpacing, (canvasWidth - totalLayerWidth) / 2);
      
      layer.forEach((node, nodeIndex) => {
        const nodeX = layerStartX + (nodeIndex * nodeSpacing);
        
        const positionedNode = {
          ...node,
          x: nodeX,
          y: layerY,
          fx: nodeX, // Fix position to prevent physics movement
          fy: layerY,
          vx: 0,
          vy: 0
        };
        
        positionedNodes.push(positionedNode);
      });
      
      console.log(`[GraphViz] Layer ${layerIndex}: ${layer.length} nodes at Y=${layerY}, spanning X=${layerStartX} to ${layerStartX + totalLayerWidth}`);
    });
    
    return positionedNodes;
  }, []);

  // Hierarchical tree layout calculation with parent-child alignment
  const calculateStaticLayout = useCallback((nodes: GraphNode[], edges: any[]) => {
    console.log(`[GraphViz] Calculating hierarchical tree layout for ${nodes.length} nodes`);
    
    // Find connected components for organized layout
    const components = findConnectedComponents(nodes, edges);
    const allPositionedNodes: GraphNode[] = [];
    
    // Calculate safe spacing to prevent any overlaps
    const maxRadius = Math.max(...nodes.map(n => getNodeRadius(n.group)));
    const safeNodeSpacing = (maxRadius * 2) + 120; // Extra space for labels
    const layerHeight = 150; // Vertical spacing between hierarchy levels
    const componentPadding = 200; // Space between separate components
    
    console.log(`[GraphViz] Hierarchical layout: ${components.length} components, ${safeNodeSpacing}px node spacing, ${layerHeight}px layer height`);
    
    let currentComponentY = componentPadding;
    
    components.forEach((component, componentIndex) => {
      console.log(`[GraphViz] Processing component ${componentIndex}: ${component.length} nodes`);
      
      // Build hierarchy for this component
      const hierarchy = buildHierarchy(component, edges);
      console.log(`[GraphViz] Hierarchy levels:`, hierarchy.layers.map((layer, i) => `L${i}:${layer.length}`).join(', '));
      
      // Calculate positions for each layer
      const componentNodes = positionHierarchicalTree(hierarchy, safeNodeSpacing, layerHeight, width, currentComponentY);
      
      allPositionedNodes.push(...componentNodes);
      
      // Move to next component position (add height of current component)
      const componentHeight = hierarchy.layers.length * layerHeight;
      currentComponentY += componentHeight + componentPadding;
    });
    
    console.log(`[GraphViz] Hierarchical layout complete: ${allPositionedNodes.length} positioned nodes`);
    return allPositionedNodes;
  }, [findConnectedComponents, getNodeRadius, width, buildHierarchy, positionHierarchicalTree]);

  // Advanced force simulation with subgraph separation and hierarchy  
  const runSimulation = useCallback(() => {
    if (simulationNodes.length === 0) return;

    const activeGraphData = currentGraphData;
    
    // Enhanced force parameters to prevent clustering with center-based transform
    const repelForce = performanceConfig.simplifyForces ? 12000 : 15000; // Much stronger repulsion to prevent clustering
    const linkForce = performanceConfig.simplifyForces ? 0.02 : 0.03;
    const linkDistance = performanceConfig.simplifyForces ? 250 : 350; // Increased distance to ensure separation
    const hierarchyForce = performanceConfig.simplifyForces ? 0.005 : 0.008;
    const minNodeDistance = 120; // Increased minimum distance between node centers
    
    console.log(`[GraphViz] Force params: repel=${repelForce}, linkDist=${linkDistance}, minDist=${minNodeDistance}`);

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
          
          if (distance > 0) {
            // Calculate minimum distance based on node sizes to prevent overlap
            const radiusA = getNodeRadius(nodeA.group);
            const radiusB = getNodeRadius(nodeB.group);
            const minDistance = Math.max(minNodeDistance, radiusA + radiusB + 80); // Further increased padding for label space
            
            if (distance < Math.max(searchRadius, minDistance)) {
              const force = repelForce / (distance * distance);
              const forceX = (dx / distance) * force * 0.5;
              const forceY = (dy / distance) * force * 0.5;
              
              nodeA.vx = (nodeA.vx || 0) - forceX;
              nodeA.vy = (nodeA.vy || 0) - forceY;
            }
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
          
          if (distance > 0) {
            // Calculate minimum distance based on node sizes to prevent overlap
            const radiusA = getNodeRadius(nodeA.group);
            const radiusB = getNodeRadius(nodeB.group);
            const minDistance = Math.max(minNodeDistance, radiusA + radiusB + 80); // Further increased padding for label space
            
            if (distance < Math.max(300, minDistance)) {
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

  // Update component count when nodes/edges change
  useEffect(() => {
    const components = findConnectedComponents(nodes, edges);
    const numComponents = components.length;
    if (numComponents !== componentCount) {
      setComponentCount(numComponents);
    }
  }, [nodes, edges, findConnectedComponents, componentCount]);

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
    console.log('🔄 GraphViz useEffect triggered - STATIC LAYOUT MODE');
    console.log('🔄 Props: nodes.length=', nodes.length, 'edges.length=', edges.length);
    
    const activeData = currentGraphData;
    console.log('🔄 activeData: nodes=', activeData.nodes.length, 'edges=', activeData.edges.length);
    
    // If no nodes, clear simulation nodes to match
    if (activeData.nodes.length === 0) {
      console.log('🔄 No nodes, clearing simulationNodes');
      setSimulationNodes([]);
      return;
    }

    // Use static layout calculation to guarantee non-overlapping nodes
    console.log('🔄 Calculating static layout for', activeData.nodes.length, 'nodes');
    const staticLayoutNodes = calculateStaticLayout(activeData.nodes, activeData.edges);
    
    console.log('🔄 Static layout complete:', staticLayoutNodes.length, 'positioned nodes');
    batchedUpdateNodes(() => staticLayoutNodes);
  }, [nodes, edges, width, heightNum, calculateStaticLayout, batchedUpdateNodes]);

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

  // STATIC LAYOUT MODE - No animation needed since nodes are pre-positioned
  useEffect(() => {
    // In static layout mode, nodes are positioned once and don't need physics simulation
    if (simulationNodes.length > 0) {
      console.log('📍 Static layout active - nodes positioned, simulation stable');
      setSimulationStable(true);
      setIsAnimationRunning(false);
    }
  }, [simulationNodes.length]);


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
    
    console.log('[GraphViz] Node double-clicked:', {
      nodeId: node.id,
      nodeLabel: node.label,
      nodeGroup: node.group,
      clickCoordinates: { x: event.clientX, y: event.clientY },
      nodeData: node
    });
    
    if (onNodeDoubleClick) {
      onNodeDoubleClick(node.id, node);
    }
  };

  // Manual zoom controls
  const handleZoomIn = useCallback(() => {
    const newZoom = Math.min(manualZoom * 1.2, 5);
    console.log(`[GraphViz] Zoom in: ${manualZoom.toFixed(2)} → ${newZoom.toFixed(2)}`);
    setManualZoom(newZoom);
  }, [manualZoom]);

  const handleZoomOut = useCallback(() => {
    const newZoom = Math.max(manualZoom / 1.2, 0.2);
    console.log(`[GraphViz] Zoom out: ${manualZoom.toFixed(2)} → ${newZoom.toFixed(2)}`);
    setManualZoom(newZoom);
  }, [manualZoom]);

  const handleResetView = useCallback(() => {
    console.log('[GraphViz] Reset view: zoom=1, pan=(0,0)');
    setManualZoom(1);
    setPanOffset({ x: 0, y: 0 });
  }, []);

  // Pan controls
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const initialPanOffset = useRef({ x: 0, y: 0 });

  const handlePanStart = useCallback((e: React.MouseEvent) => {
    const target = e.target as any;
    
    // Check if this is a node-related element that should NOT trigger panning
    const isNodeElement = (
      target.tagName === 'circle' || // Node circles
      (target.tagName === 'text' && target.closest('g')?.querySelector('circle')) || // Text inside node groups
      (target.tagName === 'g' && target.querySelector('circle')) // Group containers with node circles
    );
    
    // Allow panning from specific background and edge elements only
    const isBackgroundElement = (
      e.target === e.currentTarget || // SVG itself
      (target.tagName === 'rect' && target.getAttribute?.('fill') === 'transparent') || // Background rects
      (target.tagName === 'rect' && target.getAttribute?.('fill')?.includes('url(#grid)')) || // Grid background
      target.classList?.contains?.('graph-background') || // Background class
      target.classList?.contains?.('graph-background-expanded') || // Expanded background
      target.tagName === 'line' || // Edge lines
      (target.tagName === 'g' && target.classList?.contains?.('edges')) || // Edge container groups
      target.tagName === 'path' // Grid pattern or other paths
    );
    
    // Only allow panning from background elements, not from node elements
    if (isBackgroundElement && !isNodeElement) {
      console.log('[GraphViz] Starting pan on element:', target.tagName, target.className);
      setIsPanning(true);
      // Store the initial mouse position and current pan offset separately to prevent jumping
      setPanStart({ 
        x: e.clientX, 
        y: e.clientY
      });
      initialPanOffset.current = { ...panOffset };
      e.preventDefault();
      e.stopPropagation();
    } else if (isNodeElement) {
      console.log('[GraphViz] Node element clicked - not starting pan:', target.tagName);
    }
  }, [panOffset]);

  const handlePanMove = useCallback((e: MouseEvent) => {
    if (isPanning) {
      // Calculate the raw mouse movement delta since pan started
      const rawDeltaX = e.clientX - panStart.x;
      const rawDeltaY = e.clientY - panStart.y;
      
      // Base sensitivity - make panning more responsive to mouse movements
      const baseSensitivity = 2.0; // 2x more sensitive than default
      
      // Additional sensitivity scaling at higher zoom levels for better navigation
      const zoomSensitivityBoost = Math.max(1, manualZoom * 0.3);
      
      // Add subtle acceleration for larger movements to make panning feel more fluid
      const distance = Math.sqrt(rawDeltaX * rawDeltaX + rawDeltaY * rawDeltaY);
      const accelerationFactor = 1 + Math.min(distance / 200, 0.5); // Up to 50% acceleration for large movements
      
      const totalSensitivity = baseSensitivity * zoomSensitivityBoost * accelerationFactor;
      
      // Apply sensitivity to the movement delta, then add to initial pan offset to prevent jumping
      setPanOffset({
        x: initialPanOffset.current.x + (rawDeltaX * totalSensitivity),
        y: initialPanOffset.current.y + (rawDeltaY * totalSensitivity)
      });
    }
  }, [isPanning, panStart, manualZoom]);

  const handlePanEnd = useCallback(() => {
    console.log('[GraphViz] Ending pan');
    setIsPanning(false);
  }, []);

  // Add pan event listeners
  useEffect(() => {
    if (isPanning) {
      document.addEventListener('mousemove', handlePanMove);
      document.addEventListener('mouseup', handlePanEnd);
      return () => {
        document.removeEventListener('mousemove', handlePanMove);
        document.removeEventListener('mouseup', handlePanEnd);
      };
    }
  }, [isPanning, handlePanMove, handlePanEnd]);

  // Track previous counts for comparison
  const prevNodeCount = useRef(nodes.length);
  const prevEdgeCount = useRef(edges.length);

  // Clean up pan state when graph data changes significantly
  useEffect(() => {
    // Only reset pan state for major graph changes, not for node focus updates
    const isMinorUpdate = (
      Math.abs(nodes.length - prevNodeCount.current) <= 5 && // Small changes in node count
      Math.abs(edges.length - prevEdgeCount.current) <= 10   // Small changes in edge count
    );
    
    if (isPanning && !isMinorUpdate) {
      console.log('[GraphViz] Major graph data change detected, ending panning');
      setIsPanning(false);
    }
    
    // Update refs for next comparison
    prevNodeCount.current = nodes.length;
    prevEdgeCount.current = edges.length;
  }, [nodes.length, edges.length, isPanning]);

  // Handle clicking on graph background to clear focus (but keep panel open)
  const handleGraphBackgroundClick = (event: React.MouseEvent) => {
    const target = event.target as any;
    
    // Only clear focus if clicking directly on the background and not panning
    const isBackgroundClick = (
      event.target === event.currentTarget || // SVG itself
      (target.tagName === 'rect' && target.getAttribute?.('fill') === 'transparent') || // Background rect
      target.classList?.contains?.('graph-background') // Background class
    );
    
    if (isBackgroundClick && !isPanning) {
      console.log('[GraphViz] Background click - clearing focus');
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



  // Show empty state if no data
  if (!hasData || nodes.length === 0) {
    return (
      <div 
        ref={canvasContainerRef}
        className="graph-viz-container"
      >
        <div className="graph-welcome-state">
          <div className="welcome-content">
            <div className="welcome-icon">📊</div>
            <h3>No Data Available</h3>
            <p>Click on a node type card to explore the graph, or try a different selection.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={canvasContainerRef}
      className="graph-viz-container"
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
            {/* Professional Graph Controls Overlay */}
            <div className="graph-controls-overlay" style={{
              position: 'absolute',
              top: '8px',
              left: '8px',
              right: '8px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              pointerEvents: 'none',
              zIndex: 10
            }}>
              {/* Left side: Stats */}
              <div className="graph-stats-section" style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                background: 'rgba(0, 0, 0, 0.85)',
                padding: '8px 12px',
                borderRadius: '6px',
                pointerEvents: 'auto',
                maxWidth: '200px'
              }}>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '11px', color: 'rgba(255,255,255,0.9)' }}>
                  <span><strong style={{color: '#3498db'}}>{nodes.length}</strong> nodes</span>
                  <span><strong style={{color: '#e74c3c'}}>{edges.length}</strong> edges</span>
                  <span><strong style={{color: '#f39c12'}}>{componentCount}</strong> groups</span>
                </div>
                {performanceConfig.useSimpleRendering && (
                  <div style={{ fontSize: '10px', color: '#e67e22' }}>
                    <strong>⚡</strong> Performance Mode
                  </div>
                )}
              </div>

              {/* Right side: Controls */}
              <div className="graph-controls-section" style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                alignItems: 'flex-end'
              }}>
                {/* Version Management Controls */}
                {(onVersionChange || onManageVersions) && (
                  <div className="version-controls" style={{
                    display: 'flex',
                    gap: '4px',
                    background: 'rgba(0, 0, 0, 0.85)',
                    padding: '6px',
                    borderRadius: '6px',
                    pointerEvents: 'auto'
                  }}>
                    {/* Version Selector */}
                    {onVersionChange && availableVersions.length > 1 && (
                      <select
                        value={graphVersion}
                        onChange={(e) => onVersionChange(e.target.value)}
                        title="Select Database Version"
                        style={{
                          background: 'rgba(255,255,255,0.1)',
                          border: '1px solid rgba(255,255,255,0.2)',
                          color: 'white',
                          borderRadius: '3px',
                          fontSize: '10px',
                          padding: '2px 4px',
                          minWidth: '80px',
                          cursor: 'pointer'
                        }}
                      >
                        {availableVersions.map(version => (
                          <option key={version} value={version} style={{ background: '#2c3e50', color: 'white' }}>
                            {version === 'base' ? '🔒 Base' : version}
                          </option>
                        ))}
                      </select>
                    )}
                    
                    {/* Manage Versions Button */}
                    {onManageVersions && (
                      <button
                        onClick={onManageVersions}
                        title="Manage All Database Versions"
                        style={{
                          width: '24px',
                          height: '24px',
                          border: '1px solid rgba(255,255,255,0.2)',
                          background: 'rgba(255,255,255,0.1)',
                          color: 'white',
                          borderRadius: '3px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          fontSize: '10px'
                        }}
                      >
                        🗂️
                      </button>
                    )}
                  </div>
                )}

                {/* Zoom Controls */}
                <div className="integrated-zoom-controls" style={{
                  display: 'flex',
                  gap: '4px',
                  background: 'rgba(0, 0, 0, 0.85)',
                  padding: '6px',
                  borderRadius: '6px',
                  pointerEvents: 'auto'
                }}>
                  <div style={{ 
                    fontSize: '11px', 
                    color: 'rgba(255,255,255,0.8)', 
                    padding: '4px 8px',
                    minWidth: '45px',
                    textAlign: 'center'
                  }}>
                    {Math.round(manualZoom * 100)}%
                  </div>
                  <button
                    onClick={handleZoomOut}
                    title="Zoom Out"
                    style={{
                      width: '24px',
                      height: '24px',
                      border: '1px solid rgba(255,255,255,0.2)',
                      background: 'rgba(255,255,255,0.1)',
                      color: 'white',
                      borderRadius: '3px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: 'bold'
                    }}
                  >
                    −
                  </button>
                  <button
                    onClick={handleZoomIn}
                    title="Zoom In"
                    style={{
                      width: '24px',
                      height: '24px',
                      border: '1px solid rgba(255,255,255,0.2)',
                      background: 'rgba(255,255,255,0.1)',
                      color: 'white',
                      borderRadius: '3px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: 'bold'
                    }}
                  >
                    +
                  </button>
                  <button
                    onClick={handleResetView}
                    title="Reset View"
                    style={{
                      width: '24px',
                      height: '24px',
                      border: '1px solid rgba(255,255,255,0.2)',
                      background: 'rgba(255,255,255,0.1)',
                      color: 'white',
                      borderRadius: '3px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      fontSize: '10px',
                      fontWeight: 'bold'
                    }}
                  >
                    ⌂
                  </button>
                </div>

              </div>
            </div>


            <svg
              ref={svgRef}
              width="100%"
              height="100%"
              viewBox={getViewBox()}
              preserveAspectRatio="xMidYMid meet"
              style={{ 
                cursor: isPanning ? 'grabbing' : 'grab',
                maxWidth: '100%',
                maxHeight: '100%',
                overflow: 'visible',
                display: 'block'
              }}
              onMouseDown={handlePanStart}
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
          
          {/* Ultimate background coverage - massive invisible rectangle behind everything */}
          <rect 
            x="-10000"
            y="-10000" 
            width="20000"
            height="20000"
            fill="transparent"
            onClick={handleGraphBackgroundClick}
            onMouseDown={handlePanStart}
            style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
          />
          
          <rect 
            width="100%" 
            height="100%" 
            fill="url(#grid)" 
            onClick={handleGraphBackgroundClick}
            onMouseDown={handlePanStart}
            style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
          />
          
          {/* Expanded background rectangle for panning - covers much larger area */}
          <rect
            className="graph-background-expanded"
            x={-width * 2}
            y={-heightNum * 2}
            width={width * 5}
            height={heightNum * 5}
            fill="transparent"
            style={{ 
              cursor: isPanning ? 'grabbing' : 'grab',
              transition: 'fill-opacity 0.2s ease'
            }}
            onMouseDown={handlePanStart}
            onClick={handleGraphBackgroundClick}
          />

          {/* Original background rectangle for panning */}
          <rect
            className="graph-background"
            x={0}
            y={0}
            width={width}
            height={heightNum}
            fill="transparent"
            style={{ 
              cursor: isPanning ? 'grabbing' : 'grab',
              transition: 'fill-opacity 0.2s ease'
            }}
            onMouseDown={handlePanStart}
            onMouseEnter={() => console.log('[GraphViz] Background hover - grab available')}
            onMouseLeave={() => console.log('[GraphViz] Background hover end')}
            onClick={handleGraphBackgroundClick}
          />

          {/* Main graph group with center-based zoom and pan transformations */}
          <g 
            transform={getCenterBasedTransform()}
            style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
            onMouseDown={handlePanStart}
          >
            
          {/* Edges */}
          <g 
            className="edges"
            style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
            onMouseDown={handlePanStart}
          >
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
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      cursor: isPanning ? 'grabbing' : 'grab'
                    }}
                    onMouseDown={handlePanStart}
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
                      cursor: isPanning ? 'grabbing' : 'grab'
                    }}
                    onMouseDown={handlePanStart}
                  />
                  
                  {/* Interactive hover area (invisible but clickable and pannable) */}
                  <line
                    x1={sourceX}
                    y1={sourceY}
                    x2={targetX}
                    y2={targetY}
                    stroke="transparent"
                    strokeWidth="8"
                    style={{
                      cursor: isPanning ? 'grabbing' : 'grab'
                    }}
                    onMouseDown={handlePanStart}
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
                    opacity={shouldFade ? 0.25 : 1}
                    filter={performanceConfig.disableShadows ? "none" : "url(#nodeShadow)"}
                    style={{ 
                      cursor: 'pointer',
                      transition: performanceConfig.disableAnimations ? 'none' : 'opacity 0.3s ease-in-out, stroke 0.3s ease-in-out, stroke-width 0.3s ease-in-out'
                    }}
                    onClick={(e) => handleNodeClick(node, e)}
                    onDoubleClick={(e) => handleNodeDoubleClick(node, e)}
                  />
                  
                  {/* Node label with dynamic spacing */}
                  <text
                    x={node.x}
                    y={node.y + radius + Math.max(20, 25 / Math.max(manualZoom, 0.5))} // Dynamic spacing based on zoom
                    textAnchor="middle"
                    fontSize={Math.max(10, 12 / Math.max(manualZoom, 0.7))} // Scale font size with zoom
                    fill="#2c3e50"
                    fontWeight={isFocused ? '700' : '500'}
                    opacity={shouldFade ? 0.3 : 1}
                    style={{ 
                      userSelect: 'none',
                      cursor: 'default',
                      transition: 'opacity 0.3s ease-in-out, font-weight 0.3s ease-in-out'
                    }}
                  >
                    {(() => {
                      // Adaptive label splitting based on zoom level
                      const maxCharsPerLine = Math.max(10, Math.floor(15 * Math.max(manualZoom, 0.8)));
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
                      userSelect: 'none',
                      cursor: 'default',
                      transition: 'opacity 0.3s ease-in-out, font-size 0.3s ease-in-out'
                    }}
                  >
                    {getNodeIcon(node.group)}
                  </text>
                </g>
              );
            })}
          </g>
          
          {/* End of main transform group */}
          </g>
          </svg>
          </div>
    </div>
  );
};

// Memoize the entire component to prevent unnecessary re-renders
const GraphVizMemoized = memo(GraphViz, (prevProps, nextProps) => {
  // Custom comparison for better performance - exclude graphVersion since it's only used for API calls, not rendering
  return (
    prevProps.nodes.length === nextProps.nodes.length &&
    prevProps.edges.length === nextProps.edges.length &&
    prevProps.nodeType === nextProps.nodeType &&
    prevProps.height === nextProps.height &&
    prevProps.focusedNode === nextProps.focusedNode &&
    prevProps.hasData === nextProps.hasData &&
    // Deep compare first few nodes for changes
    JSON.stringify(prevProps.nodes.slice(0, 5)) === JSON.stringify(nextProps.nodes.slice(0, 5)) &&
    JSON.stringify(prevProps.edges.slice(0, 10)) === JSON.stringify(nextProps.edges.slice(0, 10))
  );
});

GraphVizMemoized.displayName = 'GraphViz';

export default GraphVizMemoized;