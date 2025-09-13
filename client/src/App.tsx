import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { Industry, Sector, Department, PainPoint, SelectionState, NewPainPointForm, NewProjectForm, GraphNode, GraphEdge, ChatQueryResult } from './types';
import GraphViz from './GraphViz';
import ChatInterface, { ChatInterfaceRef } from './components/ChatInterface';
import GraphErrorBoundary from './components/GraphErrorBoundary';
import { api, nodeApi, importApi } from './utils/api';
import './App.css';

// Memoized GraphHeroSection component to prevent unnecessary re-renders
const GraphHeroSection = memo<{
  graphLoading: boolean;
  showGraphSection: boolean;
  graphData: { nodes: any[], edges: any[] };
  hasGraphData: boolean;
  handleGraphNodeSelect: (nodeId: string, nodeData: any) => void;
  handleGraphNodeEdit: (nodeId: string, nodeData: any) => void;
  handleNavigateToNode: (nodeId: string) => void;
  focusedGraphNode: string | null;
  currentGraphVersion: string;
  handleGraphDataUpdate: (nodes: any[], edges: any[]) => void;
  handleExampleQuestionClick: (question: string) => void;
  // Version management props
  availableVersions: string[];
  onVersionChange: (version: string) => void;
  onManageVersions: () => void;
}>(({ 
  graphLoading, 
  showGraphSection, 
  graphData, 
  hasGraphData, 
  handleGraphNodeSelect, 
  handleGraphNodeEdit, 
  handleNavigateToNode, 
  focusedGraphNode, 
  currentGraphVersion, 
  handleGraphDataUpdate,
  handleExampleQuestionClick,
  availableVersions,
  onVersionChange,
  onManageVersions
}) => {
  return (
    <div className="graph-hero-section">
      {graphLoading ? (
        <div className="builder-loading">
          <div className="spinner"></div>
          <p>Loading catalog visualization...</p>
        </div>
      ) : showGraphSection ? (
        <GraphErrorBoundary>
          <GraphViz
            nodes={graphData.nodes}
            edges={graphData.edges}
            nodeType="all"
            onNodeSelect={handleGraphNodeSelect}
            onNodeDoubleClick={handleGraphNodeEdit}
            onNavigateToNode={handleNavigateToNode}
            focusedNode={focusedGraphNode}
            height="100%"
            enableChat={true}
            graphVersion={currentGraphVersion}
            onGraphDataUpdate={handleGraphDataUpdate}
            hasData={hasGraphData}
            availableVersions={availableVersions}
            onVersionChange={onVersionChange}
            onManageVersions={onManageVersions}
          />
        </GraphErrorBoundary>
      ) : (
        <div className="graph-welcome-state">
          <div className="welcome-content">
            <div className="welcome-icon">🔍</div>
            <h3>Ready to Explore</h3>
            <p>Ask the AI Assistant to explore the catalog and discover insights about industries, sectors, pain points, and AI project opportunities.</p>
            
            {/* Version management for welcome screen */}
            {availableVersions.length > 0 && currentGraphVersion && (
              <div className="version-info-display">
                <div className="version-label">
                  <span className="version-icon">📂</span>
                  <span>Current Version: <strong>{currentGraphVersion}</strong></span>
                </div>
                {availableVersions.length > 1 && (
                  <div className="version-actions-compact">
                    <select 
                      className="version-select-compact"
                      value={currentGraphVersion}
                      onChange={(e) => onVersionChange(e.target.value)}
                    >
                      {availableVersions.map(version => (
                        <option key={version} value={version}>
                          {version === 'base' ? '📂 Base' : `📦 ${version}`}
                        </option>
                      ))}
                    </select>
                    <button 
                      className="version-manage-btn-compact"
                      onClick={onManageVersions}
                      title="Manage Versions"
                    >
                      ⚙️
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

const App: React.FC = () => {
  // Chat interface ref for programmatic interaction
  const chatInterfaceRef = useRef<ChatInterfaceRef>(null);
  
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [sectors, setSectors] = useState<{[key: string]: Sector[]}>({});
  const [departments, setDepartments] = useState<Department[]>([]);
  const [painPoints, setPainPoints] = useState<PainPoint[]>([]);
  // Removed unused state variables: projects, loading
  const [currentStep, setCurrentStep] = useState(1);
  const [businessContextSubstep, setBusinessContextSubstep] = useState<'industries' | 'sectors'>('industries');
  const [currentSectorPage, setCurrentSectorPage] = useState(0);
  const [scopeSubstep, setScopeSubstep] = useState<'choice' | 'departments'>('choice');
  const [scopeChoice, setScopeChoice] = useState<'company' | 'departments' | ''>('');
  const [selections, setSelections] = useState<SelectionState>({
    viewMode: '',
    industries: [],
    sectors: [],
    departments: [],
    painPoints: []
  });
  const [showPainPointModal, setShowPainPointModal] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [newPainPointForm, setNewPainPointForm] = useState<NewPainPointForm>({
    name: '',
    impact: '',
    departments: [],
    sectors: []
  });
  const [showSectorDropdown, setShowSectorDropdown] = useState(false);
  const [showDepartmentDropdown, setShowDepartmentDropdown] = useState(false);
  const [newProjectForm, setNewProjectForm] = useState<NewProjectForm>({
    title: '',
    priority: 'Medium',
    businessCase: '',
    blueprintTitle: '',
    sector: '',
    department: '',
    painPoint: '',
    budgetRange: '',
    duration: '',
    requiredRoles: [],
    subModules: []
  });

  // Builder mode state (default to builder mode)
  const [builderAuthenticated] = useState(true); // Removed unused setBuilderAuthenticated
  const [selectedNodeType, setSelectedNodeType] = useState<string | null>(null);
  const [builderStats, setBuilderStats] = useState<any>(null);
  const [builderLoading, setBuilderLoading] = useState(false);
  const [currentGraphVersion, setCurrentGraphVersion] = useState<string>('');
  const [availableVersions, setAvailableVersions] = useState<string[]>([]);
  
  // Builder modals and forms
  const [showBuilderNodeModal, setShowBuilderNodeModal] = useState(false);
  const [showBuilderEditModal, setShowBuilderEditModal] = useState(false);
  const [builderNodeForm, setBuilderNodeForm] = useState<any>({});
  const [editingNode, setEditingNode] = useState<any>(null);
  
  // Graph visualization state
  const [graphData, setGraphData] = useState<{ nodes: any[], edges: any[] }>({ nodes: [], edges: [] });
  const [graphLoading, setGraphLoading] = useState(false);
  const [focusedGraphNode, setFocusedGraphNode] = useState<string | null>(null);
  const [isShowingNodeFocus, setIsShowingNodeFocus] = useState(false); // Track if showing node-specific data
  
  // UI visibility state - tabbed interface in right panel
  const [activeRightTab, setActiveRightTab] = useState<'assistant' | 'nodeDetails'>('assistant');
  const [selectedNodeForDetails, setSelectedNodeForDetails] = useState<any>(null);
  
  // Graph filter state
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([]);
  const [selectedSector, setSelectedSector] = useState<string>('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');

  // Assistant-driven graph updates
  const [isAssistantUpdatingGraph, setIsAssistantUpdatingGraph] = useState(false);

  // Graph visibility control - only show when needed
  const [shouldShowGraph, setShouldShowGraph] = useState(false);
  
  // Computed state for better UX - More stable approach
  const hasGraphData = graphData.nodes.length > 0;
  const showGraphSection = shouldShowGraph; // Always show when requested, even with empty data
  
  // Get node count from database stats (not from current graph visualization)
  const getNodeCount = (nodeType: string) => {
    if (builderStats && builderStats[nodeType] !== undefined) {
      return builderStats[nodeType];
    }
    
    // Return 0 if stats not loaded yet (instead of counting from visualization)
    // This ensures cards always show database counts, not visualization counts
    return 0;
  };

  // Get total count of all nodes in database
  const getTotalNodeCount = () => {
    if (!builderStats) return 0;
    
    // Include all node types that exist in the database
    const nodeTypes = ['Industry', 'Sector', 'Department', 'PainPoint', 'ProjectOpportunity', 'Role', 'SubModule', 'Module'];
    return nodeTypes.reduce((total, nodeType) => {
      return total + (builderStats[nodeType] || 0);
    }, 0);
  };

  // Handler for example question clicks
  const handleExampleQuestionClick = async (question: string) => {
    console.log('[App] Example question clicked:', question);
    
    // Switch to assistant tab if not already there
    setActiveRightTab('assistant');
    
    // Send the question to the chat interface
    if (chatInterfaceRef.current) {
      try {
        await chatInterfaceRef.current.sendExampleQuestion(question);
      } catch (error) {
        console.error('Error sending example question:', error);
      }
    } else {
      console.warn('Chat interface ref not available');
    }
  };


  // Chat interface state (always open)

  // Load persisted state on app initialization
  useEffect(() => {
    const savedState = localStorage.getItem('ai-catalog-state');
    if (savedState) {
      try {
        const parsedState = JSON.parse(savedState);
        if (parsedState.currentStep !== undefined) setCurrentStep(parsedState.currentStep);
        if (parsedState.businessContextSubstep) setBusinessContextSubstep(parsedState.businessContextSubstep);
        if (parsedState.currentSectorPage !== undefined) setCurrentSectorPage(parsedState.currentSectorPage);
        if (parsedState.scopeSubstep) setScopeSubstep(parsedState.scopeSubstep);
        if (parsedState.scopeChoice) setScopeChoice(parsedState.scopeChoice);
        if (parsedState.selections) setSelections(parsedState.selections);
      } catch (error) {
        console.error('Failed to restore state:', error);
      }
    }
  }, []);

  // Save state to localStorage whenever key state changes (with small delay to avoid excessive saving)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const stateToSave = {
        currentStep,
        businessContextSubstep,
        currentSectorPage,
        scopeSubstep,
        scopeChoice,
        selections
      };
      localStorage.setItem('ai-catalog-state', JSON.stringify(stateToSave));
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [currentStep, businessContextSubstep, currentSectorPage, scopeSubstep, scopeChoice, selections]);

  useEffect(() => {
    fetchIndustries();
    fetchDepartments();
    // Load all sectors for both Banking and Insurance
    fetchSectors(['Banking', 'Insurance']);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initialize form with current selections when modal opens
  useEffect(() => {
    if (showPainPointModal) {
      setNewPainPointForm({
        name: '',
        impact: '',
        departments: [...selections.departments],
        sectors: [...selections.sectors]
      });
      
      // Ensure sectors and departments are loaded
      if (Object.keys(sectors).length === 0) {
        fetchSectors(['Banking', 'Insurance']);
      }
      if (departments.length === 0) {
        fetchDepartments();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPainPointModal, selections.departments, selections.sectors]);

  // Keyboard support for modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showPainPointModal) {
          setShowPainPointModal(false);
        } else if (showProjectModal) {
          setShowProjectModal(false);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showPainPointModal, showProjectModal]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('.multiselect-container')) {
        setShowSectorDropdown(false);
        setShowDepartmentDropdown(false);
      }
    };

    if (showSectorDropdown || showDepartmentDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showSectorDropdown, showDepartmentDropdown]);

  const fetchIndustries = async () => {
    try {
      const versionParam = currentGraphVersion && currentGraphVersion !== 'base' ? `?version=${encodeURIComponent(currentGraphVersion)}` : '';
      const response = await api.get(`/api/industries${versionParam}`);
      const data = await response.json();
      setIndustries(data);
    } catch (error) {
      console.error('Error fetching industries:', error);
    }
  };

  const fetchSectors = async (selectedIndustries: string[]) => {
    if (selectedIndustries.length === 0) {
      setSectors({});
      return;
    }
    
    try {
      const versionParam = currentGraphVersion && currentGraphVersion !== 'base' ? `?version=${encodeURIComponent(currentGraphVersion)}` : '';
      const response = await api.post(`/api/sectors${versionParam}`, { industries: selectedIndustries });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setSectors(data);
    } catch (error) {
      console.error('Error fetching sectors:', error);
      setSectors({}); // Clear sectors on error
    }
  };

  const fetchDepartments = async () => {
    try {
      const versionParam = currentGraphVersion && currentGraphVersion !== 'base' ? `?version=${encodeURIComponent(currentGraphVersion)}` : '';
      const response = await api.get(`/api/departments${versionParam}`);
      const data = await response.json();
      setDepartments(data);
    } catch (error) {
      console.error('Error fetching departments:', error);
    }
  };

  const fetchProjects = async () => {
    try {
      // Projects functionality removed
      setCurrentStep(4); // Go to step 4
    } catch (error) {
      console.error('Error fetching projects:', error);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleIndustrySelection = (industryName: string) => {
    const newIndustries = selections.industries.includes(industryName)
      ? selections.industries.filter(i => i !== industryName)
      : [...selections.industries, industryName];
    
    // Update selections immediately for responsive UI
    setSelections(prev => ({
      ...prev,
      industries: newIndustries,
      // Only clear downstream if we're changing industries meaningfully
      sectors: [],
      departments: [],
      painPoints: []
    }));
    
    // Clear downstream states only if needed
    if (currentStep > 1) {
      setScopeChoice('');
      setPainPoints([]);
      setCurrentStep(1);
    }
    
    // Reset substep states
    setBusinessContextSubstep('industries');
    setCurrentSectorPage(0);
    
    // Fetch fresh sectors in background without showing main loading
    if (newIndustries.length > 0) {
      fetchSectors(newIndustries);
    } else {
      setSectors({});
    }
  };

  const fetchPainPointsForCurrentSelections = async (currentDepartments?: string[], currentSectors?: string[]) => {
    const departments = currentDepartments || selections.departments;
    const sectors = currentSectors || selections.sectors;
    
    // If at least one department has been selected, show only pain points connected to selected departments
    if (departments.length > 0) {
      try {
        const versionParam = currentGraphVersion && currentGraphVersion !== 'base' ? `?version=${encodeURIComponent(currentGraphVersion)}` : '';
        const response = await api.post(`/api/department-painpoints${versionParam}`, { departments });
        const deptPainPoints = await response.json();
        setPainPoints(deptPainPoints);
      } catch (error) {
        console.error('Error fetching department pain points:', error);
      }
    } else if (sectors.length > 0) {
      // If no departments selected, fall back to sector pain points
      try {
        const versionParam = currentGraphVersion && currentGraphVersion !== 'base' ? `?version=${encodeURIComponent(currentGraphVersion)}` : '';
        const response = await api.post(`/api/sector-painpoints${versionParam}`, { sectors });
        const sectorPainPoints = await response.json();
        setPainPoints(sectorPainPoints);
      } catch (error) {
        console.error('Error fetching sector pain points:', error);
      }
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleSectorSelection = (sectorName: string) => {
    const newSectors = selections.sectors.includes(sectorName)
      ? selections.sectors.filter(s => s !== sectorName)
      : [...selections.sectors, sectorName];
    
    setSelections({ ...selections, sectors: newSectors });
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleScopeSelection = (scope: 'company' | 'departments') => {
    setScopeChoice(scope);
    
    if (scope === 'company') {
      // Clear departments and set viewMode for company-wide (sector-based) search
      setSelections({ ...selections, viewMode: 'sector', departments: [] });
    } else {
      // Set viewMode for department-specific search
      setSelections({ ...selections, viewMode: 'department' });
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleScopeNext = () => {
    if (scopeChoice === 'company') {
      // Proceed to pain points with sectors only
      fetchPainPointsForCurrentSelections([], selections.sectors);
      setCurrentStep(3);
    } else if (scopeChoice === 'departments') {
      // Move to department selection substep
      setScopeSubstep('departments');
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleDepartmentSelection = (departmentName: string) => {
    const newDepartments = selections.departments.includes(departmentName)
      ? selections.departments.filter(d => d !== departmentName)
      : [...selections.departments, departmentName];
    
    setSelections({ ...selections, departments: newDepartments });
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleDepartmentNext = () => {
    if (selections.departments.length > 0 && scopeChoice === 'departments') {
      fetchPainPointsForCurrentSelections(selections.departments, selections.sectors);
      setCurrentStep(3);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleBackToScopeChoice = () => {
    setScopeSubstep('choice');
    setScopeChoice('');
    setSelections({ ...selections, departments: [] });
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleBackToBusinessContext = () => {
    setCurrentStep(1);
    setBusinessContextSubstep('sectors');
    setCurrentSectorPage(selections.industries.length - 1);
    setScopeChoice('');
    setSelections({ ...selections, departments: [] });
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleClearProgress = () => {
    // Clear localStorage
    localStorage.removeItem('ai-catalog-state');
    // Reset all state to initial values
    setCurrentStep(1);
    setBusinessContextSubstep('industries');
    setCurrentSectorPage(0);
    setScopeSubstep('choice');
    setScopeChoice('');
    setSelections({
      viewMode: '',
      industries: [],
      sectors: [],
      departments: [],
      painPoints: []
    });
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handlePainPointSelection = (painPointName: string) => {
    const newPainPoints = selections.painPoints.includes(painPointName)
      ? selections.painPoints.filter(p => p !== painPointName)
      : [...selections.painPoints, painPointName];
    
    setSelections({ ...selections, painPoints: newPainPoints });
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleProceedToSectors = () => {
    // Ensure sectors are loaded for selected industries
    if (selections.industries.length > 0) {
      fetchSectors(selections.industries);
    }
    setBusinessContextSubstep('sectors');
    setCurrentSectorPage(0);
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleNextSectorPage = () => {
    if (currentSectorPage < selections.industries.length - 1) {
      setCurrentSectorPage(currentSectorPage + 1);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handlePreviousSectorPage = () => {
    if (currentSectorPage > 0) {
      setCurrentSectorPage(currentSectorPage - 1);
    } else {
      // Go back to industry selection
      setBusinessContextSubstep('industries');
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleProceedToScope = () => {
    if (selections.sectors.length > 0) {
      setCurrentStep(2);
    }
  };


  // Builder API functions
  const fetchBuilderStats = useCallback(async (version = currentGraphVersion) => {
    // Skip if no version is available yet
    if (!version) {
      console.log('[App] Skipping fetchBuilderStats: no version available');
      return;
    }

    setBuilderLoading(true);
    try {
      console.log(`[App] Fetching builder stats for version: ${version}`);
      const response = await api.get(`/api/admin/stats?version=${version}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const stats = await response.json();
      console.log('[App] Received builder stats:', stats);
      setBuilderStats(stats);
    } catch (error) {
      console.error('Error fetching admin stats:', error);
      // Set empty stats object so the UI knows the fetch was attempted
      setBuilderStats({});
    } finally {
      setBuilderLoading(false);
    }
  }, [currentGraphVersion]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const fetchBuilderNodes = async (nodeType: string, version = currentGraphVersion) => {
    setBuilderLoading(true);
    try {
      const response = await api.get(`/api/admin/nodes/${nodeType}?version=${version}`);
      const nodes = await response.json();
      // setBuilderNodes(nodes); // Removed builderNodes state
      console.log('Fetched builder nodes:', nodes);
    } catch (error) {
      console.error('Error fetching admin nodes:', error);
    } finally {
      setBuilderLoading(false);
    }
  };

  const createDraftVersion = async () => {
    setBuilderLoading(true);
    try {
      const response = await api.post('/api/admin/versions/create-draft');
      const result = await response.json();
      if (response.ok) {
        alert('Draft version created successfully!');
        setCurrentGraphVersion('admin_draft');
        await fetchAvailableVersions();
        await fetchBuilderStats('admin_draft');
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      console.error('Error creating draft version:', error);
      alert('Error creating draft version');
    } finally {
      setBuilderLoading(false);
    }
  };



  const handleCreateNode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBuilderLoading(true);
    
    try {
      const response = await api.post(`/api/admin/nodes/${builderNodeForm.type}?version=${currentGraphVersion}`, {
        name: builderNodeForm.name,
        impact: builderNodeForm.impact
      });
      
      if (response.ok) {
        setShowBuilderNodeModal(false);
        setBuilderNodeForm({});
        // await fetchBuilderNodes('nodes', currentGraphVersion); // 'nodes' removed
        await fetchBuilderStats(currentGraphVersion);
      } else {
        const error = await response.json();
        alert(`Error creating node: ${error.error}`);
      }
    } catch (error) {
      console.error('Error creating node:', error);
      alert('Failed to create node');
    } finally {
      setBuilderLoading(false);
    }
  };

  const handleUpdateNode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBuilderLoading(true);
    
    try {
      const response = await api.put(`/api/admin/nodes/${'nodes'}/${editingNode.id}?version=${currentGraphVersion}`, {
        name: builderNodeForm.name,
        impact: builderNodeForm.impact
      });
      
      if (response.ok) {
        setShowBuilderEditModal(false);
        setEditingNode(null);
        setBuilderNodeForm({});
        // await fetchBuilderNodes('nodes', currentGraphVersion); // 'nodes' removed
      } else {
        const error = await response.json();
        alert(`Error updating node: ${error.error}`);
      }
    } catch (error) {
      console.error('Error updating node:', error);
      alert('Failed to update node');
    } finally {
      setBuilderLoading(false);
    }
  };


  const [exportLoading, setExportLoading] = useState(false);
  
  // Import state
  const [showImportModal, setShowImportModal] = useState(false);
  const [showManageVersionsModal, setShowManageVersionsModal] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importVersionName, setImportVersionName] = useState('');
  const [importValidationErrors, setImportValidationErrors] = useState<string[]>([]);
  const [importResult, setImportResult] = useState<{ success: boolean; message: string; versionName?: string } | null>(null);

  const handleExportGraph = async () => {
    setExportLoading(true);
    try {
      const response = await api.get(`/api/admin/export?version=${currentGraphVersion}`);
      
      if (response.ok) {
        // Get the filename from the Content-Disposition header
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = `graph-export-${currentGraphVersion}-${new Date().toISOString().split('T')[0]}.cypher`;
        
        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename="(.+)"/);
          if (filenameMatch) {
            filename = filenameMatch[1];
          }
        }
        
        // Get the text content
        const cypherScript = await response.text();
        
        // Create a blob and download it
        const blob = new Blob([cypherScript], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        alert(`✅ Graph exported successfully!\n\nFile: ${filename}\nVersion: ${currentGraphVersion}\n\nThe exported Cypher file includes:\n• Complete schema documentation\n• All nodes and relationships\n• Import instructions`);
      } else {
        const error = await response.json();
        alert(`❌ Export failed: ${error.error}`);
      }
    } catch (error) {
      console.error('Export error:', error);
      alert('❌ Failed to export graph. Please check the console for details.');
    } finally {
      setExportLoading(false);
    }
  };

  const handleImportGraph = async () => {
    if (!importFile || !importVersionName.trim()) {
      alert('⚠️ Please select a file and enter a version name');
      return;
    }

    setImportLoading(true);
    setImportValidationErrors([]); // Clear previous validation errors
    setImportResult(null);

    try {
      const fileContent = await importFile.text();
      
      const response = await importApi.importCypher(fileContent, importVersionName.trim());

      const result = await response.json();

      if (response.ok) {
        setImportResult({
          success: true,
          message: `✅ Import successful!\n\nVersion: ${result.versionName}\nNodes: ${result.stats?.nodesCreated || 0}\nRelationships: ${result.stats?.relationshipsCreated || 0}`,
          versionName: result.versionName
        });
        
        // Refresh available versions
        await fetchAvailableVersions();
        
        // Switch to the newly imported version
        setCurrentGraphVersion(result.versionName);
        
        // Clear form
        setImportFile(null);
        setImportVersionName('');
        
        // Auto-close modal after 3 seconds
        setTimeout(() => {
          setShowImportModal(false);
          setImportResult(null);
        }, 3000);
      } else {
        let errorMessage = `❌ Import failed: ${result.error}`;
        
        // Add helpful context for common errors
        if (result.error === 'Schema validation failed') {
          errorMessage += '\n\n💡 Your Cypher script contains elements that don\'t match our schema.';
          
          // Only promise detailed errors if we actually have them
          if (result.validationErrors && result.validationErrors.length > 0) {
            errorMessage += '\n📋 See detailed errors below for specific issues to fix.';
          } else {
            errorMessage += '\n📋 No specific validation errors found.';
          }
        }
        
        // Add debug information for the user
        if (result.stats) {
          errorMessage += `\n\n📊 Script Analysis:`;
          errorMessage += `\n• Node creations found: ${result.stats.nodeCreates || 0}`;
          errorMessage += `\n• Relationship creations found: ${result.stats.relCreates || 0}`;
        }
        
        // Show validation errors info for debugging
        errorMessage += `\n\n🔍 Debug Info:`;
        errorMessage += `\n• Has validationErrors field: ${result.hasOwnProperty('validationErrors')}`;
        errorMessage += `\n• ValidationErrors type: ${typeof result.validationErrors}`;
        if (result.validationErrors) {
          errorMessage += `\n• ValidationErrors length: ${result.validationErrors.length}`;
          errorMessage += `\n• ValidationErrors content: ${JSON.stringify(result.validationErrors)}`;
        }
        
        // Show the complete server response for debugging
        errorMessage += `\n\n🐛 Full Server Response:`;
        errorMessage += `\n${JSON.stringify(result, null, 2)}`;
        
        setImportResult({
          success: false,
          message: errorMessage,
        });
        
        if (result.validationErrors && result.validationErrors.length > 0) {
          setImportValidationErrors(result.validationErrors);
        }
      }
    } catch (error) {
      console.error('Import error:', error);
      let errorMessage = '❌ Failed to import graph';
      
      if (error instanceof Error) {
        errorMessage += `: ${error.message}`;
      } else if (typeof error === 'string') {
        errorMessage += `: ${error}`;
      } else {
        errorMessage += ': Network error or unexpected issue occurred';
      }
      
      // Add helpful troubleshooting info
      errorMessage += '\n\n🔧 Troubleshooting:';
      errorMessage += '\n• Check your internet connection';
      errorMessage += '\n• Ensure the server is running';
      errorMessage += '\n• Verify the file is a valid Cypher script';
      errorMessage += '\n• Try a smaller file to test the connection';
      
      setImportResult({
        success: false,
        message: errorMessage,
      });
    } finally {
      setImportLoading(false);
    }
  };


  const handleDeleteVersion = async (versionName: string) => {
    if (!window.confirm(`⚠️ Are you sure you want to delete version '${versionName}'?\n\nThis action cannot be undone and will permanently remove all data in this version.`)) {
      return;
    }

    try {
      const response = await api.delete(`/api/admin/versions/${encodeURIComponent(versionName)}`);

      const result = await response.json();

      if (response.ok) {
        alert(`✅ Version deleted successfully!\n\nDeleted version: ${versionName}\nNodes removed: ${result.deletedNodes}`);
        
        // Refresh available versions first
        await fetchAvailableVersions();
        
        // If we were viewing the deleted version, switch to first available version
        if (currentGraphVersion === versionName) {
          // Get updated versions after refresh
          const response = await api.get('/api/admin/versions');
          if (response.ok) {
            const data = await response.json();
            const versions = Array.isArray(data) ? data : (data.versions || []);
            
            if (versions.length > 0) {
              // Switch to first available version (preferably 'base' if it exists)
              const targetVersion = versions.includes('base') ? 'base' : versions[0];
              setCurrentGraphVersion(targetVersion);
            } else {
              // No versions available - this shouldn't happen but handle gracefully
              console.warn('No versions available after deletion');
              setCurrentGraphVersion('base'); // Fallback
            }
          }
        }
        
        // Clear import result if it was for this version
        if (importResult?.versionName === versionName) {
          setImportResult(null);
        }
      } else {
        alert(`❌ Delete failed: ${result.error}`);
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('❌ Failed to delete version. Please check your connection.');
    }
  };

  const fetchAvailableVersions = useCallback(async () => {
    try {
      // Add cache-busting timestamp to ensure fresh data
      const response = await api.get(`/api/admin/versions?_t=${Date.now()}`);
      if (response.ok) {
        const data = await response.json();
        
        // Handle both old and new API response formats
        let versions: string[] = [];
        if (Array.isArray(data)) {
          // Old format: just array of versions
          versions = data;
        } else {
          // New format: object with versions array and metadata
          versions = data.versions || [];
        }
        
        // Simple alphabetical sorting with base first
        const sortedVersions = [...versions].sort((a, b) => {
          // Base version comes first
          if (a === 'base' && b !== 'base') return -1;
          if (b === 'base' && a !== 'base') return 1;
          
          // Sort other versions alphabetically
          return a.localeCompare(b);
        });
        
        setAvailableVersions(sortedVersions);
        console.log('Available versions:', sortedVersions);
        
        // If current version is empty or doesn't exist in available versions, switch to first available
        if (sortedVersions.length > 0 && (!currentGraphVersion || !sortedVersions.includes(currentGraphVersion))) {
          const targetVersion = sortedVersions.includes('base') ? 'base' : sortedVersions[0];
          console.log(`Current version '${currentGraphVersion}' not found, switching to '${targetVersion}'`);
          setCurrentGraphVersion(targetVersion);
        }
      } else {
        console.error('Failed to fetch versions:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Error fetching versions:', error);
    }
  }, [currentGraphVersion]);


  // Fetch graph data for visualization
  const fetchGraphData = useCallback(async (nodeType: string) => {
    // Skip if no version is available yet
    if (!currentGraphVersion) {
      console.log('[App] Skipping fetchGraphData: no version available');
      return;
    }
    
    setGraphLoading(true);
    setFocusedGraphNode(null); // Reset focused node when loading new data
    setIsShowingNodeFocus(false); // Clear node focus when fetching general graph data
    
    try {
      const params = new URLSearchParams();
      params.append('version', currentGraphVersion);
      
      // Add filter parameters based on node type
      if (nodeType === 'sectors' && selectedIndustries.length > 0) {
        selectedIndustries.forEach(industry => {
          params.append('industry', industry);
        });
      }
      if (nodeType === 'painpoints') {
        selectedIndustries.forEach(industry => {
          params.append('industry', industry);
        });
        if (selectedSector) params.append('sector', selectedSector);
        if (selectedDepartment) params.append('department', selectedDepartment);
      }
      
      // For 'all' node type, use the correct endpoint
      const endpoint = nodeType === 'all' ? 'all' : nodeType;
      // Add version parameter to existing params
      params.set('version', currentGraphVersion);
      const response = await api.get(`/api/admin/graph/${endpoint}?${params.toString()}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`[fetchGraphData] Fetched ${nodeType}:`, { 
          nodes: data.nodes?.length || 0, 
          edges: data.edges?.length || 0,
          endpoint: endpoint
        });
        setGraphData({
          nodes: data.nodes || [],
          edges: data.edges || []
        });
      } else {
        const error = await response.json();
        console.error('Graph data error:', error);
        setGraphData({ nodes: [], edges: [] });
      }
    } catch (error) {
      console.error('Failed to fetch graph data:', error);
      setGraphData({ nodes: [], edges: [] });
    } finally {
      setGraphLoading(false);
    }
  }, [currentGraphVersion, selectedIndustries, selectedSector, selectedDepartment]);

  // Handle node selection in graph
  const handleGraphNodeSelect = (nodeId: string, nodeData: any) => {
    console.log('Selected node:', nodeId, nodeData);
    // When a node is selected, switch to Node Details tab
    setSelectedNodeForDetails(nodeData);
    setActiveRightTab('nodeDetails');
  };


  // Handle node double-click in graph (center and show connections)
  const handleGraphNodeEdit = async (nodeId: string, nodeData: any) => {
    console.log('[App] Double-click handler called:', {
      receivedNodeId: nodeId,
      nodeIdType: typeof nodeId,
      nodeData: nodeData,
      nodeLabel: nodeData?.label,
      nodeGroup: nodeData?.group,
      currentGraphVersion: currentGraphVersion
    });
    
    try {
      console.log(`[App] Making API call to /api/admin/node/${nodeId}/graph?version=${currentGraphVersion}`);
      
      // Fetch the node's direct connections from the API
      const data = await nodeApi.getGraph(nodeId, currentGraphVersion);
      
      console.log(`[App] API response received:`, {
        nodeId: nodeId,
        nodesCount: data.nodes.length,
        edgesCount: data.edges.length,
        centerNodeId: data.centerNodeId,
        actualNodes: data.nodes.map((n: any) => ({ id: n.id, label: n.label, group: n.group }))
      });
      
      // Update graph data smoothly without loading state or delays
      setGraphData({
        nodes: data.nodes,
        edges: data.edges
      });
      
      // Set flags to prevent automatic refreshes from overriding this focused view
      setFocusedGraphNode(nodeId);
      setIsShowingNodeFocus(true);
      
      console.log(`[App] Successfully updated graph for node ${nodeId} - blocking auto-refresh`);
    } catch (error) {
      const err = error as Error;
      console.error('[App] Failed to fetch node connections:', {
        nodeId: nodeId,
        error: err.message,
        errorStack: err.stack,
        nodeData: nodeData
      });
      alert(`Failed to load node connections for ${nodeData?.label || nodeId}: ${err.message}`);
    }
  };

  // Handle navigation to specific node in graph
  const handleNavigateToNode = async (nodeId: string) => {
    setGraphLoading(true);
    try {
      const response = await api.get(`/api/admin/node/${nodeId}/graph?version=${currentGraphVersion}`);
      if (response.ok) {
        const data = await response.json();
        setGraphData({
          nodes: data.nodes,
          edges: data.edges
        });
        // Set the navigated node as focused
        setFocusedGraphNode(nodeId);
        console.log('Navigated to node:', nodeId, 'with', data.nodes.length, 'nodes and', data.edges.length, 'edges');
      } else {
        console.error('Failed to navigate to node');
      }
    } catch (error) {
      console.error('Error navigating to node:', error);
    } finally {
      setGraphLoading(false);
    }
  };

  // Chat interface handlers
  const handleApplyQueryResult = (queryResult: ChatQueryResult) => {
    console.log('🎯 APP.TSX - handleApplyQueryResult called');
    console.log('📊 Query result received:', {
      cypherQuery: queryResult.cypherQuery,
      hasGraphData: !!queryResult.graphData,
      nodeCount: queryResult.graphData?.nodes?.length || 0,
      edgeCount: queryResult.graphData?.edges?.length || 0,
      summary: queryResult.summary
    });
    
    // Automatically update the graph with the query results
    if (queryResult.graphData && queryResult.graphData.nodes && queryResult.graphData.edges) {
      console.log('✅ Valid graph data detected, updating graph...');
      console.log('📊 Graph data details:', {
        nodes: queryResult.graphData.nodes.length,
        edges: queryResult.graphData.edges.length,
        sampleNodeIds: queryResult.graphData.nodes.slice(0, 5).map(n => n.id)
      });
      
      // Show the graph when assistant finds results
      setShouldShowGraph(true);
      console.log('📺 Set shouldShowGraph = true');
      
      // Show visual feedback that the assistant is updating the graph
      setIsAssistantUpdatingGraph(true);
      console.log('🔄 Set isAssistantUpdatingGraph = true');
      
      // Update the graph data and clear any node focus (chat takes precedence)
      console.log('🔄 Calling handleGraphDataUpdate...');
      setIsShowingNodeFocus(false); // Chat updates override node focus
      handleGraphDataUpdate(queryResult.graphData.nodes, queryResult.graphData.edges);
      
      // Brief delay for visual feedback, then clear the indicator
      setTimeout(() => {
        setIsAssistantUpdatingGraph(false);
        console.log('✅ Cleared isAssistantUpdatingGraph flag');
      }, 800);
    } else {
      console.warn('❌ Invalid or missing graph data:', {
        hasGraphData: !!queryResult.graphData,
        hasNodes: !!queryResult.graphData?.nodes,
        hasEdges: !!queryResult.graphData?.edges,
        nodeCount: queryResult.graphData?.nodes?.length,
        edgeCount: queryResult.graphData?.edges?.length
      });
    }
  };

  // Handle graph data updates from chat interface
  const handleGraphDataUpdate = (nodes: GraphNode[], edges: GraphEdge[]) => {
    console.log('🔄 APP.TSX - handleGraphDataUpdate START');
    console.log('📊 Input data:');
    console.log('- Nodes count:', nodes.length);
    console.log('- Edges count:', edges.length);
    console.log('- Sample nodes:', nodes.slice(0, 3));
    console.log('- Sample edges:', edges.slice(0, 3));
    
    console.log('📊 BEFORE UPDATE - Current graph state:');
    console.log('- Current nodes count:', graphData.nodes.length);
    console.log('- Current edges count:', graphData.edges.length);
    console.log('- Current shouldShowGraph:', shouldShowGraph);
    
    console.log('🔍 Node ID comparison:');
    console.log('- New node IDs:', nodes.map(n => n.id).slice(0, 10));
    console.log('- Current node IDs:', graphData.nodes.map(n => n.id).slice(0, 10));
    
    console.log('🔄 Calling setGraphData with new data...');
    setGraphData({ nodes, edges });
    console.log('✅ setGraphData called - React state should update');
    console.log('📊 New graph data object created:', { nodeCount: nodes.length, edgeCount: edges.length });
    console.log('🔄 APP.TSX - handleGraphDataUpdate END');
  };

  // Load filter options
  const loadFilterOptions = async () => {
    try {
      // Load industries
      const versionParam = currentGraphVersion && currentGraphVersion !== 'base' ? `?version=${encodeURIComponent(currentGraphVersion)}` : '';
      const industriesResponse = await api.get(`/api/industries${versionParam}`);
      if (industriesResponse.ok) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const industriesData = await industriesResponse.json();
        // setAvailableIndustries(industriesData.map((i: any) => i.name)); // Removed availableIndustries state
      }

      // Load departments
      const departmentsResponse = await api.get('/api/departments');
      if (departmentsResponse.ok) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const departmentsData = await departmentsResponse.json();
        // setAvailableDepartments(departmentsData.map((d: any) => d.name)); // Removed availableDepartments state
      }

      // Load sectors (all sectors initially)
      if (industries.length > 0) {
        const sectorsResponse = await api.post(`/api/sectors${versionParam}`, { industries: industries.map(i => i.name) });
        if (sectorsResponse.ok) {
          const sectorsData = await sectorsResponse.json();
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const allSectors = Object.values(sectorsData).flat() as any[];
          // setAvailableSectors(allSectors.map((s: any) => s.name)); // Removed availableSectors state
        }
      }
    } catch (error) {
      console.error('Failed to load filter options:', error);
    }
  };

  // Reset filters when changing tabs
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const resetFilters = () => {
    setSelectedIndustries([]);
    setSelectedSector('');
    setSelectedDepartment('');
  };


  // Load database stats on app startup (always needed for node cards)
  useEffect(() => {
    fetchBuilderStats();
  }, [fetchBuilderStats]);

  // Load builder data when authenticated
  useEffect(() => {
    if (builderAuthenticated) {
      // First fetch available versions, then other data once version is set
      fetchAvailableVersions();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builderAuthenticated]);

  // Load stats and filter options after current version is set
  useEffect(() => {
    if (builderAuthenticated && currentGraphVersion) {
      fetchBuilderStats();
      loadFilterOptions();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builderAuthenticated, currentGraphVersion]);

  // Load graph data when authenticated or when specific node type is selected
  useEffect(() => {
    if (builderAuthenticated && currentGraphVersion) {
      // Only refresh graph data if not showing node-specific focus
      if (!isShowingNodeFocus) {
        // If a specific node type was selected from overview, use it
        if (selectedNodeType) {
          const nodeTypeMap: { [key: string]: string } = {
            'industries': 'industries',
            'sectors': 'sectors', 
            'departments': 'departments',
            'painpoints': 'painpoints',
            'projects': 'projects',
            'blueprints': 'blueprints',
            'roles': 'roles',
            'modules': 'modules',
            'submodules': 'submodules'
          };
          
          const nodeType = nodeTypeMap[selectedNodeType];
          if (nodeType) {
            fetchGraphData(nodeType);
          }
        } else {
          // Default to showing all node types
          fetchGraphData('all');
        }
      } else {
        console.log('Skipping auto-refresh: user is viewing focused node data');
      }
    }
  }, [builderAuthenticated, currentGraphVersion, selectedNodeType, fetchGraphData, isShowingNodeFocus]);

  // Refresh data when version changes (optimized to minimize re-renders)
  useEffect(() => {
    if (builderAuthenticated && currentGraphVersion) {
      // Always update stats when version changes
      fetchBuilderStats(currentGraphVersion);
      
      // Only refresh graph data if not showing node-specific focus
      // This will cause minimal re-renders since GraphViz is memoized and only updates when actual data changes
      if (!isShowingNodeFocus) {
        if (selectedNodeType) {
          fetchGraphData(selectedNodeType);
        } else {
          fetchGraphData('all');
        }
      } else {
        console.log('Skipping auto-refresh: user is viewing focused node data');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentGraphVersion, builderAuthenticated, selectedNodeType, isShowingNodeFocus]);

  // Refresh versions when window regains focus (user returns to tab)
  useEffect(() => {
    const handleFocus = () => {
      if (builderAuthenticated) {
        fetchAvailableVersions();
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [builderAuthenticated, fetchAvailableVersions]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const resetSelections = () => {
    setSelections({ viewMode: '', industries: [], sectors: [], departments: [], painPoints: [] });
    setScopeChoice('');
    setSectors({});
    setPainPoints([]);
    setCurrentStep(1);
    setBusinessContextSubstep('industries');
    setCurrentSectorPage(0);
    setScopeSubstep('choice');
  };

  // Handle overview card click to navigate to graph view
  const handleOverviewCardClick = (nodeType: string, event?: React.MouseEvent) => {
    // Prevent default behavior and event bubbling
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    console.log(`[App] Node card clicked: ${nodeType}`);
    
    // Store the selected node type and fetch graph data for that type
    setSelectedNodeType(nodeType);
    
    // Show the graph when node card is clicked
    setShouldShowGraph(true);
    
    // Only reset filters if needed, and don't reset everything
    // resetFilters(); // This might be causing issues
    
    // Fetch graph data directly without transformation
    // Backend will handle comprehensive project queries for 'projects'
    fetchGraphData(nodeType);
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const navigateToStep = (stepNumber: number) => {
    // Only allow navigation to completed steps or current step
    if (stepNumber > currentStep) return;

    switch (stepNumber) {
      case 1:
        // Go back to Business Context selection - clear everything after step 1
        setSelections({
          viewMode: '',
          industries: selections.industries, // Keep industry selections
          sectors: [],
          departments: [],
          painPoints: []
        });
        setScopeChoice('');
        setPainPoints([]);
        setCurrentStep(1);
        setBusinessContextSubstep('industries');
        setCurrentSectorPage(0);
        setScopeSubstep('choice');
        // Refetch sectors for current industries to ensure fresh data
        if (selections.industries.length > 0) {
          fetchSectors(selections.industries);
        }
        break;

      case 2:
        // Go back to scope selection - clear pain points and projects
        setSelections({ 
          ...selections, 
          departments: [],
          painPoints: [] 
        });
        setScopeChoice('');
        setPainPoints([]);
        setCurrentStep(2);
        setScopeSubstep('choice');
        break;

      case 3:
        // Go back to pain point selection - clear projects
        setSelections({ ...selections, painPoints: [] });
        setPainPoints([]);
        setCurrentStep(3);
        // Refetch pain points for current selections
        if (selections.sectors.length > 0 || selections.departments.length > 0) {
          fetchPainPointsForCurrentSelections(selections.departments, selections.sectors);
        }
        break;

      default:
        break;
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleSectorToggle = (sectorName: string) => {
    const newSectors = newPainPointForm.sectors.includes(sectorName)
      ? newPainPointForm.sectors.filter(s => s !== sectorName)
      : [...newPainPointForm.sectors, sectorName];
    setNewPainPointForm({...newPainPointForm, sectors: newSectors});
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleDepartmentToggle = (departmentName: string) => {
    const newDepartments = newPainPointForm.departments.includes(departmentName)
      ? newPainPointForm.departments.filter(d => d !== departmentName)
      : [...newPainPointForm.departments, departmentName];
    setNewPainPointForm({...newPainPointForm, departments: newDepartments});
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const removeSectorTag = (sectorName: string) => {
    const newSectors = newPainPointForm.sectors.filter(s => s !== sectorName);
    setNewPainPointForm({...newPainPointForm, sectors: newSectors});
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const removeDepartmentTag = (departmentName: string) => {
    const newDepartments = newPainPointForm.departments.filter(d => d !== departmentName);
    setNewPainPointForm({...newPainPointForm, departments: newDepartments});
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleSuggestPainPointNames = async () => {
    if (newPainPointForm.sectors.length === 0 && newPainPointForm.departments.length === 0) {
      alert('Please select at least one sector or department first');
      return;
    }
    
    // setSuggestingPainPoints(true);
    
    try {
      const versionParam = currentGraphVersion && currentGraphVersion !== 'base' ? `?version=${encodeURIComponent(currentGraphVersion)}` : '';
      const response = await api.post(`/api/suggest-painpoint-names${versionParam}`, {
        sectors: newPainPointForm.sectors,
        departments: newPainPointForm.departments
      });
      
      if (response.ok) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const data = await response.json();
        // setPainPointSuggestions(data.suggestions);
        // setShowPainPointSuggestions(true);
      } else {
        const errorData = await response.json();
        alert(errorData.error || 'Failed to generate suggestions');
      }
    } catch (error) {
      console.error('Error getting pain point suggestions:', error);
      alert('Failed to generate suggestions');
    } finally {
      // setSuggestingPainPoints(false);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleSelectPainPointSuggestion = (suggestion: string) => {
    setNewPainPointForm({ ...newPainPointForm, name: suggestion });
    // setShowPainPointSuggestions(false);
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleSuggestImpact = async () => {
    if (!newPainPointForm.name.trim()) {
      alert('Please enter a pain point name first');
      return;
    }
    
    // setSuggestingImpact(true);
    
    try {
      const response = await api.post('/api/suggest-impact', {
        painPointName: newPainPointForm.name,
        sectors: newPainPointForm.sectors,
        departments: newPainPointForm.departments
      });
      
      if (response.ok) {
        const data = await response.json();
        setNewPainPointForm({
          ...newPainPointForm, 
          impact: data.suggestion
        });
      } else {
        const errorData = await response.json();
        alert(errorData.error || 'Failed to generate suggestion');
      }
    } catch (error) {
      console.error('Error getting impact suggestion:', error);
      alert('Failed to generate suggestion');
    } finally {
      // setSuggestingImpact(false);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleCreatePainPoint = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const payload = {
        ...newPainPointForm,
        departments: newPainPointForm.departments.length > 0 ? newPainPointForm.departments : undefined,
        sectors: newPainPointForm.sectors.length > 0 ? newPainPointForm.sectors : undefined
      };
      
      const response = await api.post('/api/painpoints', payload);
      
      if (response.ok) {
        const newPainPoint = await response.json();
        setPainPoints([...painPoints, newPainPoint]);
        setSelections({...selections, painPoints: [...selections.painPoints, newPainPoint.name]});
        setShowPainPointModal(false);
        setNewPainPointForm({ name: '', impact: '', departments: [], sectors: [] });
        setShowSectorDropdown(false);
        setShowDepartmentDropdown(false);
      } else {
        const errorData = await response.json();
        alert(errorData.error || 'Failed to create pain point');
      }
    } catch (error) {
      console.error('Error creating pain point:', error);
      alert('Failed to create pain point');
    }
  };
  
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const payload = {
        ...newProjectForm,
        sector: selections.sectors.length > 0 ? selections.sectors[0] : undefined,
        department: selections.departments.length > 0 ? selections.departments[0] : undefined,
        painPoint: selections.painPoints.length > 0 ? selections.painPoints[0] : newProjectForm.painPoint
      };
      
      const response = await api.post('/api/projects/create', payload);
      
      if (response.ok) {
        await fetchProjects();
        setShowProjectModal(false);
        setNewProjectForm({
          title: '',
          priority: 'Medium',
          businessCase: '',
          blueprintTitle: '',
          sector: '',
          department: '',
          painPoint: '',
          budgetRange: '',
          duration: '',
          requiredRoles: [],
          subModules: []
        });
      }
    } catch (error) {
      console.error('Error creating project:', error);
    }
  };
  
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const addRequiredRole = () => {
    setNewProjectForm({
      ...newProjectForm,
      requiredRoles: [...newProjectForm.requiredRoles, { name: '', specialty: '' }]
    });
  };
  
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const removeRequiredRole = (index: number) => {
    setNewProjectForm({
      ...newProjectForm,
      requiredRoles: newProjectForm.requiredRoles.filter((_, i) => i !== index)
    });
  };
  
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const updateRequiredRole = (index: number, field: 'name' | 'specialty', value: string) => {
    const updatedRoles = [...newProjectForm.requiredRoles];
    updatedRoles[index] = { ...updatedRoles[index], [field]: value };
    setNewProjectForm({ ...newProjectForm, requiredRoles: updatedRoles });
  };
  
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const addSubModule = () => {
    setNewProjectForm({
      ...newProjectForm,
      subModules: [...newProjectForm.subModules, '']
    });
  };
  
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const removeSubModule = (index: number) => {
    setNewProjectForm({
      ...newProjectForm,
      subModules: newProjectForm.subModules.filter((_, i) => i !== index)
    });
  };
  
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const updateSubModule = (index: number, value: string) => {
    const updatedSubModules = [...newProjectForm.subModules];
    updatedSubModules[index] = value;
    setNewProjectForm({ ...newProjectForm, subModules: updatedSubModules });
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getAllSectors = () => {
    const allSectors: string[] = [];
    Object.values(sectors).forEach(sectorList => {
      sectorList.forEach(sector => {
        if (!allSectors.includes(sector.name)) {
          allSectors.push(sector.name);
        }
      });
    });
    
    // Fallback: if no sectors loaded from dynamic fetch, provide common sectors
    if (allSectors.length === 0) {
      return [
        'Retail Banking',
        'Commercial Banking', 
        'Investment Banking',
        'Insurance',
        'Life Insurance',
        'Property & Casualty'
      ];
    }
    
    return allSectors;
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getAllDepartments = () => {
    // If departments are not loaded yet or empty, return fallback departments immediately
    if (!departments || departments.length === 0) {
      return [
        'Operations',
        'Customer Service',
        'Risk Management', 
        'IT',
        'Finance',
        'Marketing',
        'Sales',
        'Human Resources',
        'Compliance',
        'Legal'
      ];
    }
    
    const allDepartments: string[] = [];
    departments.forEach(department => {
      if (department && department.name && !allDepartments.includes(department.name)) {
        allDepartments.push(department.name);
      }
    });
    
    return allDepartments.length > 0 ? allDepartments : [
      'Operations',
      'Customer Service',
      'Risk Management', 
      'IT',
      'Finance',
      'Marketing',
      'Sales',
      'Human Resources',
      'Compliance',
      'Legal'
    ];
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'High': return '#e74c3c';
      case 'Medium': return '#f39c12';
      default: return '#95a5a6';
    }
  };

  return (
    <div className="app">
      {builderAuthenticated ? (
        <>
        {/* Enhanced Two-Panel Layout */}
        <div className="two-panel-layout">
          {builderLoading ? (
            <div className="builder-loading">
              <div className="spinner"></div>
              <p>Loading...</p>
            </div>
          ) : (
            <>
              {/* Primary Panel - Graph Visualization (Hero Element) */}
              <div className="primary-panel">
                {isAssistantUpdatingGraph && (
                  <div className="assistant-update-indicator">
                    <div className="assistant-update-message">
                      <span className="assistant-icon">🤖</span>
                      <span>The assistant is updating the graph visualization...</span>
                    </div>
                  </div>
                )}
                
                <GraphHeroSection
                  graphLoading={graphLoading}
                  showGraphSection={showGraphSection}
                  graphData={graphData}
                  hasGraphData={hasGraphData}
                  handleGraphNodeSelect={handleGraphNodeSelect}
                  handleGraphNodeEdit={handleGraphNodeEdit}
                  handleNavigateToNode={handleNavigateToNode}
                  focusedGraphNode={focusedGraphNode}
                  currentGraphVersion={currentGraphVersion}
                  handleGraphDataUpdate={handleGraphDataUpdate}
                  handleExampleQuestionClick={handleExampleQuestionClick}
                  availableVersions={availableVersions}
                  onVersionChange={setCurrentGraphVersion}
                  onManageVersions={() => setShowManageVersionsModal(true)}
                />
                
                {/* Node Cards - Horizontal layout under graph */}
                <div className="node-cards-horizontal">
                  <button
                    type="button"
                    className="node-card industry-node clickable" 
                    onClick={(e) => handleOverviewCardClick('industries', e)}
                  >
                    <div className="node-circle industry-gradient">
                      <span className="node-icon">🏭</span>
                      <span className="node-count">
                        {getNodeCount('Industry')}
                      </span>
                    </div>
                    <span className="node-label">Industries</span>
                  </button>
                  <button
                    type="button"
                    className="node-card sector-node clickable" 
                    onClick={(e) => handleOverviewCardClick('sectors', e)}
                  >
                    <div className="node-circle sector-gradient">
                      <span className="node-icon">🏛️</span>
                      <span className="node-count">{getNodeCount('Sector')}</span>
                    </div>
                    <span className="node-label">Sectors</span>
                  </button>
                  <button
                    type="button"
                    className="node-card department-node clickable" 
                    onClick={(e) => handleOverviewCardClick('departments', e)}
                  >
                    <div className="node-circle department-gradient">
                      <span className="node-icon">🏢</span>
                      <span className="node-count">{getNodeCount('Department')}</span>
                    </div>
                    <span className="node-label">Departments</span>
                  </button>
                  <button
                    type="button"
                    className="node-card painpoint-node clickable" 
                    onClick={(e) => handleOverviewCardClick('painpoints', e)}
                  >
                    <div className="node-circle painpoint-gradient">
                      <span className="node-icon">⚠️</span>
                      <span className="node-count">{getNodeCount('PainPoint')}</span>
                    </div>
                    <span className="node-label">Pain Points</span>
                  </button>
                  <button
                    type="button"
                    className="node-card project-node clickable" 
                    onClick={(e) => handleOverviewCardClick('projects', e)}
                  >
                    <div className="node-circle project-gradient">
                      <span className="node-icon">🚀</span>
                      <span className="node-count">{getNodeCount('ProjectOpportunity')}</span>
                    </div>
                    <span className="node-label">Projects</span>
                  </button>
                  <button
                    type="button"
                    className="node-card all-nodes-node clickable" 
                    onClick={(e) => handleOverviewCardClick('all', e)}
                  >
                    <div className="node-circle all-nodes-gradient">
                      <span className="node-icon">*</span>
                      <span className="node-count">
                        {getTotalNodeCount()}
                      </span>
                    </div>
                    <span className="node-label">All Nodes</span>
                  </button>
                </div>
              </div>

              {/* Secondary Panel - Tabbed Interface */}
              <div className="secondary-panel">
                {/* Tab Navigation */}
                <div className="tab-navigation">
                  <button 
                    className={`tab ${activeRightTab === 'assistant' ? 'active' : ''}`}
                    onClick={() => setActiveRightTab('assistant')}
                  >
                    🤖 AI Assistant
                  </button>
                  <button 
                    className={`tab ${activeRightTab === 'nodeDetails' ? 'active' : ''}`}
                    onClick={() => setActiveRightTab('nodeDetails')}
                  >
                    📊 Node Details
                  </button>
                </div>
                
                {/* Tab Content */}
                <div className="tab-content">
                  {activeRightTab === 'assistant' && (
                    <div className="chat-window">
                      <ChatInterface
                        ref={chatInterfaceRef}
                        onApplyQueryResult={handleApplyQueryResult}
                        onNavigateToNode={handleNavigateToNode}
                        graphContext={{
                          currentNodeType: selectedNodeType || 'all',
                          graphVersion: currentGraphVersion
                        }}
                      />
                    </div>
                  )}
                  
                  {activeRightTab === 'nodeDetails' && (
                    <div className="node-details-content">
                      {selectedNodeForDetails ? (
                        <>
                          <div className="detail-section">
                            <h4>Type</h4>
                            <p>{selectedNodeForDetails.labels ? selectedNodeForDetails.labels.join(', ') : selectedNodeForDetails.group || 'Unknown'}</p>
                          </div>
                          
                          {selectedNodeForDetails.properties && (
                            <div className="detail-section">
                              <h4>Properties</h4>
                              <div className="properties-list">
                                {Object.entries(selectedNodeForDetails.properties).map(([key, value]) => (
                                  <div key={key} className="property-item">
                                    <span className="property-key">{key}:</span>
                                    <span className="property-value">{String(value)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {selectedNodeForDetails.identity && (
                            <div className="detail-section">
                              <h4>ID</h4>
                              <p>{String(selectedNodeForDetails.identity)}</p>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="empty-state">
                          <div className="empty-state-content">
                            <div className="empty-state-icon">📊</div>
                            <h3>Node Details</h3>
                            <p>Click on a node in the graph to view its details and connections</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

            </>
          )}
        </div>
        </>
      ) : null}
      {/* Builder Modals - Always available when authenticated */}
      {builderAuthenticated && (
        <>
          {showBuilderNodeModal && (
            <div className="modal-backdrop" onClick={() => setShowBuilderNodeModal(false)}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h2>Add New {builderNodeForm.type}</h2>
                  <button className="modal-close" onClick={() => setShowBuilderNodeModal(false)}>×</button>
                </div>
                
                <form onSubmit={handleCreateNode}>
                  <div className="form-group">
                    <label className="form-label">Name *</label>
                    <input
                      type="text"
                      className="form-input"
                      value={builderNodeForm.name}
                      onChange={(e) => setBuilderNodeForm({...builderNodeForm, name: e.target.value})}
                      required
                      placeholder={`Enter ${builderNodeForm.type} name`}
                    />
                  </div>
                  
                  {(builderNodeForm.type === 'painpoint') && (
                    <div className="form-group">
                      <label className="form-label">Impact Description</label>
                      <textarea
                        className="form-textarea"
                        value={builderNodeForm.impact}
                        onChange={(e) => setBuilderNodeForm({...builderNodeForm, impact: e.target.value})}
                        placeholder="Describe the business impact"
                      />
                    </div>
                  )}
                  
                  <div className="modal-actions">
                    <button type="button" className="modal-btn modal-btn-secondary" onClick={() => setShowBuilderNodeModal(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="modal-btn modal-btn-primary" disabled={builderLoading || !builderNodeForm.name}>
                      {builderLoading ? 'Creating...' : 'Create'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {showBuilderEditModal && (
            <div className="modal-backdrop" onClick={() => setShowBuilderEditModal(false)}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h2>Edit {'nodes'.slice(0, -1)}</h2>
                  <button className="modal-close" onClick={() => setShowBuilderEditModal(false)}>×</button>
                </div>
                
                <form onSubmit={handleUpdateNode}>
                  <div className="form-group">
                    <label className="form-label">Name *</label>
                    <input
                      type="text"
                      className="form-input"
                      value={builderNodeForm.name}
                      onChange={(e) => setBuilderNodeForm({...builderNodeForm, name: e.target.value})}
                      required
                      placeholder={`Enter ${'nodes'.slice(0, -1)} name`}
                    />
                  </div>
                  
                  {false && ( // Disabled: (builderActiveSection === 'painpoints') but builderActiveSection was removed
                    <div className="form-group">
                      <label className="form-label">Impact Description</label>
                      <textarea
                        className="form-textarea"
                        value={builderNodeForm.impact}
                        onChange={(e) => setBuilderNodeForm({...builderNodeForm, impact: e.target.value})}
                        placeholder="Describe the business impact"
                      />
                    </div>
                  )}
                  
                  <div className="modal-actions">
                    <button type="button" className="modal-btn modal-btn-secondary" onClick={() => setShowBuilderEditModal(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="modal-btn modal-btn-primary" disabled={builderLoading || !builderNodeForm.name}>
                      {builderLoading ? 'Updating...' : 'Update'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

        </>
      )}

      {/* Import Graph Modal */}
      {showImportModal && (
        <div className="modal-backdrop" onClick={() => setShowImportModal(false)}>
          <div className="modal-content import-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Import Catalog Data</h2>
              <button className="modal-close" onClick={() => setShowImportModal(false)}>×</button>
            </div>
            
            <div className="import-content">
              <div className="import-info">
                <p>Import a Cypher script to create a new catalog version. The import will validate the schema and create a separate version that can be promoted to base later.</p>
              </div>
              
              
              {!importResult && (
                <form onSubmit={(e) => { e.preventDefault(); handleImportGraph(); }}>
                  <div className="form-group">
                    <label className="form-label">Version Name *</label>
                    <input
                      type="text"
                      className="form-input"
                      value={importVersionName}
                      onChange={(e) => setImportVersionName(e.target.value)}
                      placeholder="e.g. import-2024-01-15"
                      required
                      disabled={importLoading}
                    />
                    <small className="form-help">Choose a unique name for this import version</small>
                  </div>
                  
                  <div className="form-group">
                    <label className="form-label">Cypher File *</label>
                    <input
                      type="file"
                      className="form-input file-input"
                      accept=".cypher,.cql,.txt"
                      onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                      required
                      disabled={importLoading}
                    />
                    <small className="form-help">Select a .cypher file exported from this system</small>
                  </div>
                  
                  {importValidationErrors.length > 0 && (
                    <div className="import-errors">
                      <h4>🔍 Schema Validation Issues ({importValidationErrors.length} found):</h4>
                      <div className="validation-errors-list">
                        {importValidationErrors.map((error, index) => (
                          <div key={index} className="validation-error-item">
                            <span className="error-icon">⚠️</span>
                            <span className="error-text">{error}</span>
                          </div>
                        ))}
                      </div>
                      <div className="validation-help">
                        <p><strong>💡 How to fix these issues:</strong></p>
                        <ul>
                          <li>Check that all node types match: Industry, Sector, Department, PainPoint, ProjectOpportunity, Role, SubModule, Module</li>
                          <li>Ensure all relationship types are valid: HAS_SECTOR, EXPERIENCES, ADDRESSES, REQUIRES_ROLE, CONTAINS, USES_MODULE</li>
                          <li>Include required properties: 'name' for most nodes, 'title' for ProjectOpportunity</li>
                        </ul>
                      </div>
                    </div>
                  )}
                  
                  <div className="import-actions">
                    <button 
                      type="button"
                      className="modal-btn modal-btn-secondary"
                      onClick={() => setShowImportModal(false)}
                      disabled={importLoading}
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit"
                      className="modal-btn modal-btn-primary"
                      disabled={importLoading || !importFile || !importVersionName.trim()}
                    >
                      {importLoading ? '⏳ Importing...' : '📥 Import Catalog'}
                    </button>
                  </div>
                </form>
              )}
              
              {importResult && (
                <div className={`import-result ${importResult.success ? 'success' : 'error'}`}>
                  <div className="result-message">
                    {importResult.message.split('\n').map((line, index) => (
                      <div key={index}>{line}</div>
                    ))}
                  </div>
                  
                  {importResult.success && importResult.versionName && (
                    <div className="import-success-actions">
                      <button 
                        className="modal-btn modal-btn-primary"
                        onClick={() => {
                          setCurrentGraphVersion(importResult.versionName!);
                          setShowImportModal(false);
                          setImportResult(null);
                        }}
                      >
                        👁️ View Version
                      </button>
                    </div>
                  )}
                  
                  {!importResult.success && (
                    <div className="import-error-actions">
                      <button 
                        className="modal-btn modal-btn-secondary"
                        onClick={() => {
                          setImportResult(null);
                          setImportValidationErrors([]);
                        }}
                      >
                        ← Try Again
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Manage Versions Modal */}
      {showManageVersionsModal && (
        <div className="modal-backdrop" onClick={() => {
          setShowManageVersionsModal(false);
          fetchAvailableVersions(); // Refresh versions when closing modal
        }}>
          <div className="modal-content manage-versions-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>🗂️ Manage Catalog Versions</h2>
              <button className="modal-close" onClick={() => {
                setShowManageVersionsModal(false);
                fetchAvailableVersions(); // Refresh versions when closing modal
              }}>×</button>
            </div>
            
            <div className="manage-versions-content">
              <div className="manage-versions-info">
                <p>Manage your catalog versions. You can view or delete versions. API calls will use the currently selected version.</p>
              </div>
              
              {availableVersions.length === 0 ? (
                <div className="no-versions-message">
                  <p>🔒 No versions available. Import data to create catalog versions.</p>
                </div>
              ) : availableVersions.length === 1 ? (
                <div className="no-versions-message">
                  <p>🔒 Only one version exists ({availableVersions[0]}). Import new data to create additional versions.</p>
                </div>
              ) : (
                <div className="versions-list">
                  {availableVersions.map(version => (
                    <div key={version} className={`version-item ${version === 'base' ? 'base-version' : ''}`}>
                      <div className="version-info">
                        <span className="version-name">
                          {version === 'base' ? '📂 Base' : `📦 ${version}`}
                        </span>
                        {currentGraphVersion === version && (
                          <span className="version-badge current">Viewing</span>
                        )}
                      </div>
                      
                      <div className="version-actions">
                        {/* View button - always available */}
                        <button
                          className="version-action-btn view"
                          onClick={() => {
                            setCurrentGraphVersion(version);
                            setShowManageVersionsModal(false);
                          }}
                          title={`View ${version} version`}
                        >
                          👁️ View
                        </button>
                        
                        {/* Delete button - available for all versions */}
                        <button
                          className="version-action-btn delete"
                          onClick={() => handleDeleteVersion(version)}
                          title="Delete this version"
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              <div className="manage-versions-footer">
                <div className="manage-versions-actions">
                  {(currentGraphVersion === 'base' || (availableVersions.length === 1 && !currentGraphVersion.includes('draft'))) && (
                    <button 
                      className="modal-btn modal-btn-primary"
                      onClick={createDraftVersion}
                      disabled={builderLoading}
                      title="Create Draft Version"
                    >
                      📝 Create Draft
                    </button>
                  )}
                  
                  <button 
                    className="modal-btn modal-btn-primary"
                    onClick={() => {
                      setShowManageVersionsModal(false);
                      setShowImportModal(true);
                    }}
                    title="Import Catalog Data"
                  >
                    📥 Import
                  </button>
                  
                  <button 
                    className="modal-btn modal-btn-primary"
                    onClick={() => {
                      setShowManageVersionsModal(false);
                      handleExportGraph();
                    }}
                    disabled={exportLoading}
                    title="Export Current Catalog"
                  >
                    {exportLoading ? '⏳' : '📤'} Export
                  </button>
                </div>
                
                <button 
                  className="modal-btn modal-btn-secondary"
                  onClick={() => setShowManageVersionsModal(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default App;