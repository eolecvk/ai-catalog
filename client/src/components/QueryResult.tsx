import React, { useState } from 'react';
import { ChatQueryResult } from '../types';

interface QueryResultProps {
  queryResult: ChatQueryResult;
  onApplyToGraph?: (queryResult: ChatQueryResult) => void;
  onNavigateToNode?: (nodeId: string) => void;
}

const QueryResult: React.FC<QueryResultProps> = ({ 
  queryResult, 
  onApplyToGraph,
  onNavigateToNode 
}) => {
  const [showCypher, setShowCypher] = useState(false);


  // Only render if there's actual content to show
  if (!queryResult.cypherQuery || queryResult.cypherQuery.trim() === '') {
    return null;
  }

  return (
    <div className="query-result">
      <div className="query-result-actions">
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
    </div>
  );
};

export default QueryResult;