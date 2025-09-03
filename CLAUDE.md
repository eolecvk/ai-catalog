# Claude AI Assistant Guidelines for AI Catalog Project

## Graph Visualization Rules

### ⚠️ CRITICAL: Single Graph View Constraint

**NEVER create dual state management in GraphViz.tsx.** There is ONLY ONE graph view, not an "original view" and a "chat results view".

**NEVER create multiple GraphViz instances.** There must be exactly ONE GraphViz component in App.tsx with consistent props.

**NEVER create new graph visualization components or new views.** Always use the existing graph update mechanism.

### ✅ Correct Graph Update Flow

```
User Action → ChatInterface → App.tsx → GraphViz
```

1. **ChatInterface.tsx**: 
   - Calls `onApplyQueryResult(queryResult)` 
   - `queryResult` must have structure: `{ cypherQuery, graphData: { nodes, edges }, summary }`

2. **App.tsx**: 
   - `handleApplyQueryResult` receives queryResult
   - Calls `handleGraphDataUpdate(nodes, edges)`
   - Updates `graphData` state via `setGraphData({ nodes, edges })`

3. **GraphViz.tsx**: 
   - Receives updated `nodes` and `edges` as props
   - `getCurrentGraphData()` returns updated data
   - Graph visualization updates automatically

### 🚫 Common Mistakes to Avoid

- **Multiple GraphViz instances** - NEVER create duplicate GraphViz components
- **Inconsistent props between instances** - All GraphViz instances must have same props
- **Missing onGraphDataUpdate prop** - Required for graph updates to work
- **Missing enableChat prop** - Required for chat interface functionality
- **Creating new graph components** - Use existing GraphViz
- **Dual state management** - GraphViz should NEVER have internal chat state
- **getCurrentGraphData() pattern** - Use props directly from App.tsx
- **Return to Original View button** - Violates single view constraint
- **Bypassing App.tsx state** - Always go through `handleGraphDataUpdate`
- **Not calling `onApplyQueryResult`** - This is the entry point
- **Wrong data structure** - Must match `ChatQueryResult` interface
- **Missing graph data fields** - Ensure `graphData.nodes` and `graphData.edges` exist

### 🚫 ANTI-PATTERNS: What NOT to Do

#### Multiple GraphViz Instances
```javascript
// ❌ WRONG - Creates inconsistent prop handling and bugs
<div className="graph-section">
  {condition1 ? (
    <GraphViz
      nodes={nodes}
      edges={edges}
      nodeType="all"
      onNodeSelect={handleSelect}
      // Missing onGraphDataUpdate!
      // Missing enableChat!
    />
  ) : (
    <div className="welcome-message">Welcome</div>
  )}
</div>

{/* Elsewhere in same component */}
{condition2 && (
  <GraphViz
    nodes={nodes}
    edges={edges}
    nodeType="all"
    onNodeSelect={handleSelect}
    onGraphDataUpdate={handleUpdate}  // Only this one has it!
    enableChat={true}                 // Only this one has it!
  />
)}
```

**Problems:**
- Different instances have different props
- Chat interface may connect to wrong instance
- Graph updates fail silently
- User sees inconsistent behavior

#### Correct Single GraphViz Instance
```javascript
// ✅ CORRECT - One instance with all required props
<div className="graph-section">
  {graphLoading ? (
    <div className="loading">Loading...</div>
  ) : (
    <GraphViz
      nodes={nodes}
      edges={edges}
      nodeType="all"
      onNodeSelect={handleGraphNodeSelect}
      onNodeDoubleClick={handleGraphNodeEdit}
      onNavigateToNode={handleNavigateToNode}
      focusedNode={focusedGraphNode}
      height="600px"
      enableChat={true}
      graphVersion={currentGraphVersion}
      onGraphDataUpdate={handleGraphDataUpdate}  // Always present
    />
  )}
</div>
```

