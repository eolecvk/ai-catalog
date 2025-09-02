import React, { useState } from 'react';
import { ChatQueryResult } from '../types';

interface QueryResultProps {
  queryResult: ChatQueryResult;
  onApplyToGraph?: (queryResult: ChatQueryResult) => void;
}

const QueryResult: React.FC<QueryResultProps> = ({ 
  queryResult, 
  onApplyToGraph 
}) => {
  const [showCypher, setShowCypher] = useState(false);

  const handleApplyToGraph = () => {
    console.log('Visualize in Graph button clicked');
    console.log('queryResult:', queryResult);
    console.log('onApplyToGraph function:', onApplyToGraph);
    
    if (onApplyToGraph) {
      console.log('Calling onApplyToGraph with queryResult');
      onApplyToGraph(queryResult);
    } else {
      console.log('ERROR: onApplyToGraph is not defined!');
    }
  };

  return (
    <div className="query-result">
      <div className="query-result-header">
        <span className="result-summary">{queryResult.summary}</span>
        {queryResult.executionTime && (
          <span className="execution-time">
            ({queryResult.executionTime}ms)
          </span>
        )}
      </div>

      <div className="query-result-stats">
        <div className="stat">
          <strong>{queryResult.graphData.nodes.length}</strong> nodes
        </div>
        <div className="stat">
          <strong>{queryResult.graphData.edges.length}</strong> relationships
        </div>
      </div>

      <div className="query-result-actions">
        <button 
          className="apply-to-graph-btn"
          onClick={handleApplyToGraph}
          disabled={queryResult.graphData.nodes.length === 0}
        >
          📊 Visualize in Graph
        </button>
        
        <button 
          className="toggle-cypher-btn"
          onClick={() => setShowCypher(!showCypher)}
        >
          {showCypher ? '🔽' : '▶️'} {showCypher ? 'Hide' : 'Show'} Cypher
        </button>
      </div>

      {showCypher && (
        <div className="cypher-query">
          <code>{queryResult.cypherQuery}</code>
        </div>
      )}

      {queryResult.graphData.nodes.length > 0 && (
        <div className="result-preview">
          <div className="preview-section">
            <h4>Nodes Found:</h4>
            <div className="node-list">
              {queryResult.graphData.nodes.slice(0, 5).map(node => (
                <span key={node.id} className={`node-chip ${node.group.toLowerCase()}`}>
                  {node.label}
                </span>
              ))}
              {queryResult.graphData.nodes.length > 5 && (
                <span className="more-indicator">
                  +{queryResult.graphData.nodes.length - 5} more
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QueryResult;