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