#### Dual State Management in GraphViz
```javascript
// ❌ WRONG - Creates dual views
const [chatQueryResults, setChatQueryResults] = useState(null);
const [showingChatResults, setShowingChatResults] = useState(false);

const getCurrentGraphData = () => {
  if (showingChatResults && chatQueryResults) {
    return chatQueryResults;  // Chat view
  }
  return { nodes, edges };    // Original view
};

// ❌ WRONG - Internal state fallback
if (onGraphDataUpdate) {
  onGraphDataUpdate(data);
} else {
  setChatQueryResults(data);  // Creates dual state
  setShowingChatResults(true);
}
```

#### Correct Single State Pattern
```javascript
// ✅ CORRECT - Single source of truth
const currentGraphData = { nodes, edges }; // Props from App.tsx

// ✅ CORRECT - Always use parent state
if (onGraphDataUpdate) {
  onGraphDataUpdate(data);
} else {
  console.warn('onGraphDataUpdate not provided');
}
```

### 🔧 Debugging Graph Updates

When graph updates don't work, check:

1. **Data Flow**: Add console.log at each step:
   ```javascript
   // ChatInterface.tsx
   console.log('🎯 Calling onApplyQueryResult:', queryResult);
   
   // App.tsx
   console.log('🎯 handleApplyQueryResult received:', queryResult);
   console.log('📊 Graph data:', queryResult.graphData);
   
   // GraphViz.tsx  
   console.log('🎨 Props updated:', { nodes: nodes.length, edges: edges.length });
   ```

2. **Data Structure**: Verify queryResult has correct shape:
   ```javascript
   {
     cypherQuery: string,
     graphData: {
       nodes: GraphNode[],
       edges: GraphEdge[]  
     },
     summary: string
   }
   ```

3. **State Updates**: Confirm `setGraphData` is called and props are updated

### 📋 Visualization Confirmation Pattern

For large graphs (>100 nodes):

1. **Detection**: Check node count in server response
2. **UI**: Show clickable confirmation buttons (not text input)
3. **Confirmation**: Call `onApplyQueryResult` with the stored graph data
4. **Update**: Follow normal graph update flow

```javascript
// ✅ Correct confirmation handler
const handleVisualizationConfirm = (graphData) => {
  onApplyQueryResult({ 
    cypherQuery: 'MATCH p=(n)-[*0..5]-(m) RETURN p',
    graphData: graphData,
    summary: 'Graph visualization applied via confirmation'
  });
};
```

### 📦 Single Graph View Requirements

**Single GraphViz Instance**: There MUST be exactly one `<GraphViz>` component with all required props:
- `onGraphDataUpdate={handleGraphDataUpdate}` - Required for graph updates
- `enableChat={true}` - Required for chat interface
- All other props consistently applied

**Node/Edge Count Consistency**: When connections are found and counted, node counts MUST update together. This prevents the common issue where:
- Edge count shows new data (e.g., 198 edges)
- Node count shows old data (e.g., 0 nodes)
- User sees inconsistent state

**Root Causes**:
1. **Multiple GraphViz instances** with different props
2. **Dual state management** where GraphViz has internal `chatQueryResults` competing with props from App.tsx

**Solution**: 
1. **One GraphViz instance** with consistent props
2. **GraphViz MUST use only props** as single source of truth

### 🧪 Testing Checklist

Before considering a graph update complete:

- [ ] **Exactly ONE GraphViz instance exists** in App.tsx
- [ ] **GraphViz has onGraphDataUpdate prop** - Required for updates
- [ ] **GraphViz has enableChat={true} prop** - Required for chat
- [ ] Normal queries update the graph
- [ ] Large queries show confirmation UI
- [ ] Confirmation buttons update the graph  
- [ ] **Node and edge counts are consistent**
- [ ] **No "Return to Original View" button exists**
- [ ] **GraphViz uses props directly, no internal chat state**
- [ ] Console shows complete data flow trace
- [ ] No new graph components created
- [ ] GraphViz receives updated props
- [ ] Visual graph updates in browser

