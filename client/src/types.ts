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
}

export interface ChatQueryResult {
  cypherQuery: string;
  graphData: {
    nodes: GraphNode[];
    edges: GraphEdge[];
  };
  summary: string;
  executionTime?: number;
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
}