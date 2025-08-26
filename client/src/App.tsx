import React, { useState, useEffect } from 'react';
import { Industry, Sector, Department, PainPoint, Project, SelectionState } from './types';
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

  useEffect(() => {
    fetchIndustries();
    fetchDepartments();
    // Load all sectors for both Banking and Insurance
    fetchSectors(['Banking', 'Insurance']);
  }, []);

  const fetchIndustries = async () => {
    try {
      const response = await fetch('/api/industries');
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

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'High': return '#e74c3c';
      case 'Medium': return '#f39c12';
      default: return '#95a5a6';
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>AI Project Catalog</h1>
      </header>

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

            {/* Next button - only show if industries are selected */}
            {selections.industries.length > 0 && (
              <div className="action-buttons">
                <button 
                  className="find-projects-btn"
                  onClick={handleProceedToSectors}
                >
                  Next
                </button>
              </div>
            )}
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
              <button className="reset-btn" onClick={resetSelections}>
                Start Over
              </button>
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

        {loading && (
          <div className="loading">
            <div className="spinner"></div>
            <p>Loading...</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;