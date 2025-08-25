import React, { useState, useEffect } from 'react';
import { Industry, Sector, Department, PainPoint, Project, SelectionState } from './types';
import './App.css';

const App: React.FC = () => {
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [painPoints, setPainPoints] = useState<PainPoint[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
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
    setLoading(true);
    try {
      const response = await fetch('/api/sectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ industries: selectedIndustries })
      });
      const data = await response.json();
      setSectors(data);
    } catch (error) {
      console.error('Error fetching sectors:', error);
    } finally {
      setLoading(false);
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

  const fetchPainPoints = async (viewMode: 'sector' | 'department', selectedItems: string[]) => {
    setLoading(true);
    try {
      const endpoint = viewMode === 'sector' ? '/api/sector-painpoints' : '/api/department-painpoints';
      const body = viewMode === 'sector' 
        ? { sectors: selectedItems }
        : { departments: selectedItems };
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await response.json();
      setPainPoints(data);
    } catch (error) {
      console.error('Error fetching pain points:', error);
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
      setCurrentStep(5); // Always go to step 5 in unified flow
    } catch (error) {
      console.error('Error fetching projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSkipToDepartments = () => {
    setSelections({ ...selections, viewMode: 'sector' });
    setCurrentStep(2);
  };

  const handleIndustrySelection = (industryName: string) => {
    const newIndustries = selections.industries.includes(industryName)
      ? selections.industries.filter(i => i !== industryName)
      : [...selections.industries, industryName];
    
    setSelections({ ...selections, viewMode: 'sector', industries: newIndustries });
    
    if (newIndustries.length > 0) {
      fetchSectors(newIndustries);
      setCurrentStep(3);
    } else {
      setSectors([]);
      setPainPoints([]);
      setProjects([]);
      setCurrentStep(2);
    }
  };

  const handleSectorSelection = (sectorName: string) => {
    const newSectors = selections.sectors.includes(sectorName)
      ? selections.sectors.filter(s => s !== sectorName)
      : [...selections.sectors, sectorName];
    
    setSelections({ ...selections, sectors: newSectors });
    
    if (newSectors.length > 0) {
      // Fetch pain points based on sectors (the traditional approach for now)
      fetchPainPoints('sector', newSectors);
      setCurrentStep(4);
    } else {
      setPainPoints([]);
      setProjects([]);
      setCurrentStep(3);
    }
  };

  const handleDepartmentSelection = (departmentName: string) => {
    const newDepartments = selections.departments.includes(departmentName)
      ? selections.departments.filter(d => d !== departmentName)
      : [...selections.departments, departmentName];
    
    setSelections({ ...selections, viewMode: 'sector', departments: newDepartments });
    
    if (newDepartments.length > 0) {
      setCurrentStep(2); // Go to Industries selection
    } else {
      setSectors([]);
      setPainPoints([]);
      setProjects([]);
      setCurrentStep(1);
    }
  };

  const handlePainPointSelection = (painPointName: string) => {
    const newPainPoints = selections.painPoints.includes(painPointName)
      ? selections.painPoints.filter(p => p !== painPointName)
      : [...selections.painPoints, painPointName];
    
    setSelections({ ...selections, painPoints: newPainPoints });
  };

  const resetSelections = () => {
    setSelections({ viewMode: '', industries: [], sectors: [], departments: [], painPoints: [] });
    setSectors([]);
    // Don't clear departments - they are base data needed for the initial screen
    setPainPoints([]);
    setProjects([]);
    setCurrentStep(1);
  };

  const navigateToStep = (stepNumber: number) => {
    // Only allow navigation to completed steps or current step
    if (stepNumber > currentStep) return;

    switch (stepNumber) {
      case 1:
        // Go back to initial state - clear everything and reset to department selection
        resetSelections();
        break;

      case 2:
        // Go back to industry selection - clear sectors and subsequent selections
        setSelections({ ...selections, sectors: [], painPoints: [] });
        setSectors([]);
        setPainPoints([]);
        setProjects([]);
        setCurrentStep(2);
        break;

      case 3:
        // Go back to sector selection - clear pain points and projects
        setSelections({ ...selections, painPoints: [] });
        setPainPoints([]);
        setProjects([]);
        setCurrentStep(3);
        break;

      case 4:
        // Go back to pain point selection - clear projects
        setProjects([]);
        setCurrentStep(4);
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
        <p>Discover AI solutions for Banking & Insurance</p>
      </header>

      <div className="progress-bar">
        <div 
          className={`step ${currentStep >= 1 ? 'active' : ''} ${currentStep > 1 ? 'clickable' : ''}`}
          onClick={() => navigateToStep(1)}
        >
          <span className="step-number">1</span>
          <span className="step-label">Departments</span>
        </div>
        {selections.viewMode === 'sector' && (
          <>
            <div 
              className={`step ${currentStep >= 2 ? 'active' : ''} ${currentStep > 2 ? 'clickable' : ''}`}
              onClick={() => navigateToStep(2)}
            >
              <span className="step-number">2</span>
              <span className="step-label">Industries</span>
            </div>
            <div 
              className={`step ${currentStep >= 3 ? 'active' : ''} ${currentStep > 3 ? 'clickable' : ''}`}
              onClick={() => navigateToStep(3)}
            >
              <span className="step-number">3</span>
              <span className="step-label">Sectors</span>
            </div>
            <div 
              className={`step ${currentStep >= 4 ? 'active' : ''} ${currentStep > 4 ? 'clickable' : ''}`}
              onClick={() => navigateToStep(4)}
            >
              <span className="step-number">4</span>
              <span className="step-label">Pain Points</span>
            </div>
            <div 
              className={`step ${currentStep >= 5 ? 'active' : ''}`}
            >
              <span className="step-number">5</span>
              <span className="step-label">Projects</span>
            </div>
          </>
        )}
      </div>

      <main className="main-content">
        {/* Step 1: Department Selection or Skip */}
        {!selections.viewMode && (
          <div className="selection-section">
            <h2>Select Department</h2>
            <p className="section-description">
              Choose a specific department you're working with, or skip to browse by industry sectors.
            </p>
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
            
            <div className="action-buttons">
              <button 
                className="skip-btn"
                onClick={handleSkipToDepartments}
              >
                Skip → Browse by Industry Sectors
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Industry Selection (Sector Mode Only) */}
        {selections.viewMode === 'sector' && (
          <div className="selection-section">
            <h2>Select Industries</h2>
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
        )}

        {/* Step 3: Sector Selection (Sector Mode) */}
        {selections.viewMode === 'sector' && sectors.length > 0 && (
          <div className="selection-section">
            <h2>Select Sectors</h2>
            <div className="selection-grid">
              {sectors.map(sector => (
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
        )}


        {/* Pain Point Selection */}
        {painPoints.length > 0 && (
          <div className="selection-section">
            <h2>Select Pain Points</h2>
            <div className="selection-grid">
              {painPoints.map(painPoint => (
                <button
                  key={painPoint.name}
                  className={`selection-card ${selections.painPoints.includes(painPoint.name) ? 'selected' : ''}`}
                  onClick={() => handlePainPointSelection(painPoint.name)}
                >
                  <div className="card-content">
                    <div className="card-icon">⚠️</div>
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

        {/* Step 5: Project Results */}
        {projects.length > 0 && (
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