import React, { useState } from 'react';
import { ChatQueryResult } from '../types';
import ChatInterface from './ChatInterface';

interface TabbedSidebarProps {
  onApplyQueryResult?: (queryResult: ChatQueryResult) => void;
  onNavigateToNode?: (nodeId: string) => void;
  graphContext?: {
    currentNodeType?: string;
    selectedNodes?: string[];
    graphVersion?: string;
  };
  nodeStats?: {
    industries: number;
    sectors: number;
    departments: number;
    painPoints: number;
    projects: number;
  };
  selectedNodeDetails?: {
    type: string;
    label: string;
    properties: any;
    relationships?: any[];
  } | null;
}

type TabType = 'query' | 'summary' | 'details';

const TabbedSidebar: React.FC<TabbedSidebarProps> = ({
  onApplyQueryResult,
  onNavigateToNode,
  graphContext,
  nodeStats,
  selectedNodeDetails
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('query');

  const renderTabContent = () => {
    switch (activeTab) {
      case 'query':
        return (
          <div className="tab-content">
            <ChatInterface
              onApplyQueryResult={onApplyQueryResult}
              onNavigateToNode={onNavigateToNode}
              graphContext={graphContext}
            />
          </div>
        );

      case 'summary':
        return (
          <div className="tab-content summary-content">
            <h3>Graph Overview</h3>
            {nodeStats ? (
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-number">{nodeStats.industries}</div>
                  <div className="stat-label">Industries</div>
                </div>
                <div className="stat-card">
                  <div className="stat-number">{nodeStats.sectors}</div>
                  <div className="stat-label">Sectors</div>
                </div>
                <div className="stat-card">
                  <div className="stat-number">{nodeStats.departments}</div>
                  <div className="stat-label">Departments</div>
                </div>
                <div className="stat-card">
                  <div className="stat-number">{nodeStats.painPoints}</div>
                  <div className="stat-label">Pain Points</div>
                </div>
                <div className="stat-card">
                  <div className="stat-number">{nodeStats.projects}</div>
                  <div className="stat-label">Projects</div>
                </div>
              </div>
            ) : (
              <div className="loading-stats">Loading statistics...</div>
            )}
          </div>
        );

      case 'details':
        return (
          <div className="tab-content details-content">
            {selectedNodeDetails ? (
              <>
                <h3>Node Details</h3>
                <div className="node-details-card">
                  <div className="node-header">
                    <span className={`node-type-badge ${selectedNodeDetails.type.toLowerCase()}`}>
                      {selectedNodeDetails.type}
                    </span>
                    <h4>{selectedNodeDetails.label}</h4>
                  </div>
                  
                  <div className="node-properties">
                    <h5>Properties</h5>
                    {Object.entries(selectedNodeDetails.properties).map(([key, value]) => (
                      <div key={key} className="property-row">
                        <span className="property-key">{key}:</span>
                        <span className="property-value">{String(value)}</span>
                      </div>
                    ))}
                  </div>

                  {selectedNodeDetails.relationships && selectedNodeDetails.relationships.length > 0 && (
                    <div className="node-relationships">
                      <h5>Relationships</h5>
                      {selectedNodeDetails.relationships.map((rel, index) => (
                        <div key={index} className="relationship-row">
                          <span className="relationship-type">{rel.type}</span>
                          <span className="relationship-target">{rel.targetLabel}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="no-selection">
                <div className="no-selection-icon">🎯</div>
                <h3>No Node Selected</h3>
                <p>Click on a node in the graph to see its details here.</p>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="tabbed-sidebar">
      <div className="tab-header">
        <button
          className={`tab-button ${activeTab === 'query' ? 'active' : ''}`}
          onClick={() => setActiveTab('query')}
        >
          💬 Query
        </button>
        <button
          className={`tab-button ${activeTab === 'summary' ? 'active' : ''}`}
          onClick={() => setActiveTab('summary')}
        >
          📊 Summary
        </button>
        <button
          className={`tab-button ${activeTab === 'details' ? 'active' : ''}`}
          onClick={() => setActiveTab('details')}
        >
          🔍 Details
        </button>
      </div>
      
      <div className="tab-content-wrapper">
        {renderTabContent()}
      </div>
    </div>
  );
};

export default TabbedSidebar;