### 📄 File Structure

- **ChatInterface.tsx**: Handles user interactions, calls `onApplyQueryResult`
- **App.tsx**: Manages graph state, `handleApplyQueryResult` → `handleGraphDataUpdate`
- **GraphViz.tsx**: Renders visualization from props, `getCurrentGraphData()`
- **types.ts**: Defines `ChatQueryResult` interface

### 🔄 State Management

The graph data flows through React state:
```
Server Response → ChatInterface → App.tsx State → GraphViz Props → Visualization
```

**Never bypass this flow.** Always use the existing state management system.

---

## Port Management & Testing Configuration

### ⚠️ CRITICAL: Port Conflict Prevention

**ALWAYS use dedicated test ports when running tests.** Development and testing must use different ports to prevent conflicts.

### 🔧 Port Configuration

**Development Environment:**
- Backend: `localhost:5002`
- Frontend: `localhost:3001` 
- Configuration: `.env` file

**Test Environment:**
- Backend: `localhost:5004`
- Frontend: `localhost:3004`
- Configuration: `.env.test` file

### 📋 Testing Commands for Claude

**NEVER use `npm run dev` when running tests.** Always use test-specific commands:

#### ✅ Correct Test Commands
```bash
# Check port availability first
npm run check-ports test

# Run test environment (full stack)
npm run test:dev

# Run individual test services
npm run test:services  # Start Neo4j with test ports validation
npm run test:server    # Backend on port 5004
npm run test:client    # Frontend on port 3004

# Run actual tests
npm run test:backend   # Backend tests
npm run test:frontend  # Frontend tests  
npm run test:full      # Complete test suite
```

#### 🚫 Commands to Avoid During Testing
```bash
npm run dev           # ❌ Uses development ports (conflicts!)
npm run dev:full      # ❌ Uses development ports (conflicts!)
npm start             # ❌ Uses development ports (conflicts!)
```

### 🔍 Port Conflict Detection

**Before any testing, run:**
```bash
npm run check-ports test
```

This validates:
- Port 5004 (backend) is available
- Port 3004 (frontend) is available  
- Shows what processes are using conflicting ports
- Provides solutions for conflicts

### 🚨 Troubleshooting Port Conflicts

**If you encounter `ECONNRESET` or proxy errors:**

1. **Check current port usage:**
   ```bash
   npm run check-ports
   lsof -i :5002,:3001,:5004,:3004
   ```

2. **Kill conflicting processes:**
   ```bash
   pkill -f "PORT=5002"  # Kill dev backend
   pkill -f "PORT=3001"  # Kill dev frontend
   pkill -f "react-scripts start"  # Kill React dev server
   ```

3. **Use correct test environment:**
   ```bash
   npm run test:dev      # Not npm run dev!
   ```

### 🏗️ Architecture

**Dynamic Proxy Configuration:**
- `client/setupProxy.js` handles environment-aware proxy routing
- Uses `REACT_APP_BACKEND_PORT` environment variable
- Automatically routes `/api/*` to correct backend port
- Provides detailed logging for debugging

**Environment Files:**
- `.env` - Development configuration
- `.env.test` - Test configuration  
- `client/.env.test` - Frontend test configuration

### 📝 Testing Workflow for Claude

When user asks to run tests:

1. **ALWAYS use test commands:**
   ```bash
   npm run check-ports test  # Validate ports first
   npm run test:dev          # Start test environment
   ```

2. **NEVER assume development environment is suitable for testing**

3. **If conflicts occur:**
   - Run port validation: `npm run check-ports test`
   - Follow suggested solutions
   - Use `pkill` commands to stop conflicting processes

4. **Environment Detection:**
   - Check if development servers are running on 5002/3001
   - If yes, use test environment (5004/3004)
   - Always validate before starting tests

### 🎯 Port Management Rules

