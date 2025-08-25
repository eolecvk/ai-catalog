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
    industries: [],
    sectors: [],
    departments: [],
    painPoints: []
  });

  useEffect(() => {
    fetchIndustries();
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

  const fetchDepartments = async (selectedSectors: string[]) => {
    setLoading(true);
    try {
      const response = await fetch('/api/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectors: selectedSectors })
      });
      const data = await response.json();
      setDepartments(data);
    } catch (error) {
      console.error('Error fetching departments:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPainPoints = async (selectedSectors: string[], selectedDepartments: string[]) => {
    setLoading(true);
    try {
      const response = await fetch('/api/painpoints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectors: selectedSectors, departments: selectedDepartments })
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
      setCurrentStep(5);
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
    
    setSelections({ ...selections, industries: newIndustries });
    
    if (newIndustries.length > 0) {
      fetchSectors(newIndustries);
    } else {
      setSectors([]);
      setDepartments([]);
      setPainPoints([]);
      setProjects([]);
      setCurrentStep(1);
    }
  };

  const handleSectorSelection = (sectorName: string) => {
    const newSectors = selections.sectors.includes(sectorName)
      ? selections.sectors.filter(s => s !== sectorName)
      : [...selections.sectors, sectorName];
    
    setSelections({ ...selections, sectors: newSectors });
    
    if (newSectors.length > 0) {
      fetchDepartments(newSectors);
      setCurrentStep(3);
    } else {
      setDepartments([]);
      setPainPoints([]);
      setProjects([]);
      setCurrentStep(2);
    }
  };

  const handleDepartmentSelection = (departmentName: string) => {
    const newDepartments = selections.departments.includes(departmentName)
      ? selections.departments.filter(d => d !== departmentName)
      : [...selections.departments, departmentName];
    
    setSelections({ ...selections, departments: newDepartments });
    
    if (newDepartments.length > 0) {
      fetchPainPoints(selections.sectors, newDepartments);
      setCurrentStep(4);
    } else {
      setPainPoints([]);
      setProjects([]);
      setCurrentStep(3);
    }
  };

  const handlePainPointSelection = (painPointName: string) => {
    const newPainPoints = selections.painPoints.includes(painPointName)
      ? selections.painPoints.filter(p => p !== painPointName)
      : [...selections.painPoints, painPointName];
    
    setSelections({ ...selections, painPoints: newPainPoints });
  };

  const resetSelections = () => {
    setSelections({ industries: [], sectors: [], departments: [], painPoints: [] });
    setSectors([]);
    setDepartments([]);
    setPainPoints([]);
    setProjects([]);
    setCurrentStep(1);
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
        <div className={`step ${currentStep >= 1 ? 'active' : ''}`}>
          <span className="step-number">1</span>
          <span className="step-label">Industries</span>
        </div>
        <div className={`step ${currentStep >= 2 ? 'active' : ''}`}>
          <span className="step-number">2</span>
          <span className="step-label">Sectors</span>
        </div>
        <div className={`step ${currentStep >= 3 ? 'active' : ''}`}>
          <span className="step-number">3</span>
          <span className="step-label">Departments</span>
        </div>
        <div className={`step ${currentStep >= 4 ? 'active' : ''}`}>
          <span className="step-number">4</span>
          <span className="step-label">Pain Points</span>
        </div>
        <div className={`step ${currentStep >= 5 ? 'active' : ''}`}>
          <span className="step-number">5</span>
          <span className="step-label">Projects</span>
        </div>
      </div>

      <main className="main-content">
        {/* Step 1: Industry Selection */}
        <div className="selection-section">
          <h2>Select Industries</h2>
          <div className="selection-grid">
            {industries.map(industry => (
              <button
                key={industry.name}
                className={`selection-card ${selections.industries.includes(industry.name) ? 'selected' : ''}`}
                onClick={() => handleIndustrySelection(industry.name)}
              >
                <div className="card-icon">🏦</div>
                <h3>{industry.name}</h3>
              </button>
            ))}
          </div>
        </div>

        {/* Step 2: Sector Selection */}
        {sectors.length > 0 && (
          <div className="selection-section">
            <h2>Select Sectors</h2>
            <div className="selection-grid">
              {sectors.map(sector => (
                <button
                  key={sector.name}
                  className={`selection-card ${selections.sectors.includes(sector.name) ? 'selected' : ''}`}
                  onClick={() => handleSectorSelection(sector.name)}
                >
                  <div className="card-icon">🏢</div>
                  <h3>{sector.name}</h3>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Department Selection */}
        {departments.length > 0 && (
          <div className="selection-section">
            <h2>Select Departments</h2>
            <div className="selection-grid">
              {departments.map(department => (
                <button
                  key={department.name}
                  className={`selection-card ${selections.departments.includes(department.name) ? 'selected' : ''}`}
                  onClick={() => handleDepartmentSelection(department.name)}
                >
                  <div className="card-icon">🏛️</div>
                  <h3>{department.name}</h3>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 4: Pain Point Selection */}
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
                  <div className="card-icon">⚠️</div>
                  <h3>{painPoint.name}</h3>
                  {painPoint.impact && (
                    <div className="impact-badge">
                      Impact: {painPoint.impact}
                    </div>
                  )}
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