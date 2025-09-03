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