1. **Development**: Use `npm run dev` only for development work
2. **Testing**: Always use `npm run test:*` commands
3. **Validation**: Run `npm run check-ports` before starting any services
4. **Conflicts**: Stop conflicting processes, don't work around them
5. **Environment Isolation**: Keep test and development environments completely separate

---

## General Development Principles

### 🎯 Core Philosophy
- **Extend, don't replace** - Use existing patterns and components
- **Debug systematically** - Add logging to trace data flow
- **Test end-to-end** - Verify complete user flows work
- **Document recurring issues** - Update this file when problems repeat

### 📚 Key Learnings
- Graph updates are a recurring issue - always follow the established pattern
- Visualization confirmation requires proper data flow, not string parsing
- Console debugging is essential for tracing React state updates
- The existing architecture works well when followed correctly
- **LLM Cypher Generation**: Sequential queries fail with `relationships(node)` errors - implemented 3-layer protection system (prompt enhancement, validation, recovery)
- **Path/Node Type Mismatches**: Most common LLM error requires automatic detection and fallback query generation

---

## LLM Query Assistant Architecture

### ⚠️ CRITICAL: Understanding the Reasoning Pipeline

The ChatProcessor implements a **4-stage reasoning pipeline** that MUST be preserved during any updates. This system has been carefully designed to handle complex graph queries reliably.

### 🧠 Stage 1: Intent Classification

**Purpose**: Analyze user queries and classify their intent with high accuracy.

**Implementation**: `classifyIntent(query, conversationHistory, reasoningSteps)`

**Process**:
1. **Schema Context**: Provides complete graph schema (nodes + relationships) to LLM
2. **Conversation History**: Uses last 6 messages for contextual understanding
3. **Intent Types**: 
   - `QUERY`: Retrieving existing data (show, find, list, what are)
   - `MUTATION`: Modifying graph (add, create, connect, update, delete)
   - `CREATIVE`: Generate ideas/suggestions (suggest, brainstorm, imagine)
   - `ANALYSIS`: Compare/analyze data (compare, analyze, summarize differences)
   - `UNCLEAR`: Vague or ambiguous requests
4. **Entity Extraction**: Identifies relevant node types from user query
5. **Confidence Scoring**: Returns confidence level (0.0-1.0) for classification

**Critical Rules**:
- LLM must respond with ONLY pure JSON (no markdown, no backticks)
- Temperature set to 0.1 for consistent classification
- Robust error handling with fallback parsing

### 🔍 Stage 2: Context Gathering & Validation

**Purpose**: Validate entities and gather connection context for intelligent query generation.

**Implementation**: `gatherContext(classification, graphContext, reasoningSteps)`

**Process**:
1. **Entity Validation**: Confirms entities exist in schema
2. **Connection Path Analysis**: Discovers available connection patterns
3. **Context Building**: Gathers related data and shared connections
4. **Validation Reporting**: Tracks validation errors and warnings

**Connection Analysis Features**:
- Detects direct connections between entities
- Identifies indirect connection patterns
- Finds shared connections through intermediate nodes
- Provides connection strategy recommendations

### 🎯 Stage 3: Router to Specialized Processors

**Purpose**: Route to appropriate processor based on intent classification.

**Implementation**: `routeToProcessor(classification, contextData, query, conversationHistory, reasoningSteps)`

**Processors**:
- **Query Processor**: Handles data retrieval queries
- **Mutation Processor**: Handles graph modification requests
- **Creative Processor**: Handles brainstorming and suggestion requests
- **Analysis Processor**: Handles comparison and analytical queries

**Reasoning Steps**: Each processor maintains detailed reasoning steps for debugging and transparency.

### ⚡ Stage 4: Cypher Query Generation (Query Processor)

**Purpose**: Generate schema-aware Cypher queries that return proper graph visualization data.

**Implementation**: `generateCypherQuery(query, entities, contextData, reasoningSteps)`

