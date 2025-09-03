export interface Industry {
  name: string;
}

export interface Sector {
  name: string;
}

export interface Department {
  name: string;
}

export interface PainPoint {
  name: string;
  impact?: string;
}

export interface RequiredRole {
  name: string;
  specialty?: string;
}

export interface Project {
  title: string;
  priority: 'High' | 'Medium' | 'Low';
  businessCase: string;
  blueprintTitle: string;
  sector: string;
  department?: string;
  painPoint: string;
  budgetRange?: string;
  duration?: string;
  requiredRoles: RequiredRole[];
  subModules: string[];
}

export interface SelectionState {
  viewMode: 'sector' | 'department' | '';
  industries: string[];
  sectors: string[];
  departments: string[];
  painPoints: string[];
}

export interface NewPainPointForm {
  name: string;
  impact: string;
  departments: string[];
  sectors: string[];
}

export interface NewProjectForm {
  title: string;
  priority: 'High' | 'Medium' | 'Low';
  businessCase: string;
  blueprintTitle: string;
  sector?: string;
  department?: string;
  painPoint: string;
  budgetRange?: string;
  duration?: string;
  requiredRoles: RequiredRole[];
  subModules: string[];
}

export interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  queryResult?: ChatQueryResult;
  isProcessing?: boolean;
  clarificationRequest?: {
    question: string;
    options?: string[];
    context?: any;
  };
  exampleQuestions?: string[];
  mutationConfirmation?: {
    plan: MutationPlan;
    onConfirm: () => void;
    onCancel: () => void;
  };
  visualizationConfirmation?: {
    nodeCount: number;
    edgeCount: number;
    graphData: {
      nodes: GraphNode[];
      edges: GraphEdge[];
    };
    onConfirm: () => void;
    onCancel: () => void;
  };
}

export interface MutationPlan {
  explanation: string;
  query: string;
  params: Record<string, any>;
  affectedNodes: string[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface ReasoningStep {
  type: 'intent_parsing' | 'context_analysis' | 'cypher_generation' | 'result_formatting' | 'clarification' | 'validation';
  description: string;
  input?: string;
  output?: string;
  timestamp: number;
  duration?: number;
  confidence?: number;
  metadata?: Record<string, any>;
}

export interface ChatQueryResult {
  cypherQuery: string;
  graphData: {
    nodes: GraphNode[];
    edges: GraphEdge[];
  };
  summary: string;
  executionTime?: number;
  nodeCount?: number;
  edgeCount?: number;
  reasoning?: {
    interpretations: string[];
    chosenInterpretation: string;
    intermediateQueries?: {
      query: string;
      purpose: string;
      result: string;
    }[];
  };
  detailedExplanation?: string;
  reasoningSteps?: ReasoningStep[];
}

export interface GraphNode {
  id: string;
  label: string;
  group: string;
  properties: any;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number;
  fy?: number;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  type?: string;
}

export interface ChatState {
  isOpen: boolean;
  messages: ChatMessage[];
  isProcessing: boolean;
  currentInput: string;
}

export interface ChatApiRequest {
  query: string;
  context?: {
    currentNodeType?: string;
    selectedNodes?: string[];
    graphVersion?: string;
  };
  conversationHistory?: ChatMessage[];
}

export interface ChatApiResponse {
  success: boolean;
  message: string;
  queryResult?: ChatQueryResult;
  error?: string;
  needsClarification?: {
    question: string;
    options?: string[];
    context?: any;
  };
  needsConfirmation?: boolean;
  mutationPlan?: MutationPlan;
  needsVisualizationConfirmation?: boolean;
}