import React, { useState, useEffect, useCallback } from 'react';
import { Industry, Sector, Department, PainPoint, Project, SelectionState, NewPainPointForm, NewProjectForm } from './types';
import GraphViz from './GraphViz';
import './App.css';

const App: React.FC = () => {
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [sectors, setSectors] = useState<{[key: string]: Sector[]}>({});
  const [departments, setDepartments] = useState<Department[]>([]);
  const [painPoints, setPainPoints] = useState<PainPoint[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [sectorsLoading, setSectorsLoading] = useState(false);
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
  const [suggestingImpact, setSuggestingImpact] = useState(false);
  const [suggestingPainPoints, setSuggestingPainPoints] = useState(false);
  const [showPainPointSuggestions, setShowPainPointSuggestions] = useState(false);
  const [painPointSuggestions, setPainPointSuggestions] = useState<string[]>([]);
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

  // Builder mode state
  const [isBuilderMode, setIsBuilderMode] = useState(false);
  const [builderAuthenticated, setBuilderAuthenticated] = useState(false);
  const [builderActiveSection, setBuilderActiveSection] = useState('overview');
  const [selectedNodeType, setSelectedNodeType] = useState<string | null>(null);
  const [builderStats, setBuilderStats] = useState<any>(null);
  const [builderNodes, setBuilderNodes] = useState<any[]>([]);
  const [builderLoading, setBuilderLoading] = useState(false);
  const [currentGraphVersion, setCurrentGraphVersion] = useState('base');
  const [availableVersions, setAvailableVersions] = useState<string[]>(['base']);
  
  // Builder modals and forms
  const [showBuilderNodeModal, setShowBuilderNodeModal] = useState(false);
  const [showBuilderEditModal, setShowBuilderEditModal] = useState(false);
  const [showSmartUpdateModal, setShowSmartUpdateModal] = useState(false);
  const [builderNodeForm, setBuilderNodeForm] = useState<any>({});
  const [editingNode, setEditingNode] = useState<any>(null);
  
  // Smart Update feature state
  const [smartUpdateInput, setSmartUpdateInput] = useState('');
  const [generatedCypher, setGeneratedCypher] = useState('');
  const [smartUpdateLoading, setSmartUpdateLoading] = useState(false);
  const [smartUpdateStep, setSmartUpdateStep] = useState<'input' | 'preview' | 'apply'>('input');
  const [previewData, setPreviewData] = useState<any>(null);
  const [conversationHistory, setConversationHistory] = useState<any[]>([]);
  const [currentIteration, setCurrentIteration] = useState(0);
  const [feedbackInput, setFeedbackInput] = useState('');
  
  // Graph visualization state
  const [viewMode, setViewMode] = useState<'graph'>('graph');
  const [graphData, setGraphData] = useState<{ nodes: any[], edges: any[] }>({ nodes: [], edges: [] });
  const [graphLoading, setGraphLoading] = useState(false);
  const [focusedGraphNode, setFocusedGraphNode] = useState<string | null>(null);
  
  // Graph filter state
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([]);
  const [selectedSector, setSelectedSector] = useState<string>('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [availableIndustries, setAvailableIndustries] = useState<string[]>([]);
  const [availableSectors, setAvailableSectors] = useState<string[]>([]);
  const [availableDepartments, setAvailableDepartments] = useState<string[]>([]);

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
  }, [showPainPointModal, selections.departments, selections.sectors]);

  // Keyboard support for modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showPainPointSuggestions) {
          setShowPainPointSuggestions(false);
        } else if (showPainPointModal) {
          setShowPainPointModal(false);
        } else if (showProjectModal) {
          setShowProjectModal(false);
        } else if (showSmartUpdateModal) {
          setShowSmartUpdateModal(false);
          resetSmartUpdate();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showPainPointSuggestions, showPainPointModal, showProjectModal, showSmartUpdateModal]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('.multiselect-container')) {
        setShowSectorDropdown(false);
        setShowDepartmentDropdown(false);
      }
      if (!target.closest('.name-suggestion-container')) {
        setShowPainPointSuggestions(false);
      }
    };

    if (showSectorDropdown || showDepartmentDropdown || showPainPointSuggestions) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showSectorDropdown, showDepartmentDropdown, showPainPointSuggestions]);

  const fetchIndustries = async () => {
    try {
      const versionParam = currentGraphVersion && currentGraphVersion !== 'base' ? `?version=${encodeURIComponent(currentGraphVersion)}` : '';
      const response = await fetch(`/api/industries${versionParam}`);
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
    
    setSectorsLoading(true);
    try {
      const response = await fetch('/api/sectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ industries: selectedIndustries })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setSectors(data);
    } catch (error) {
      console.error('Error fetching sectors:', error);
      setSectors({}); // Clear sectors on error
    } finally {
      setSectorsLoading(false);
    }
  };

  const fetchDepartments = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/departments');
      const data = await response.json();
      setDepartments(data);
    } catch (error) {
      console.error('Error fetching departments:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selections)
      });
      const data = await response.json();
      setProjects(data);
      setCurrentStep(4); // Go to step 4 for projects
    } catch (error) {
      console.error('Error fetching projects:', error);
    } finally {
      setLoading(false);
    }
  };

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
      setProjects([]);
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
        const response = await fetch('/api/department-painpoints', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ departments })
        });
        const deptPainPoints = await response.json();
        setPainPoints(deptPainPoints);
      } catch (error) {
        console.error('Error fetching department pain points:', error);
      }
    } else if (sectors.length > 0) {
      // If no departments selected, fall back to sector pain points
      try {
        const response = await fetch('/api/sector-painpoints', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sectors })
        });
        const sectorPainPoints = await response.json();
        setPainPoints(sectorPainPoints);
      } catch (error) {
        console.error('Error fetching sector pain points:', error);
      }
    }
  };

  const handleSectorSelection = (sectorName: string) => {
    const newSectors = selections.sectors.includes(sectorName)
      ? selections.sectors.filter(s => s !== sectorName)
      : [...selections.sectors, sectorName];
    
    setSelections({ ...selections, sectors: newSectors });
  };

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

  const handleDepartmentSelection = (departmentName: string) => {
    const newDepartments = selections.departments.includes(departmentName)
      ? selections.departments.filter(d => d !== departmentName)
      : [...selections.departments, departmentName];
    
    setSelections({ ...selections, departments: newDepartments });
  };

  const handleDepartmentNext = () => {
    if (selections.departments.length > 0 && scopeChoice === 'departments') {
      fetchPainPointsForCurrentSelections(selections.departments, selections.sectors);
      setCurrentStep(3);
    }
  };

  const handleBackToScopeChoice = () => {
    setScopeSubstep('choice');
    setScopeChoice('');
    setSelections({ ...selections, departments: [] });
  };

  const handleBackToBusinessContext = () => {
    setCurrentStep(1);
    setBusinessContextSubstep('sectors');
    setCurrentSectorPage(selections.industries.length - 1);
    setScopeChoice('');
    setSelections({ ...selections, departments: [] });
  };

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

  const handlePainPointSelection = (painPointName: string) => {
    const newPainPoints = selections.painPoints.includes(painPointName)
      ? selections.painPoints.filter(p => p !== painPointName)
      : [...selections.painPoints, painPointName];
    
    setSelections({ ...selections, painPoints: newPainPoints });
  };

  const handleProceedToSectors = () => {
    // Ensure sectors are loaded for selected industries
    if (selections.industries.length > 0) {
      fetchSectors(selections.industries);
    }
    setBusinessContextSubstep('sectors');
    setCurrentSectorPage(0);
  };

  const handleNextSectorPage = () => {
    if (currentSectorPage < selections.industries.length - 1) {
      setCurrentSectorPage(currentSectorPage + 1);
    }
  };

  const handlePreviousSectorPage = () => {
    if (currentSectorPage > 0) {
      setCurrentSectorPage(currentSectorPage - 1);
    } else {
      // Go back to industry selection
      setBusinessContextSubstep('industries');
    }
  };

  const handleProceedToScope = () => {
    if (selections.sectors.length > 0) {
      setCurrentStep(2);
    }
  };

  // Builder mode functions
  const handleBuilderToggle = () => {
    setIsBuilderMode(!isBuilderMode);
    if (!isBuilderMode) {
      setBuilderAuthenticated(true); // Auto-authenticate when entering builder mode
    } else {
      setBuilderAuthenticated(false);
    }
  };

  // Builder API functions
  const fetchBuilderStats = async (version = currentGraphVersion) => {
    setBuilderLoading(true);
    try {
      const response = await fetch(`/api/admin/stats?version=${version}`);
      const stats = await response.json();
      setBuilderStats(stats);
    } catch (error) {
      console.error('Error fetching admin stats:', error);
    } finally {
      setBuilderLoading(false);
    }
  };

  const fetchBuilderNodes = async (nodeType: string, version = currentGraphVersion) => {
    setBuilderLoading(true);
    try {
      const response = await fetch(`/api/admin/nodes/${nodeType}?version=${version}`);
      const nodes = await response.json();
      setBuilderNodes(nodes);
    } catch (error) {
      console.error('Error fetching admin nodes:', error);
    } finally {
      setBuilderLoading(false);
    }
  };

  const createDraftVersion = async () => {
    setBuilderLoading(true);
    try {
      const response = await fetch('/api/admin/versions/create-draft', {
        method: 'POST'
      });
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

  const resetToBase = async () => {
    if (!window.confirm('Are you sure you want to delete the draft and reset to base? All changes will be lost.')) {
      return;
    }
    
    setBuilderLoading(true);
    try {
      const response = await fetch('/api/admin/versions/draft', {
        method: 'DELETE'
      });
      const result = await response.json();
      if (response.ok) {
        alert('Reset to base successfully!');
        setCurrentGraphVersion('base');
        await fetchAvailableVersions();
        await fetchBuilderStats('base');
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      console.error('Error resetting to base:', error);
      alert('Error resetting to base');
    } finally {
      setBuilderLoading(false);
    }
  };

  // Admin node management functions
  const handleAddNewNode = (nodeType: string) => {
    if (currentGraphVersion === 'base') {
      alert('Please create a draft version first to add new nodes');
      return;
    }
    
    setBuilderNodeForm({
      type: nodeType,
      name: '',
      impact: ''
    });
    setShowBuilderNodeModal(true);
  };

  const handleEditNode = (node: any) => {
    if (currentGraphVersion === 'base') {
      alert('Please create a draft version first to edit nodes');
      return;
    }
    
    setEditingNode(node);
    setBuilderNodeForm({
      type: builderActiveSection,
      name: node.properties.name || node.properties.title,
      impact: node.properties.impact || ''
    });
    setShowBuilderEditModal(true);
  };

  const handleDeleteNode = async (nodeId: string) => {
    if (currentGraphVersion === 'base') {
      alert('Please create a draft version first to delete nodes');
      return;
    }
    
    if (!window.confirm('Are you sure you want to delete this node?')) {
      return;
    }
    
    setBuilderLoading(true);
    try {
      const response = await fetch(`/api/admin/nodes/${builderActiveSection}/${nodeId}?version=${currentGraphVersion}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        await fetchBuilderNodes(builderActiveSection, currentGraphVersion);
        await fetchBuilderStats(currentGraphVersion);
      } else {
        const error = await response.json();
        alert(`Error deleting node: ${error.error}`);
      }
    } catch (error) {
      console.error('Error deleting node:', error);
      alert('Failed to delete node');
    } finally {
      setBuilderLoading(false);
    }
  };

  const handleCreateNode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBuilderLoading(true);
    
    try {
      const response = await fetch(`/api/admin/nodes/${builderNodeForm.type}?version=${currentGraphVersion}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: builderNodeForm.name,
          impact: builderNodeForm.impact
        })
      });
      
      if (response.ok) {
        setShowBuilderNodeModal(false);
        setBuilderNodeForm({});
        await fetchBuilderNodes(builderActiveSection, currentGraphVersion);
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
      const response = await fetch(`/api/admin/nodes/${builderActiveSection}/${editingNode.id}?version=${currentGraphVersion}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: builderNodeForm.name,
          impact: builderNodeForm.impact
        })
      });
      
      if (response.ok) {
        setShowBuilderEditModal(false);
        setEditingNode(null);
        setBuilderNodeForm({});
        await fetchBuilderNodes(builderActiveSection, currentGraphVersion);
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
      const response = await fetch(`/api/admin/export?version=${currentGraphVersion}`);
      
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
      
      const response = await fetch(`/api/admin/import?versionName=${encodeURIComponent(importVersionName.trim())}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: fileContent,
      });

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

  const handlePromoteVersion = async (versionName: string) => {
    if (!window.confirm(`Are you sure you want to promote '${versionName}' to base? This will backup the current base graph.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/promote/${encodeURIComponent(versionName)}`, {
        method: 'POST',
      });

      const result = await response.json();

      if (response.ok) {
        alert(`✅ Version promoted successfully!\n\nNew base: ${versionName}\nBackup created: ${result.backupName}`);
        
        // Refresh available versions and switch to base
        await fetchAvailableVersions();
        setCurrentGraphVersion('base');
      } else {
        alert(`❌ Promotion failed: ${result.error}`);
      }
    } catch (error) {
      console.error('Promotion error:', error);
      alert('❌ Failed to promote version. Please check the console for details.');
    }
  };

  const handleDeleteVersion = async (versionName: string) => {
    if (versionName === 'base') {
      alert('❌ Cannot delete the base version');
      return;
    }

    if (!window.confirm(`⚠️ Are you sure you want to delete version '${versionName}'?\n\nThis action cannot be undone and will permanently remove all data in this version.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/versions/${encodeURIComponent(versionName)}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (response.ok) {
        alert(`✅ Version deleted successfully!\n\nDeleted version: ${versionName}\nNodes removed: ${result.deletedNodes}`);
        
        // Refresh available versions
        await fetchAvailableVersions();
        
        // If we were viewing the deleted version, switch to base
        if (currentGraphVersion === versionName) {
          setCurrentGraphVersion('base');
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

  const fetchAvailableVersions = async () => {
    try {
      const response = await fetch('/api/admin/versions');
      if (response.ok) {
        const versions = await response.json();
        setAvailableVersions(versions);
      }
    } catch (error) {
      console.error('Error fetching versions:', error);
    }
  };

  // Smart Update API functions
  const generateCypherQuery = async (naturalLanguage: string) => {
    setSmartUpdateLoading(true);
    try {
      const response = await fetch('/api/smart-update/generate-cypher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          naturalLanguageUpdate: naturalLanguage,
          version: currentGraphVersion,
          conversationHistory: conversationHistory
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate Cypher query');
      }
      
      const data = await response.json();
      setGeneratedCypher(data.cypherQuery);
      setSmartUpdateStep('preview');
      setCurrentIteration(prev => prev + 1);
      return data.cypherQuery;
    } catch (error) {
      console.error('Error generating Cypher:', error);
      alert(error instanceof Error ? error.message : 'Failed to generate Cypher query');
    } finally {
      setSmartUpdateLoading(false);
    }
  };

  const generatePreview = async (cypherQuery: string) => {
    setSmartUpdateLoading(true);
    try {
      const response = await fetch('/api/smart-update/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cypherQuery,
          version: currentGraphVersion
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate preview');
      }
      
      const data = await response.json();
      setPreviewData(data);
      return data;
    } catch (error) {
      console.error('Error generating preview:', error);
      alert(error instanceof Error ? error.message : 'Failed to generate preview');
    } finally {
      setSmartUpdateLoading(false);
    }
  };

  const applySmartUpdate = async (cypherQuery: string, versionName: string) => {
    setSmartUpdateLoading(true);
    try {
      const response = await fetch('/api/smart-update/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cypherQuery,
          version: currentGraphVersion,
          newVersionName: versionName
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to apply update');
      }
      
      const data = await response.json();
      
      // Refresh available versions and switch to new version
      await fetchAvailableVersions();
      setCurrentGraphVersion(data.newVersion);
      
      // Reset smart update state
      setSmartUpdateInput('');
      setGeneratedCypher('');
      setPreviewData(null);
      setSmartUpdateStep('input');
      setShowSmartUpdateModal(false);
      
      // Refresh graph data
      if (builderActiveSection !== 'overview') {
        await fetchGraphData(builderActiveSection);
      }
      
      alert(`Update applied successfully! New version: ${data.newVersion}`);
      return data;
    } catch (error) {
      console.error('Error applying smart update:', error);
      alert(error instanceof Error ? error.message : 'Failed to apply update');
    } finally {
      setSmartUpdateLoading(false);
    }
  };

  const resetSmartUpdate = () => {
    setSmartUpdateInput('');
    setGeneratedCypher('');
    setPreviewData(null);
    setSmartUpdateStep('input');
    setSmartUpdateLoading(false);
    setConversationHistory([]);
    setCurrentIteration(0);
    setFeedbackInput('');
  };

  const refineSmartUpdate = async (feedback: string) => {
    setSmartUpdateLoading(true);
    try {
      const response = await fetch('/api/smart-update/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalRequest: smartUpdateInput,
          currentCypher: generatedCypher,
          feedback: feedback,
          conversationHistory: conversationHistory,
          version: currentGraphVersion
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to refine Cypher query');
      }
      
      const data = await response.json();
      setGeneratedCypher(data.refinedCypher);
      setConversationHistory(data.conversationHistory);
      setCurrentIteration(prev => prev + 1);
      setFeedbackInput('');
      setPreviewData(null); // Reset preview to show updated query
      
      return data.refinedCypher;
    } catch (error) {
      console.error('Error refining Cypher:', error);
      alert(error instanceof Error ? error.message : 'Failed to refine Cypher query');
    } finally {
      setSmartUpdateLoading(false);
    }
  };

  // Fetch graph data for visualization
  const fetchGraphData = useCallback(async (nodeType: string) => {
    setGraphLoading(true);
    setFocusedGraphNode(null); // Reset focused node when loading new data
    
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
      
      // For 'all' node type, fetch comprehensive graph data
      const endpoint = nodeType === 'all' ? 'industries' : nodeType;
      const response = await fetch(`/api/admin/graph/${endpoint}?${params.toString()}`);
      
      if (response.ok) {
        const data = await response.json();
        setGraphData({
          nodes: data.nodes,
          edges: data.edges
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
  };

  // Handle node double-click in graph (center and show connections)
  const handleGraphNodeEdit = async (nodeId: string, nodeData: any) => {
    // Prevent multiple calls if already loading
    if (graphLoading) {
      return;
    }
    
    console.log(`Double-clicked node: ${nodeId} (${nodeData.label})`);
    setGraphLoading(true);
    
    try {
      // Fetch the node's direct connections from the API
      const response = await fetch(`/api/admin/node/${nodeId}/graph?version=${currentGraphVersion}`);
      
      if (response.ok) {
        const data = await response.json();
        
        console.log(`API returned ${data.nodes.length} nodes and ${data.edges.length} edges for node ${nodeId}`);
        
        // Add a small delay to ensure the loading screen is visible
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Center the clicked node and show only its direct connections
        setGraphData({
          nodes: data.nodes,
          edges: data.edges
        });
        
        // Set the focused node to highlight it
        setFocusedGraphNode(nodeId);
        
        console.log(`Successfully updated graph for node ${nodeId}`);
      } else {
        const error = await response.json();
        console.error('Error fetching node connections:', error);
        alert(`Error loading connections: ${error.error}`);
      }
    } catch (error) {
      console.error('Failed to fetch node connections:', error);
      alert('Failed to load node connections');
    } finally {
      setGraphLoading(false);
    }
  };

  // Handle navigation to specific node in graph
  const handleNavigateToNode = async (nodeId: string) => {
    setGraphLoading(true);
    try {
      const response = await fetch(`/api/admin/node/${nodeId}/graph?version=${currentGraphVersion}`);
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

  // Load filter options
  const loadFilterOptions = async () => {
    try {
      // Load industries
      const industriesResponse = await fetch('/api/industries');
      if (industriesResponse.ok) {
        const industriesData = await industriesResponse.json();
        setAvailableIndustries(industriesData.map((i: any) => i.name));
      }

      // Load departments
      const departmentsResponse = await fetch('/api/departments');
      if (departmentsResponse.ok) {
        const departmentsData = await departmentsResponse.json();
        setAvailableDepartments(departmentsData.map((d: any) => d.name));
      }

      // Load sectors (all sectors initially)
      if (industries.length > 0) {
        const sectorsResponse = await fetch('/api/sectors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ industries: industries.map(i => i.name) })
        });
        if (sectorsResponse.ok) {
          const sectorsData = await sectorsResponse.json();
          const allSectors = Object.values(sectorsData).flat() as any[];
          setAvailableSectors(allSectors.map((s: any) => s.name));
        }
      }
    } catch (error) {
      console.error('Failed to load filter options:', error);
    }
  };

  // Reset filters when changing tabs
  const resetFilters = () => {
    setSelectedIndustries([]);
    setSelectedSector('');
    setSelectedDepartment('');
  };

  // Handle filter changes
  const handleIndustryToggle = (industry: string) => {
    setSelectedIndustries(prev => {
      const newSelection = prev.includes(industry)
        ? prev.filter(i => i !== industry)
        : [...prev, industry];
      
      // Reset sector when industry selection changes
      setSelectedSector('');
      
      // Reload sectors for the selected industries
      if (newSelection.length > 0) {
        loadSectorsForIndustries(newSelection);
      } else {
        setAvailableSectors([]);
      }
      
      return newSelection;
    });
  };

  const loadSectorsForIndustries = async (industries: string[]) => {
    try {
      const sectorsResponse = await fetch('/api/sectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ industries })
      });
      if (sectorsResponse.ok) {
        const sectorsData = await sectorsResponse.json();
        const allSectors = Object.values(sectorsData).flat() as any[];
        setAvailableSectors(allSectors.map((s: any) => s.name));
      }
    } catch (error) {
      console.error('Failed to load sectors for industries:', error);
    }
  };

  const loadSectorsForIndustry = async (industry: string) => {
    try {
      const sectorsResponse = await fetch('/api/sectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ industries: [industry] })
      });
      if (sectorsResponse.ok) {
        const sectorsData = await sectorsResponse.json();
        const sectors = sectorsData[industry] || [];
        setAvailableSectors(sectors.map((s: any) => s.name));
      }
    } catch (error) {
      console.error('Failed to load sectors for industry:', error);
    }
  };

  // Load builder data when entering builder mode
  useEffect(() => {
    if (isBuilderMode && builderAuthenticated) {
      fetchAvailableVersions();
      fetchBuilderStats();
      loadFilterOptions();
    }
  }, [isBuilderMode, builderAuthenticated]);

  // Reload graph data when filters change
  useEffect(() => {
    if (isBuilderMode && builderAuthenticated && builderActiveSection) {
      // Handle graph section - show all data
      if (builderActiveSection === 'graph') {
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
          // Default to showing all when no specific type is selected
          fetchGraphData('all');
        }
      } else {
        // Clear selected node type when not in graph section
        if (selectedNodeType) {
          setSelectedNodeType(null);
        }
        
        // Handle specific node type sections
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
        
        const nodeType = nodeTypeMap[builderActiveSection];
        if (nodeType) {
          fetchGraphData(nodeType);
        }
      }
    }
  }, [selectedIndustries, selectedSector, selectedDepartment, isBuilderMode, builderAuthenticated, viewMode, builderActiveSection, selectedNodeType, fetchGraphData]);

  // Refresh data when version changes
  useEffect(() => {
    if (isBuilderMode && builderAuthenticated && builderActiveSection === 'overview') {
      fetchBuilderStats(currentGraphVersion);
    }
  }, [currentGraphVersion]);

  const resetSelections = () => {
    setSelections({ viewMode: '', industries: [], sectors: [], departments: [], painPoints: [] });
    setScopeChoice('');
    setSectors({});
    setPainPoints([]);
    setProjects([]);
    setCurrentStep(1);
    setBusinessContextSubstep('industries');
    setCurrentSectorPage(0);
    setScopeSubstep('choice');
  };

  // Handle overview card click to navigate to graph view
  const handleOverviewCardClick = (nodeType: string) => {
    // Store the selected node type and switch to graph section
    setSelectedNodeType(nodeType);
    setBuilderActiveSection('graph');
    
    // Reset filters
    resetFilters();
  };

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
        setProjects([]);
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
        setProjects([]);
        setCurrentStep(2);
        setScopeSubstep('choice');
        break;

      case 3:
        // Go back to pain point selection - clear projects
        setSelections({ ...selections, painPoints: [] });
        setPainPoints([]);
        setProjects([]);
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

  const handleSectorToggle = (sectorName: string) => {
    const newSectors = newPainPointForm.sectors.includes(sectorName)
      ? newPainPointForm.sectors.filter(s => s !== sectorName)
      : [...newPainPointForm.sectors, sectorName];
    setNewPainPointForm({...newPainPointForm, sectors: newSectors});
  };

  const handleDepartmentToggle = (departmentName: string) => {
    const newDepartments = newPainPointForm.departments.includes(departmentName)
      ? newPainPointForm.departments.filter(d => d !== departmentName)
      : [...newPainPointForm.departments, departmentName];
    setNewPainPointForm({...newPainPointForm, departments: newDepartments});
  };

  const removeSectorTag = (sectorName: string) => {
    const newSectors = newPainPointForm.sectors.filter(s => s !== sectorName);
    setNewPainPointForm({...newPainPointForm, sectors: newSectors});
  };

  const removeDepartmentTag = (departmentName: string) => {
    const newDepartments = newPainPointForm.departments.filter(d => d !== departmentName);
    setNewPainPointForm({...newPainPointForm, departments: newDepartments});
  };

  const handleSuggestPainPointNames = async () => {
    if (newPainPointForm.sectors.length === 0 && newPainPointForm.departments.length === 0) {
      alert('Please select at least one sector or department first');
      return;
    }
    
    setSuggestingPainPoints(true);
    
    try {
      const response = await fetch('/api/suggest-painpoint-names', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sectors: newPainPointForm.sectors,
          departments: newPainPointForm.departments
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        setPainPointSuggestions(data.suggestions);
        setShowPainPointSuggestions(true);
      } else {
        const errorData = await response.json();
        alert(errorData.error || 'Failed to generate suggestions');
      }
    } catch (error) {
      console.error('Error getting pain point suggestions:', error);
      alert('Failed to generate suggestions');
    } finally {
      setSuggestingPainPoints(false);
    }
  };

  const handleSelectPainPointSuggestion = (suggestion: string) => {
    setNewPainPointForm({ ...newPainPointForm, name: suggestion });
    setShowPainPointSuggestions(false);
  };

  const handleSuggestImpact = async () => {
    if (!newPainPointForm.name.trim()) {
      alert('Please enter a pain point name first');
      return;
    }
    
    setSuggestingImpact(true);
    
    try {
      const response = await fetch('/api/suggest-impact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          painPointName: newPainPointForm.name,
          sectors: newPainPointForm.sectors,
          departments: newPainPointForm.departments
        })
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
      setSuggestingImpact(false);
    }
  };

  const handleCreatePainPoint = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const payload = {
        ...newPainPointForm,
        departments: newPainPointForm.departments.length > 0 ? newPainPointForm.departments : undefined,
        sectors: newPainPointForm.sectors.length > 0 ? newPainPointForm.sectors : undefined
      };
      
      const response = await fetch('/api/painpoints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
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
    } finally {
      setLoading(false);
    }
  };
  
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const payload = {
        ...newProjectForm,
        sector: selections.sectors.length > 0 ? selections.sectors[0] : undefined,
        department: selections.departments.length > 0 ? selections.departments[0] : undefined,
        painPoint: selections.painPoints.length > 0 ? selections.painPoints[0] : newProjectForm.painPoint
      };
      
      const response = await fetch('/api/projects/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
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
    } finally {
      setLoading(false);
    }
  };
  
  const addRequiredRole = () => {
    setNewProjectForm({
      ...newProjectForm,
      requiredRoles: [...newProjectForm.requiredRoles, { name: '', specialty: '' }]
    });
  };
  
  const removeRequiredRole = (index: number) => {
    setNewProjectForm({
      ...newProjectForm,
      requiredRoles: newProjectForm.requiredRoles.filter((_, i) => i !== index)
    });
  };
  
  const updateRequiredRole = (index: number, field: 'name' | 'specialty', value: string) => {
    const updatedRoles = [...newProjectForm.requiredRoles];
    updatedRoles[index] = { ...updatedRoles[index], [field]: value };
    setNewProjectForm({ ...newProjectForm, requiredRoles: updatedRoles });
  };
  
  const addSubModule = () => {
    setNewProjectForm({
      ...newProjectForm,
      subModules: [...newProjectForm.subModules, '']
    });
  };
  
  const removeSubModule = (index: number) => {
    setNewProjectForm({
      ...newProjectForm,
      subModules: newProjectForm.subModules.filter((_, i) => i !== index)
    });
  };
  
  const updateSubModule = (index: number, value: string) => {
    const updatedSubModules = [...newProjectForm.subModules];
    updatedSubModules[index] = value;
    setNewProjectForm({ ...newProjectForm, subModules: updatedSubModules });
  };

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

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'High': return '#e74c3c';
      case 'Medium': return '#f39c12';
      default: return '#95a5a6';
    }
  };

  return (
    <div className="app">
      <header className={`app-header ${isBuilderMode ? 'builder-mode' : ''}`}>
        <div className="header-content">
          <h1>{isBuilderMode ? 'AI Catalog - BUILDER' : 'AI Project Catalog - EXPLORER'}</h1>
          <button 
            className={`builder-toggle ${isBuilderMode ? 'active' : ''}`}
            onClick={handleBuilderToggle}
            title={isBuilderMode ? 'Switch to Explorer Mode' : 'Switch to Builder Mode'}
          >
            {isBuilderMode ? '🔍 Explorer' : '🔧 Builder'}
          </button>
        </div>
      </header>

      {isBuilderMode && builderAuthenticated ? (
        /* Builder Dashboard */
        <div className="builder-dashboard">
          <div className="builder-nav">
            <div className="builder-nav-items">
              {/* Main Sections */}
              <button 
                className={`builder-nav-item ${builderActiveSection === 'overview' ? 'active' : ''}`}
                onClick={() => {
                  setBuilderActiveSection('overview');
                }}
              >
                📊 Overview
              </button>
              
              <button 
                className={`builder-nav-item ${builderActiveSection === 'graph' ? 'active' : ''}`}
                onClick={() => {
                  setBuilderActiveSection('graph');
                }}
              >
                🕸️ Graph
              </button>
              
              
            </div>
            
            {/* Version Management in Side Panel */}
            <div className="builder-version-sidebar">
              <div className="version-info-sidebar">
                <label>Version: </label>
                <select 
                  value={currentGraphVersion} 
                  onChange={(e) => setCurrentGraphVersion(e.target.value)}
                  className="version-select-sidebar"
                >
                  {availableVersions.map(version => (
                    <option key={version} value={version}>
                      {version === 'base' ? '🔒 Base' : `✏️ ${version}`}
                    </option>
                  ))}
                </select>
              </div>
              
              {/* Manage Versions Button */}
              {availableVersions.length > 1 && (
                <div className="manage-versions-button">
                  <button 
                    className="version-btn-sidebar manage-versions"
                    onClick={() => setShowManageVersionsModal(true)}
                    title="Manage all versions"
                  >
                    🗂️ Manage Versions
                  </button>
                </div>
              )}
              
              <div className="version-actions-sidebar">
                {currentGraphVersion === 'base' && (
                  <button 
                    className="version-btn-sidebar create-draft" 
                    onClick={createDraftVersion}
                    disabled={builderLoading}
                    title="Create Draft Version"
                  >
                    📝 Draft
                  </button>
                )}
                
                {currentGraphVersion === 'admin_draft' && (
                  <div className="draft-actions">
                    <button 
                      className="version-btn-sidebar reset" 
                      onClick={resetToBase}
                      disabled={builderLoading}
                      title="Reset to Base"
                    >
                      🔄 Reset
                    </button>
                    <button 
                      className="version-btn-sidebar promote" 
                      onClick={() => alert('Promote to base feature coming soon!')}
                      disabled={builderLoading}
                      title="Promote to Base"
                    >
                      ⬆️ Promote
                    </button>
                  </div>
                )}
                
                {/* Import/Export Actions */}
                <div className="sidebar-import-export">
                  <button 
                    className="version-btn-sidebar import"
                    onClick={() => setShowImportModal(true)}
                    title="Import Data"
                  >
                    📥 Import
                  </button>
                  <button 
                    className="version-btn-sidebar export"
                    onClick={() => handleExportGraph()}
                    disabled={exportLoading}
                    title="Export Graph"
                  >
                    {exportLoading ? '⏳' : '📤'} Export
                  </button>
                  
                  <button 
                    className="version-btn-sidebar smart-update"
                    onClick={() => {
                      setShowSmartUpdateModal(true);
                      resetSmartUpdate();
                    }}
                    title="Smart Update with AI - Describe changes in natural language"
                  >
                    🧠 Smart Update
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          <div className="builder-content">

            {builderLoading && (
              <div className="builder-loading">
                <div className="spinner"></div>
                <p>Loading...</p>
              </div>
            )}

            {/* Overview Section */}
            {builderActiveSection === 'overview' && !builderLoading && (
              <div className="builder-overview">
                <div className="node-cards-grid">
                  <div 
                    className="node-card clickable industry-node" 
                    onClick={() => handleOverviewCardClick('industries')}
                    title="Click to view Industries in graph"
                  >
                    <div className="node-circle">
                      <span className="node-icon">🏢</span>
                      <span className="node-count">{builderStats?.Industry || 0}</span>
                    </div>
                    <span className="node-label">Industries</span>
                  </div>
                  <div 
                    className="node-card clickable sector-node" 
                    onClick={() => handleOverviewCardClick('sectors')}
                    title="Click to view Sectors in graph"
                  >
                    <div className="node-circle">
                      <span className="node-icon">🏛️</span>
                      <span className="node-count">{builderStats?.Sector || 0}</span>
                    </div>
                    <span className="node-label">Sectors</span>
                  </div>
                  <div 
                    className="node-card clickable department-node" 
                    onClick={() => handleOverviewCardClick('departments')}
                    title="Click to view Departments in graph"
                  >
                    <div className="node-circle">
                      <span className="node-icon">🏢</span>
                      <span className="node-count">{builderStats?.Department || 0}</span>
                    </div>
                    <span className="node-label">Departments</span>
                  </div>
                  <div 
                    className="node-card clickable painpoint-node" 
                    onClick={() => handleOverviewCardClick('painpoints')}
                    title="Click to view Pain Points in graph"
                  >
                    <div className="node-circle">
                      <span className="node-icon">⚠️</span>
                      <span className="node-count">{builderStats?.PainPoint || 0}</span>
                    </div>
                    <span className="node-label">Pain Points</span>
                  </div>
                  <div 
                    className="node-card clickable project-node" 
                    onClick={() => handleOverviewCardClick('projects')}
                    title="Click to view Projects in graph"
                  >
                    <div className="node-circle">
                      <span className="node-icon">🚀</span>
                      <span className="node-count">{builderStats?.ProjectOpportunity || 0}</span>
                    </div>
                    <span className="node-label">Projects</span>
                  </div>
                </div>
              </div>
            )}

            {/* Graph Section */}
            {builderActiveSection === 'graph' && !builderLoading && (
              <div className="builder-graph-section">
                {graphLoading ? (
                  <div className="builder-loading">
                    <div className="spinner"></div>
                    <p>Loading graph visualization...</p>
                  </div>
                ) : (
                  <GraphViz
                    nodes={graphData.nodes}
                    edges={graphData.edges}
                    nodeType="all"
                    onNodeSelect={handleGraphNodeSelect}
                    onNodeDoubleClick={handleGraphNodeEdit}
                    onNavigateToNode={handleNavigateToNode}
                    focusedNode={focusedGraphNode}
                    height="600px"
                  />
                )}
              </div>
            )}


            {/* Relationships Section */}
            {builderActiveSection === 'relationships' && !builderLoading && (
              <div className="builder-relationships">
                <h3>Graph Relationships</h3>
                <p>Relationship management interface coming soon...</p>
              </div>
            )}
          </div>
        </div>

      ) : (
        /* User Workflow */
        <>
          <div className="progress-bar">
        <div 
          className={`step ${currentStep >= 1 ? 'active' : ''} ${currentStep > 1 ? 'clickable' : ''}`}
          onClick={() => navigateToStep(1)}
        >
          <span className="step-number">1</span>
          <span className="step-label">Business Context</span>
        </div>
        <div 
          className={`step ${currentStep >= 2 ? 'active' : ''} ${currentStep > 2 ? 'clickable' : ''}`}
          onClick={() => navigateToStep(2)}
        >
          <span className="step-number">2</span>
          <span className="step-label">Scope</span>
        </div>
        <div 
          className={`step ${currentStep >= 3 ? 'active' : ''} ${currentStep > 3 ? 'clickable' : ''}`}
          onClick={() => navigateToStep(3)}
        >
          <span className="step-number">3</span>
          <span className="step-label">Pain Points</span>
        </div>
        <div 
          className={`step ${currentStep >= 4 ? 'active' : ''}`}
        >
          <span className="step-number">4</span>
          <span className="step-label">Projects</span>
        </div>
      </div>


      {/* Step Subtitle */}
      <div className="step-subtitle">
        {currentStep === 1 && businessContextSubstep === 'industries' && (
          <p>Select your industry</p>
        )}
        {currentStep === 1 && businessContextSubstep === 'sectors' && selections.industries.map((industry, index) => {
          if (index === currentSectorPage) {
            return <p key={industry}>Select your {industry.toLowerCase()} sectors</p>;
          }
          return null;
        })}
        {currentStep === 2 && scopeSubstep === 'choice' && (
          <p>Choose your scope</p>
        )}
        {currentStep === 2 && scopeSubstep === 'departments' && (
          <p>Select your departments</p>
        )}
        {currentStep === 3 && (
          <p>Select pain points you want to address</p>
        )}
        {currentStep === 4 && (
          <p>Recommended AI projects for your selections</p>
        )}
      </div>

      <main className="main-content">
        {/* Step 1: Business Context */}
        {currentStep === 1 && businessContextSubstep === 'industries' && (
          <div className="selection-section">
            
            {/* Industries Section */}
            <div className="industry-group">
              <div className="selection-grid">
                {industries.map(industry => (
                  <button
                    key={industry.name}
                    className={`selection-card ${selections.industries.includes(industry.name) ? 'selected' : ''}`}
                    onClick={() => handleIndustrySelection(industry.name)}
                  >
                    <div className="card-content">
                      <div className="card-icon">🏦</div>
                      <h3>{industry.name}</h3>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Action buttons */}
            <div className="action-buttons">
              {(selections.industries.length > 0 || selections.sectors.length > 0 || currentStep > 1) && (
                <button 
                  className="skip-btn"
                  onClick={handleClearProgress}
                >
                  Reset
                </button>
              )}
              
              {selections.industries.length > 0 && (
                <button 
                  className="find-projects-btn"
                  onClick={handleProceedToSectors}
                >
                  Next
                </button>
              )}
            </div>
          </div>
        )}

        {/* Step 1: Sector Selection Pages */}
        {currentStep === 1 && businessContextSubstep === 'sectors' && (
          <div className="selection-section">
            
            {selections.industries.map((industryName, index) => {
              if (index !== currentSectorPage) return null;
              
              const industrySectors = sectors[industryName] || [];
              
              return (
                <div key={industryName}>
                  <div className="industry-group">
                    <div className="selection-grid">
                      {industrySectors.map(sector => (
                        <button
                          key={sector.name}
                          className={`selection-card ${selections.sectors.includes(sector.name) ? 'selected' : ''}`}
                          onClick={() => handleSectorSelection(sector.name)}
                        >
                          <div className="card-content">
                            <div className="card-icon">🏢</div>
                            <h3>{sector.name}</h3>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Navigation buttons */}
                  <div className="action-buttons">
                    <button 
                      className="skip-btn"
                      onClick={handlePreviousSectorPage}
                    >
                      Back
                    </button>
                    
                    {currentSectorPage < selections.industries.length - 1 ? (
                      <button 
                        className="find-projects-btn"
                        onClick={handleNextSectorPage}
                      >
                        Next Industry
                      </button>
                    ) : (
                      <button 
                        className="find-projects-btn"
                        onClick={handleProceedToScope}
                        disabled={selections.sectors.length === 0}
                      >
                        Next
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Step 2: Scope Selection */}
        {currentStep === 2 && scopeSubstep === 'choice' && (
          <div className="selection-section">
            <div className="selection-grid">
              <button
                className={`selection-card ${scopeChoice === 'company' ? 'selected' : ''}`}
                onClick={() => handleScopeSelection('company')}
              >
                <div className="card-content">
                  <div className="card-icon">🏢</div>
                  <h3>Whole company</h3>
                </div>
              </button>
              
              <button
                className={`selection-card ${scopeChoice === 'departments' ? 'selected' : ''}`}
                onClick={() => handleScopeSelection('departments')}
              >
                <div className="card-content">
                  <div className="card-icon">🏛️</div>
                  <h3>Specific Departments</h3>
                </div>
              </button>
            </div>
            
            {/* Navigation buttons */}
            <div className="action-buttons">
              <button 
                className="skip-btn"
                onClick={handleBackToBusinessContext}
              >
                Back
              </button>
              
              {scopeChoice && (
                <button 
                  className="find-projects-btn"
                  onClick={handleScopeNext}
                >
                  Next
                </button>
              )}
            </div>
          </div>
        )}

        {/* Step 2: Department Selection */}
        {currentStep === 2 && scopeSubstep === 'departments' && (
          <div className="selection-section">
            <div className="selection-grid">
              {departments.map(department => (
                <button
                  key={department.name}
                  className={`selection-card ${selections.departments.includes(department.name) ? 'selected' : ''}`}
                  onClick={() => handleDepartmentSelection(department.name)}
                >
                  <div className="card-content">
                    <div className="card-icon">🏛️</div>
                    <h3>{department.name}</h3>
                  </div>
                </button>
              ))}
            </div>
            
            {/* Navigation buttons */}
            <div className="action-buttons">
              <button 
                className="skip-btn"
                onClick={handleBackToScopeChoice}
              >
                Back
              </button>
              
              {selections.departments.length > 0 && (
                <button 
                  className="find-projects-btn"
                  onClick={handleDepartmentNext}
                >
                  Next
                </button>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Pain Point Selection */}
        {currentStep === 3 && (
          <div className="selection-section">
            <div className="selection-grid">
              {painPoints.map(painPoint => (
                <button
                  key={painPoint.name}
                  className={`selection-card ${selections.painPoints.includes(painPoint.name) ? 'selected' : ''}`}
                  onClick={() => handlePainPointSelection(painPoint.name)}
                >
                  <div className="card-content">
                    <h3>{painPoint.name}</h3>
                    {painPoint.impact && (
                      <div className="impact-badge">
                        Impact: {painPoint.impact}
                      </div>
                    )}
                  </div>
                </button>
              ))}
              
              {/* Add New Pain Point Button */}
              <button
                className="add-new-btn"
                onClick={() => setShowPainPointModal(true)}
              >
                <div className="add-icon">+</div>
                <h3>Add New Pain Point</h3>
              </button>
            </div>
            
            {selections.painPoints.length > 0 && (
              <div className="action-buttons">
                <button 
                  className="find-projects-btn"
                  onClick={fetchProjects}
                  disabled={loading}
                >
                  {loading ? 'Finding Projects...' : 'Find AI Projects'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Project Results */}
        {currentStep === 4 && (
          <div className="results-section">
            <div className="results-header">
              <h2>Recommended AI Projects ({projects.length})</h2>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button 
                  className="modal-btn modal-btn-primary"
                  onClick={() => setShowProjectModal(true)}
                >
                  Add Custom Project
                </button>
                <button className="reset-btn" onClick={resetSelections}>
                  Start Over
                </button>
              </div>
            </div>
            
            <div className="projects-grid">
              {projects.map((project, index) => (
                <div key={index} className="project-card">
                  <div className="project-header">
                    <h3>{project.title}</h3>
                    <span 
                      className="priority-badge"
                      style={{ backgroundColor: getPriorityColor(project.priority) }}
                    >
                      {project.priority}
                    </span>
                  </div>
                  
                  <div className="project-details">
                    <p className="business-case">{project.businessCase}</p>
                    
                    <div className="project-meta">
                      <div className="meta-item">
                        <strong>Sector:</strong> {project.sector}
                      </div>
                      {project.department && (
                        <div className="meta-item">
                          <strong>Department:</strong> {project.department}
                        </div>
                      )}
                      <div className="meta-item">
                        <strong>Addresses:</strong> {project.painPoint}
                      </div>
                      <div className="meta-item">
                        <strong>Blueprint:</strong> {project.blueprintTitle}
                      </div>
                      {project.budgetRange && (
                        <div className="meta-item">
                          <strong>Budget:</strong> {project.budgetRange}
                        </div>
                      )}
                      {project.duration && (
                        <div className="meta-item">
                          <strong>Duration:</strong> {project.duration}
                        </div>
                      )}
                    </div>

                    {project.requiredRoles.length > 0 && (
                      <div className="roles-section">
                        <strong>Required Roles:</strong>
                        <div className="tags">
                          {project.requiredRoles.map((role, roleIndex) => (
                            <span key={roleIndex} className="tag role-tag">
                              {typeof role === 'string' ? role : role.name}
                              {typeof role === 'object' && role.specialty && (
                                <span className="specialty"> - {role.specialty}</span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {project.subModules.length > 0 && (
                      <div className="modules-section">
                        <strong>Key Modules:</strong>
                        <div className="tags">
                          {project.subModules.map(module => (
                            <span key={module} className="tag module-tag">{module}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pain Point Creation Modal */}
        {showPainPointModal && (
          <div className="modal-backdrop" onClick={() => setShowPainPointModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Add New Pain Point</h2>
                <button className="modal-close" onClick={() => setShowPainPointModal(false)}>×</button>
              </div>
              
              <form 
                onSubmit={handleCreatePainPoint}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const submitButton = form.querySelector('button[type="submit"]') as HTMLButtonElement;
                    if (submitButton && !submitButton.disabled) {
                      submitButton.click();
                    }
                  }
                }}
              >
                {/* Connection Fields - Side by Side */}
                <div className="form-row">
                  <div className="form-group form-group-half">
                    <label className="form-label">Connect to Sectors</label>
                    <div className="multiselect-container">
                      <div 
                        className={`multiselect-dropdown ${showSectorDropdown ? 'active' : ''}`}
                        onClick={() => setShowSectorDropdown(!showSectorDropdown)}
                      >
                        <div className="multiselect-display">
                          {newPainPointForm.sectors.length === 0 ? (
                            <span className="multiselect-placeholder">Select sectors...</span>
                          ) : (
                            newPainPointForm.sectors.map(sector => (
                              <div key={sector} className="multiselect-tag">
                                <span>{sector}</span>
                                <button 
                                  type="button"
                                  className="multiselect-tag-remove"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeSectorTag(sector);
                                  }}
                                >
                                  ×
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                        <div className={`multiselect-arrow ${showSectorDropdown ? 'open' : ''}`}>▼</div>
                      </div>
                      
                      {showSectorDropdown && (
                        <div className="multiselect-options">
                          {getAllSectors().map(sector => (
                            <div 
                              key={sector}
                              className={`multiselect-option ${newPainPointForm.sectors.includes(sector) ? 'selected' : ''}`}
                              onClick={() => handleSectorToggle(sector)}
                            >
                              <div className="multiselect-checkbox"></div>
                              <span>{sector}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="form-group form-group-half">
                    <label className="form-label">Connect to Departments</label>
                    <div className="multiselect-container">
                      <div 
                        className={`multiselect-dropdown ${showDepartmentDropdown ? 'active' : ''}`}
                        onClick={() => setShowDepartmentDropdown(!showDepartmentDropdown)}
                      >
                        <div className="multiselect-display">
                          {newPainPointForm.departments.length === 0 ? (
                            <span className="multiselect-placeholder">Select departments...</span>
                          ) : (
                            newPainPointForm.departments.map(department => (
                              <div key={department} className="multiselect-tag">
                                <span>{department}</span>
                                <button 
                                  type="button"
                                  className="multiselect-tag-remove"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeDepartmentTag(department);
                                  }}
                                >
                                  ×
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                        <div className={`multiselect-arrow ${showDepartmentDropdown ? 'open' : ''}`}>▼</div>
                      </div>
                      
                      {showDepartmentDropdown && (
                        <div className="multiselect-options">
                          {getAllDepartments().map(departmentName => (
                            <div 
                              key={departmentName}
                              className={`multiselect-option ${newPainPointForm.departments.includes(departmentName) ? 'selected' : ''}`}
                              onClick={() => handleDepartmentToggle(departmentName)}
                            >
                              <div className="multiselect-checkbox"></div>
                              <span>{departmentName}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Pain Point Name *</label>
                  <div className="name-suggestion-container">
                    <input
                      type="text"
                      className="form-input"
                      value={newPainPointForm.name}
                      onChange={(e) => setNewPainPointForm({...newPainPointForm, name: e.target.value})}
                      required
                      placeholder="e.g., Manual Process Bottlenecks"
                      style={{ paddingRight: '10rem' }}
                    />
                    <button
                      type="button"
                      className="suggestion-btn"
                      onClick={handleSuggestPainPointNames}
                      disabled={suggestingPainPoints || (newPainPointForm.sectors.length === 0 && newPainPointForm.departments.length === 0)}
                      title="Get AI-powered pain point suggestions based on selected sectors and departments"
                    >
                      {suggestingPainPoints ? (
                        <>
                          <div className="loading-dots">
                            <span></span>
                            <span></span>
                            <span></span>
                          </div>
                          Suggesting...
                        </>
                      ) : (
                        <>
                          <span className="icon">✨</span>
                          Smart Suggest
                        </>
                      )}
                    </button>
                    
                    {showPainPointSuggestions && (
                      <>
                        <div 
                          className="suggestion-backdrop" 
                          onClick={() => setShowPainPointSuggestions(false)}
                        ></div>
                        <div className="suggestion-dropdown">
                        <div className="suggestion-dropdown-header">
                          <span>
                            Pain Points for {
                              [...newPainPointForm.sectors, ...newPainPointForm.departments]
                                .filter(item => item)
                                .join(', ')
                            }
                          </span>
                          <button 
                            type="button"
                            className="suggestion-dropdown-close"
                            onClick={() => setShowPainPointSuggestions(false)}
                          >
                            ×
                          </button>
                        </div>
                        {painPointSuggestions.map((suggestion, index) => (
                          <div
                            key={index}
                            className="suggestion-item"
                            onClick={() => handleSelectPainPointSuggestion(suggestion)}
                          >
                            {suggestion}
                          </div>
                        ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
                
                {newPainPointForm.name.trim() && (
                  <div className="form-group">
                    <label className="form-label">Impact Description</label>
                  <div className="suggestion-container">
                    <textarea
                      className="form-textarea"
                      value={newPainPointForm.impact}
                      onChange={(e) => setNewPainPointForm({...newPainPointForm, impact: e.target.value})}
                      placeholder="Describe the business impact of this pain point"
                      style={{ paddingRight: '10rem' }}
                    />
                    <button
                      type="button"
                      className="suggestion-btn"
                      onClick={handleSuggestImpact}
                      disabled={suggestingImpact || !newPainPointForm.name.trim()}
                      title="Generate AI-powered impact description"
                    >
                      {suggestingImpact ? (
                        <>
                          <div className="loading-dots">
                            <span></span>
                            <span></span>
                            <span></span>
                          </div>
                          Suggesting...
                        </>
                      ) : (
                        <>
                          <span className="icon">✨</span>
                          Smart Suggest
                        </>
                      )}
                    </button>
                  </div>
                  </div>
                )}
                
                <div className="modal-actions">
                  <button type="button" className="modal-btn modal-btn-secondary" onClick={() => setShowPainPointModal(false)}>
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="modal-btn modal-btn-primary" 
                    disabled={
                      loading || 
                      !newPainPointForm.name ||
                      (newPainPointForm.departments.length === 0 && newPainPointForm.sectors.length === 0)
                    }
                  >
                    {loading ? 'Creating...' : 'Create Pain Point'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Project Creation Modal */}
        {showProjectModal && (
          <div className="modal-backdrop" onClick={() => setShowProjectModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Add Custom Project</h2>
                <button className="modal-close" onClick={() => setShowProjectModal(false)}>×</button>
              </div>
              
              <form 
                onSubmit={handleCreateProject}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const submitButton = form.querySelector('button[type="submit"]') as HTMLButtonElement;
                    if (submitButton && !submitButton.disabled) {
                      submitButton.click();
                    }
                  }
                }}
              >
                <div className="form-group">
                  <label className="form-label">Project Title *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={newProjectForm.title}
                    onChange={(e) => setNewProjectForm({...newProjectForm, title: e.target.value})}
                    required
                    placeholder="e.g., AI-Powered Customer Service Bot"
                  />
                </div>
                
                <div className="form-group">
                  <label className="form-label">Priority</label>
                  <select
                    className="form-select"
                    value={newProjectForm.priority}
                    onChange={(e) => setNewProjectForm({...newProjectForm, priority: e.target.value as 'High' | 'Medium' | 'Low'})}
                  >
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
                
                <div className="form-group">
                  <label className="form-label">Business Case *</label>
                  <textarea
                    className="form-textarea"
                    value={newProjectForm.businessCase}
                    onChange={(e) => setNewProjectForm({...newProjectForm, businessCase: e.target.value})}
                    required
                    placeholder="Describe the business justification for this project"
                  />
                </div>
                
                <div className="form-group">
                  <label className="form-label">Blueprint Title *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={newProjectForm.blueprintTitle}
                    onChange={(e) => setNewProjectForm({...newProjectForm, blueprintTitle: e.target.value})}
                    required
                    placeholder="e.g., Conversational AI Platform"
                  />
                </div>
                
                <div className="form-group">
                  <label className="form-label">Budget Range</label>
                  <input
                    type="text"
                    className="form-input"
                    value={newProjectForm.budgetRange}
                    onChange={(e) => setNewProjectForm({...newProjectForm, budgetRange: e.target.value})}
                    placeholder="e.g., $100K - $500K"
                  />
                </div>
                
                <div className="form-group">
                  <label className="form-label">Duration</label>
                  <input
                    type="text"
                    className="form-input"
                    value={newProjectForm.duration}
                    onChange={(e) => setNewProjectForm({...newProjectForm, duration: e.target.value})}
                    placeholder="e.g., 6-12 months"
                  />
                </div>
                
                <div className="form-group">
                  <label className="form-label">Required Roles</label>
                  <div className="dynamic-list">
                    {newProjectForm.requiredRoles.map((role, index) => (
                      <div key={index} className="dynamic-list-item">
                        <input
                          type="text"
                          placeholder="Role name"
                          value={role.name}
                          onChange={(e) => updateRequiredRole(index, 'name', e.target.value)}
                        />
                        <input
                          type="text"
                          placeholder="Specialty (optional)"
                          value={role.specialty || ''}
                          onChange={(e) => updateRequiredRole(index, 'specialty', e.target.value)}
                        />
                        <button type="button" className="remove-item-btn" onClick={() => removeRequiredRole(index)}>
                          Remove
                        </button>
                      </div>
                    ))}
                    <button type="button" className="add-item-btn" onClick={addRequiredRole}>
                      Add Role
                    </button>
                  </div>
                </div>
                
                <div className="form-group">
                  <label className="form-label">Sub-modules</label>
                  <div className="dynamic-list">
                    {newProjectForm.subModules.map((module, index) => (
                      <div key={index} className="dynamic-list-item">
                        <input
                          type="text"
                          placeholder="Module name"
                          value={module}
                          onChange={(e) => updateSubModule(index, e.target.value)}
                        />
                        <button type="button" className="remove-item-btn" onClick={() => removeSubModule(index)}>
                          Remove
                        </button>
                      </div>
                    ))}
                    <button type="button" className="add-item-btn" onClick={addSubModule}>
                      Add Module
                    </button>
                  </div>
                </div>
                
                <div className="modal-actions">
                  <button type="button" className="modal-btn modal-btn-secondary" onClick={() => setShowProjectModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="modal-btn modal-btn-primary" disabled={loading || !newProjectForm.title || !newProjectForm.businessCase || !newProjectForm.blueprintTitle}>
                    {loading ? 'Creating...' : 'Create Project'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {loading && (
          <div className="loading">
            <div className="spinner"></div>
            <p>Loading...</p>
          </div>
        )}
        </main>
        </>
      )}

      {/* Builder Modals - Always available when in builder mode */}
      {isBuilderMode && builderAuthenticated && (
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
                  <h2>Edit {builderActiveSection.slice(0, -1)}</h2>
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
                      placeholder={`Enter ${builderActiveSection.slice(0, -1)} name`}
                    />
                  </div>
                  
                  {(builderActiveSection === 'painpoints') && (
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
              <h2>Import Graph Data</h2>
              <button className="modal-close" onClick={() => setShowImportModal(false)}>×</button>
            </div>
            
            <div className="import-content">
              <div className="import-info">
                <p>Import a Cypher script to create a new graph version. The import will validate the schema and create a separate version that can be promoted to base later.</p>
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
                          <li>Check that all node types match: Industry, Sector, Department, PainPoint, ProjectOpportunity, ProjectBlueprint, Role, SubModule, Module</li>
                          <li>Ensure all relationship types are valid: HAS_SECTOR, EXPERIENCES, HAS_OPPORTUNITY, ADDRESSES, IS_INSTANCE_OF, REQUIRES_ROLE, NEEDS_SUBMODULE, USES_MODULE, CONTAINS</li>
                          <li>Include required properties: 'name' for most nodes, 'title' for ProjectOpportunity/ProjectBlueprint</li>
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
                      {importLoading ? '⏳ Importing...' : '📥 Import Graph'}
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
                        onClick={() => handlePromoteVersion(importResult.versionName!)}
                      >
                        🚀 Promote to Base
                      </button>
                      <button 
                        className="modal-btn modal-btn-secondary"
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
        <div className="modal-backdrop" onClick={() => setShowManageVersionsModal(false)}>
          <div className="modal-content manage-versions-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>🗂️ Manage Graph Versions</h2>
              <button className="modal-close" onClick={() => setShowManageVersionsModal(false)}>×</button>
            </div>
            
            <div className="manage-versions-content">
              <div className="manage-versions-info">
                <p>Manage your graph versions. You can view, promote, or delete versions. The base version cannot be deleted.</p>
              </div>
              
              {availableVersions.length <= 1 ? (
                <div className="no-versions-message">
                  <p>🔒 Only base version exists. Import new data to create additional versions.</p>
                </div>
              ) : (
                <div className="versions-list">
                  {availableVersions.map(version => (
                    <div key={version} className={`version-item ${version === 'base' ? 'base-version' : ''}`}>
                      <div className="version-info">
                        <span className="version-name">
                          {version === 'base' ? '🔒 Base' : `📦 ${version}`}
                        </span>
                        {currentGraphVersion === version && (
                          <span className="version-badge current">Current</span>
                        )}
                        {version === 'base' && (
                          <span className="version-badge base">Protected</span>
                        )}
                      </div>
                      
                      {version !== 'base' && (
                        <div className="version-actions">
                          <button
                            className="version-action-btn view"
                            onClick={() => {
                              setCurrentGraphVersion(version);
                              setShowManageVersionsModal(false);
                            }}
                            title="View this version"
                          >
                            👁️ View
                          </button>
                          <button
                            className="version-action-btn promote"
                            onClick={() => {
                              handlePromoteVersion(version);
                              setShowManageVersionsModal(false);
                            }}
                            title="Promote to base"
                          >
                            🚀 Promote
                          </button>
                          <button
                            className="version-action-btn delete"
                            onClick={() => handleDeleteVersion(version)}
                            title="Delete this version"
                          >
                            🗑️ Delete
                          </button>
                        </div>
                      )}
                      
                      {version === 'base' && (
                        <div className="version-actions">
                          <button
                            className="version-action-btn view"
                            onClick={() => {
                              setCurrentGraphVersion(version);
                              setShowManageVersionsModal(false);
                            }}
                            title="View base version"
                          >
                            👁️ View
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              
              <div className="manage-versions-footer">
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

      {/* Smart Update Modal */}
      {showSmartUpdateModal && (
        <div className="modal-backdrop" onClick={() => {
          setShowSmartUpdateModal(false);
          resetSmartUpdate();
        }}>
          <div className="modal-content smart-update-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>🧠 Smart Update with AI</h2>
              <button className="modal-close" onClick={() => {
                setShowSmartUpdateModal(false);
                resetSmartUpdate();
              }}>×</button>
            </div>

            <div className="smart-update-content">
              {/* Step 1: Natural Language Input */}
              {smartUpdateStep === 'input' && (
                <div className="smart-update-step">
                  <h3>Describe Your Graph Update</h3>
                  <p>Use natural language to describe what you want to change in the graph. The AI will generate a Cypher query for you.</p>
                  
                  <div className="smart-update-examples">
                    <h4>Examples:</h4>
                    <ul>
                      <li>"Update the Banking industry name to 'Digital Banking'"</li>
                      <li>"Connect Risk Management department to Fraud Detection pain point"</li>
                      <li>"Change the impact of Manual Process pain point to include cost savings"</li>
                      <li>"Add a relationship between Retail Banking sector and Customer Service department"</li>
                    </ul>
                  </div>
                  
                  <textarea
                    value={smartUpdateInput}
                    onChange={(e) => setSmartUpdateInput(e.target.value)}
                    placeholder="Describe the update you want to make..."
                    rows={4}
                    className="smart-update-input"
                  />
                  
                  <div className="smart-update-actions">
                    <button 
                      className="modal-btn modal-btn-secondary" 
                      onClick={() => {
                        setShowSmartUpdateModal(false);
                        resetSmartUpdate();
                      }}
                    >
                      Cancel
                    </button>
                    <button 
                      className="modal-btn modal-btn-primary" 
                      onClick={() => generateCypherQuery(smartUpdateInput)}
                      disabled={!smartUpdateInput.trim() || smartUpdateLoading}
                    >
                      {smartUpdateLoading ? '🧠 Generating...' : '🚀 Generate Query'}
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: Preview */}
              {smartUpdateStep === 'preview' && (
                <div className="smart-update-step">
                  <h3>Preview Your Update</h3>
                  
                  <div className="generated-cypher">
                    <h4>Generated Cypher Query (Iteration {currentIteration}):</h4>
                    <pre className="cypher-code">{generatedCypher}</pre>
                  </div>

                  {/* Iterative Feedback Section */}
                  <div className="feedback-section">
                    <h4>💬 Provide Feedback (Optional)</h4>
                    <p>Not satisfied with the query? Describe what you'd like to change:</p>
                    <textarea
                      value={feedbackInput}
                      onChange={(e) => setFeedbackInput(e.target.value)}
                      placeholder="e.g., 'Add a WHERE clause to limit this to only active sectors' or 'Also create the pain point if it doesn't exist'"
                      rows={3}
                      className="feedback-input"
                    />
                    <button 
                      className="modal-btn modal-btn-secondary refine-btn" 
                      onClick={() => refineSmartUpdate(feedbackInput)}
                      disabled={smartUpdateLoading || !feedbackInput.trim()}
                    >
                      {smartUpdateLoading ? '🔄 Refining...' : '✨ Refine Query'}
                    </button>
                  </div>

                  {/* Conversation History */}
                  {conversationHistory.length > 0 && (
                    <div className="conversation-history">
                      <h4>📝 Conversation History:</h4>
                      <div className="history-items">
                        {conversationHistory.map((item, index) => (
                          <div key={index} className="history-item">
                            <div className="history-feedback">💭 Feedback {index + 1}: "{item.feedback}"</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <div className="preview-actions">
                    <button 
                      className="modal-btn modal-btn-secondary" 
                      onClick={() => generatePreview(generatedCypher)}
                      disabled={smartUpdateLoading}
                    >
                      {smartUpdateLoading ? '⏳ Loading Preview...' : '👁️ Generate Preview'}
                    </button>
                  </div>
                  
                  {previewData && (
                    <div className="update-preview">
                      <h4>Preview Results:</h4>
                      <div className="preview-summary">
                        <p><strong>Before:</strong> {previewData.beforeState.nodes.length} nodes affected</p>
                        {currentGraphVersion === 'base' ? (
                          <div className="base-version-notice">
                            <p><strong>📋 Base Version Notice:</strong> You're currently viewing the read-only base version.</p>
                            <p><strong>Action:</strong> Changes will be applied to a new version to preserve the base data.</p>
                          </div>
                        ) : (
                          <p><strong>After:</strong> Changes will be applied to create a new version</p>
                        )}
                        {previewData.afterState.changes && (
                          <ul>
                            {previewData.afterState.changes.map((change: string, i: number) => (
                              <li key={i}>{change}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                      
                      <div className="version-input">
                        <label>
                          {currentGraphVersion === 'base' 
                            ? 'New Version Name (Required):' 
                            : 'New Version Name:'}
                        </label>
                        <input 
                          type="text" 
                          placeholder={currentGraphVersion === 'base' 
                            ? 'Enter name for new version (e.g., smart-update-2024-08-31)' 
                            : 'e.g., banking-update, risk-connections'}
                          className="version-name-input"
                          id="newVersionNameInput"
                          defaultValue={currentGraphVersion === 'base' 
                            ? `smart-update-${new Date().toISOString().slice(0, 10)}` 
                            : ''}
                        />
                        {currentGraphVersion === 'base' && (
                          <small className="version-help-text">
                            💡 A new version will be created to safely apply your changes without modifying the base data.
                          </small>
                        )}
                      </div>
                    </div>
                  )}
                  
                  <div className="smart-update-actions">
                    <button 
                      className="modal-btn modal-btn-secondary" 
                      onClick={() => setSmartUpdateStep('input')}
                    >
                      ← Back to Edit
                    </button>
                    {previewData && (
                      <>
                        <button 
                          className="modal-btn modal-btn-secondary" 
                          onClick={() => {
                            setShowSmartUpdateModal(false);
                            resetSmartUpdate();
                          }}
                        >
                          Reject Update
                        </button>
                        <button 
                          className="modal-btn modal-btn-primary" 
                          onClick={() => {
                            const versionInput = document.getElementById('newVersionNameInput') as HTMLInputElement;
                            const versionName = versionInput?.value.trim();
                            if (versionName) {
                              applySmartUpdate(generatedCypher, versionName);
                            } else {
                              alert('Please enter a version name');
                            }
                          }}
                          disabled={smartUpdateLoading}
                        >
                          {smartUpdateLoading ? '⏳ Applying...' : '✅ Accept & Apply'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;