**Critical Features**:
1. **Schema-Aware Prompt**: Includes complete relationship schema
2. **Connection Context**: Uses analysis from Stage 2
3. **Syntax Rules**: Enforces correct Neo4j Cypher syntax
4. **Connection Strategy**: Classifies as direct/indirect/both
5. **Visualization Focus**: Ensures queries return proper graph structure

**Current Schema** (as of latest update):
```javascript
nodeLabels: ['Industry', 'Sector', 'Department', 'PainPoint', 'ProjectOpportunity', 'ProjectBlueprint', 'Role', 'Module', 'SubModule']

relationships: [
  '(Industry)-[:HAS_SECTOR]->(Sector)',
  '(Sector)-[:EXPERIENCES]->(PainPoint)',
  '(Department)-[:EXPERIENCES]->(PainPoint)', 
  '(Sector)-[:HAS_OPPORTUNITY]->(ProjectOpportunity)',
  '(Department)-[:HAS_OPPORTUNITY]->(ProjectOpportunity)',
  '(ProjectOpportunity)-[:ADDRESSES]->(PainPoint)',
  '(ProjectOpportunity)-[:IS_INSTANCE_OF]->(ProjectBlueprint)',
  '(ProjectBlueprint)-[:REQUIRES_ROLE]->(Role)',
  '(ProjectBlueprint)-[:CONTAINS]->(Module)',
  '(Module)-[:NEEDS_SUBMODULE]->(SubModule)'
]
```

### 🔗 Connection Pattern Analysis

**Direct Connections**:
- Industry → Sector (via HAS_SECTOR)
- Sector → PainPoint (via EXPERIENCES)
- Department → PainPoint (via EXPERIENCES)
- Sector → ProjectOpportunity (via HAS_OPPORTUNITY)
- Department → ProjectOpportunity (via HAS_OPPORTUNITY)

**Key Indirect Patterns**:
- **Sector ↔ Department**: Through shared PainPoints or ProjectOpportunities
  - `(Sector)-[:EXPERIENCES]->(PainPoint)<-[:EXPERIENCES]-(Department)`
  - `(Sector)-[:HAS_OPPORTUNITY]->(ProjectOpportunity)<-[:HAS_OPPORTUNITY]-(Department)`
- **Industry → Department**: Through Sector → PainPoint path
- **PainPoint → ProjectBlueprint**: Through ProjectOpportunity → IS_INSTANCE_OF path

### ⚠️ Critical Query Generation Rules

**MUST Include Relationships in Results**:
```cypher
// ❌ WRONG - Returns nodes only, creates 0 edges
MATCH (s:Sector)-[:EXPERIENCES]->(shared:PainPoint)<-[:EXPERIENCES]-(d:Department) 
RETURN s, shared, d

// ✅ CORRECT - Returns relationships, creates proper edges  
MATCH (s:Sector)-[r1:EXPERIENCES]->(shared:PainPoint)<-[r2:EXPERIENCES]-(d:Department) 
RETURN s, r1, shared, r2, d
```

**Path-based Queries**:
```cypher
// ✅ For complex paths
MATCH path = (s:Sector)-[:EXPERIENCES*1..2]-(d:Department) 
RETURN path
```

**Syntax Validation Rules**:
- `relationships()` function requires Path, not Node
- Variable-length patterns: `[:REL*1..3]` not `[:REL1|REL2*1..3]`
- Always validate query returns proper visualization structure

### 🚨 Common LLM Query Errors & Solutions

**Most Frequent Issue**: `Neo4jError: Type mismatch: expected Path but was Node`

**Root Cause**: LLM generates `relationships(node)` instead of proper patterns

**❌ Problematic Patterns Generated by LLM**:
```cypher
// ERROR: relationships() function with Node variable
RETURN sector, relationships(sector), painPoint

// ERROR: nodes() function with Node variable  
RETURN industry, nodes(industry), connections

// ERROR: Invalid variable-length syntax
MATCH (a)-[:REL1|REL2*1..3]->(b) RETURN a, b
```

**✅ Correct Patterns**:
```cypher
// SOLUTION 1: Use path variable
MATCH path = (industry:Industry)-[:HAS_SECTOR]->(sector:Sector) 
RETURN path

// SOLUTION 2: Name relationship variables explicitly
MATCH (industry:Industry)-[r:HAS_SECTOR]->(sector:Sector) 
RETURN industry, r, sector

// SOLUTION 3: For complex paths
MATCH path = (a)-[*1..3]->(b) 
RETURN nodes(path), relationships(path)
```

**Automated Recovery System**:
The ChatProcessor now includes three layers of protection:

1. **Enhanced LLM Prompt**: Explicit forbidden patterns with emojis and strong formatting
2. **Query Validation Layer**: `validateAndFixCypherQuery()` detects and auto-fixes common patterns
3. **Error Recovery**: `generateFallbackQuery()` provides robust fallback queries when validation fails

**Detection Patterns**:
```javascript
// The system detects these error messages:
- "expected Path but was Node"
- "Invalid input 'Node' for argument at index 0 of function relationships()"
- "Invalid input 'Node' for argument at index 0 of function nodes()"
```

**Recovery Strategy**:
1. Detect Path/Node type mismatch errors
2. Generate simple, robust fallback queries based on entities
3. Retry with fallback query automatically
4. Log all recovery attempts for monitoring

### 🛠️ Debugging and Monitoring

**Reasoning Steps Tracking**:
Each stage adds detailed reasoning steps with:
- Stage name and description
- Input/output data
- Execution time and confidence
- Metadata for debugging

**Console Logging**:
- Intent classification results
- Connection analysis findings  
- Generated Cypher queries
- Query execution results
- Graph formatting statistics

**Error Handling**:
- JSON parsing fallbacks for LLM responses
- Schema validation error reporting
- Query execution error recovery
- Graceful degradation for unclear queries

### 🔄 Result Formatting Pipeline

**Graph Data Processing**: `formatGraphData(result)`

**Handles Multiple Neo4j Result Types**:
1. **Path Objects**: Extracts nodes and relationships from path segments
2. **Direct Nodes**: Processes individual node returns
3. **Direct Relationships**: Processes individual relationship returns
4. **Arrays**: Handles collections of nodes/relationships

**Critical Processing Rules**:
- Nodes: Must have `identity` and `labels` properties
- Relationships: Must have `type`, `start`, and `end` properties  
- Edge IDs: Format as `${start}-${end}-${type}` for uniqueness
- Deduplication: Uses Maps to prevent duplicate nodes/edges

### 📋 Maintenance Guidelines

**When Adding New Node Types**:
1. Update `nodeLabels` array in schema
2. Add relationship patterns to `relationships` array
3. Update connection pattern documentation
4. Test query generation with new entities

**When Adding New Relationships**:
1. Add to `relationships` array with proper direction
2. Document indirect patterns it enables
3. Add example queries that return relationships
4. Update connection analysis logic if needed

**When Modifying Cypher Generation**:
1. Preserve existing syntax rules
2. Ensure relationships are always returned
3. Test with various entity combinations
4. Verify graph visualization receives proper edges

**Testing Checklist for LLM Changes**:
- [ ] Intent classification accuracy maintained
- [ ] Entity extraction works for new patterns
- [ ] Connection analysis finds all relevant paths
- [ ] Generated queries return both nodes AND relationships
- [ ] Graph visualization displays properly connected nodes
- [ ] Reasoning steps provide clear debugging information
- [ ] Error handling works for edge cases
- [ ] **No `relationships(node)` patterns in generated queries**
- [ ] **Sequential queries work without Path/Node type errors**
- [ ] **Query validation layer detects and fixes common syntax errors**
- [ ] **Fallback query generation works when validation fails**
- [ ] **Error recovery logs provide clear debugging information**