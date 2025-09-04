# Claude AI Assistant Guidelines for AI Catalog Project

## Quick Reference - Common Issues and Solutions

### Most Common Problems:
1. Graph not updating - Check onGraphDataUpdate prop is present
2. White text on white background - Use dark text (#1a202c) on light backgrounds
3. Port conflicts during testing - Use npm run test:dev not npm run dev
4. Cypher query errors - Check for relationships(node) anti-pattern
5. Multiple GraphViz instances - Ensure only ONE instance in App.tsx

---

## Graph Visualization Rules

### CRITICAL: Single Graph View Constraint

NEVER create dual state management in GraphViz.tsx. There is ONLY ONE graph view, not an "original view" and a "chat results view".

NEVER create multiple GraphViz instances. There must be exactly ONE GraphViz component in App.tsx with consistent props.

NEVER create new graph visualization components or new views. Always use the existing graph update mechanism.

### Correct Graph Update Flow

```
User Action -> ChatInterface -> App.tsx -> GraphViz
```

1. ChatInterface.tsx:
   - Calls onApplyQueryResult(queryResult)
   - queryResult must have structure: { cypherQuery, graphData: { nodes, edges }, summary }

2. App.tsx:
   - handleApplyQueryResult receives queryResult
   - Calls handleGraphDataUpdate(nodes, edges)
   - Updates graphData state via setGraphData({ nodes, edges })

3. GraphViz.tsx:
   - Receives updated nodes and edges as props
   - getCurrentGraphData() returns updated data
   - Graph visualization updates automatically

### Common Mistakes to Avoid

- Multiple GraphViz instances - NEVER create duplicate GraphViz components
- Inconsistent props between instances - All GraphViz instances must have same props
- Missing onGraphDataUpdate prop - Required for graph updates to work
- Missing enableChat prop - Required for chat interface functionality
- Creating new graph components - Use existing GraphViz
- Dual state management - GraphViz should NEVER have internal chat state
- getCurrentGraphData() pattern - Use props directly from App.tsx
- Return to Original View button - Violates single view constraint
- Bypassing App.tsx state - Always go through handleGraphDataUpdate
- Not calling onApplyQueryResult - This is the entry point
- Wrong data structure - Must match ChatQueryResult interface
- Missing graph data fields - Ensure graphData.nodes and graphData.edges exist

### ANTI-PATTERNS: What NOT to Do

#### Multiple GraphViz Instances
```javascript
// WRONG - Creates inconsistent prop handling and bugs
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

#### Correct Single GraphViz Instance
```javascript
// CORRECT - One instance with all required props
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
// WRONG - Creates dual views
const [chatQueryResults, setChatQueryResults] = useState(null);
const [showingChatResults, setShowingChatResults] = useState(false);

const getCurrentGraphData = () => {
  if (showingChatResults && chatQueryResults) {
    return chatQueryResults;  // Chat view
  }
  return { nodes, edges };    // Original view
};

// WRONG - Internal state fallback
if (onGraphDataUpdate) {
  onGraphDataUpdate(data);
} else {
  setChatQueryResults(data);  // Creates dual state
  setShowingChatResults(true);
}
```

#### Correct Single State Pattern
```javascript
// CORRECT - Single source of truth
const currentGraphData = { nodes, edges }; // Props from App.tsx

// CORRECT - Always use parent state
if (onGraphDataUpdate) {
  onGraphDataUpdate(data);
} else {
  console.warn('onGraphDataUpdate not provided');
}
```

### Error Boundaries for Graph Components

```javascript
// Add error boundary wrapper for GraphViz
class GraphErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Graph Error:', error, errorInfo);
    // Log to monitoring service
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-state">
          <h2>Graph visualization error</h2>
          <button onClick={() => this.setState({ hasError: false })}>
            Reset Graph
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

### Debugging Graph Updates

When graph updates don't work, check:

1. Data Flow: Add console.log at each step:
   ```javascript
   // ChatInterface.tsx
   console.log('Calling onApplyQueryResult:', queryResult);

   // App.tsx
   console.log('handleApplyQueryResult received:', queryResult);
   console.log('Graph data:', queryResult.graphData);

   // GraphViz.tsx  
   console.log('Props updated:', { nodes: nodes.length, edges: edges.length });
   ```

2. Data Structure: Verify queryResult has correct shape:
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

3. State Updates: Confirm setGraphData is called and props are updated

### Visualization Confirmation Pattern

For large graphs (>100 nodes):

1. Detection: Check node count in server response
2. UI: Show clickable confirmation buttons (not text input)
3. Confirmation: Call onApplyQueryResult with the stored graph data
4. Update: Follow normal graph update flow

```javascript
// Correct confirmation handler
const handleVisualizationConfirm = (graphData) => {
  onApplyQueryResult({
    cypherQuery: 'MATCH p=(n)-[*0..5]-(m) RETURN p',
    graphData: graphData,
    summary: 'Graph visualization applied via confirmation'
  });
};
```

### Testing Checklist

Before considering a graph update complete:

- Exactly ONE GraphViz instance exists in App.tsx
- GraphViz has onGraphDataUpdate prop - Required for updates
- GraphViz has enableChat={true} prop - Required for chat
- Normal queries update the graph
- Large queries show confirmation UI
- Confirmation buttons update the graph  
- Node and edge counts are consistent
- No "Return to Original View" button exists
- GraphViz uses props directly, no internal chat state
- Console shows complete data flow trace
- No new graph components created
- GraphViz receives updated props
- Visual graph updates in browser

---

## State Management Architecture

### Single Source of Truth Principle

The graph data flows through React state:
```
Server Response -> ChatInterface -> App.tsx State -> GraphViz Props -> Visualization
```

Never bypass this flow. Always use the existing state management system.

### State Management Rules

1. Never pass graph data through multiple components without clear ownership
2. App.tsx owns graph state - all updates go through it
3. Implement version tracking for debugging: graphVersion state
4. Use React.memo() for GraphViz with proper comparison function

### Memory Leak Prevention

```javascript
// WRONG - Event listeners not cleaned up
useEffect(() => {
  window.addEventListener('resize', handleResize);
  // Missing cleanup!
});

// CORRECT - Proper cleanup
useEffect(() => {
  window.addEventListener('resize', handleResize);
  return () => window.removeEventListener('resize', handleResize);
}, []);
```

### Infinite Loop Prevention

```javascript
// WRONG - Missing dependency array causes infinite loop
useEffect(() => {
  setGraphData({...graphData, updated: true});
});

// CORRECT - Proper dependencies
useEffect(() => {
  if (needsUpdate) {
    setGraphData(prev => ({...prev, updated: true}));
  }
}, [needsUpdate]);
```

---

## Port Management and Testing Configuration

### CRITICAL: Port Conflict Prevention

ALWAYS use dedicated test ports when running tests. Development and testing must use different ports to prevent conflicts.

### Port Configuration

Development Environment:
- Backend: localhost:5002
- Frontend: localhost:3001
- Configuration: .env file

Test Environment:
- Backend: localhost:5004
- Frontend: localhost:3004
- Configuration: .env.test file

### Testing Commands

NEVER use npm run dev when running tests. Always use test-specific commands:

#### Correct Test Commands
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

#### Commands to Avoid During Testing
```bash
npm run dev           # Uses development ports (conflicts!)
npm run dev:full      # Uses development ports (conflicts!)
npm start             # Uses development ports (conflicts!)
```

### Port Conflict Detection

Before any testing, run:
```bash
npm run check-ports test
```

This validates:
- Port 5004 (backend) is available
- Port 3004 (frontend) is available  
- Shows what processes are using conflicting ports
- Provides solutions for conflicts

### Troubleshooting Port Conflicts

If you encounter ECONNRESET or proxy errors:

1. Check current port usage:
   ```bash
   npm run check-ports
   lsof -i :5002,:3001,:5004,:3004
   ```

2. Kill conflicting processes:
   ```bash
   pkill -f "PORT=5002"  # Kill dev backend
   pkill -f "PORT=3001"  # Kill dev frontend
   pkill -f "react-scripts start"  # Kill React dev server
   ```

3. Use correct test environment:
   ```bash
   npm run test:dev      # Not npm run dev!
   ```

---

## UI/UX Design Guidelines

### CRITICAL: Font Color vs Background Color Contrast

NEVER use similar colors for text and backgrounds. This is a recurring issue that creates unreadable interfaces.

### Common Mistakes to Avoid

#### White Text on White Background
```css
/* WRONG - Invisible text */
.primary-panel {
  background: rgba(255, 255, 255, 0.98); /* Almost white background */
}
.welcome-content {
  color: white; /* White text - invisible! */
}

/* WRONG - Low contrast borders */
.graph-welcome-state {
  background: rgba(255, 255, 255, 0.05); /* Light background */
  border: 2px dashed rgba(255, 255, 255, 0.2); /* Light border - invisible! */
}
```

#### Correct Contrast Patterns
```css
/* CORRECT - Dark text on light background */
.primary-panel {
  background: rgba(255, 255, 255, 0.98); /* Light background */
}
.welcome-content {
  color: #1a202c; /* Dark text - readable! */
}

/* CORRECT - Contrasting borders */
.graph-welcome-state {
  background: rgba(41, 128, 185, 0.05); /* Subtle blue background */
  border: 2px dashed rgba(41, 128, 185, 0.3); /* Blue border - visible! */
}
```

### Color Contrast Checklist

Before implementing any UI component:

- Light backgrounds: Use dark text colors (#1a202c, #2d3748, #4a5568)
- Dark backgrounds: Use light text colors (white, rgba(255,255,255,0.9), rgba(255,255,255,0.8))
- Borders and outlines: Use contrasting colors from background
- Test readability: Ensure minimum 4.5:1 contrast ratio (WCAG AA)
- Check in different lighting: Text should be readable in bright/dim environments

### Recommended Color Combinations

For Light Backgrounds (rgba(255,255,255,0.9+)):
- Primary text: #1a202c (dark slate)
- Secondary text: #4a5568 (medium gray)  
- Muted text: #718096 (light gray)
- Borders: Use app theme colors with sufficient opacity

For Dark Backgrounds (rgba(0,0,0,0.5+) or app dark themes):
- Primary text: white or rgba(255,255,255,0.9)
- Secondary text: rgba(255,255,255,0.8)
- Muted text: rgba(255,255,255,0.6)
- Borders: rgba(255,255,255,0.2) minimum

### Z-index Management

Maintain consistent z-index hierarchy:
- Base content: 0
- Floating panels: 100
- Dropdowns: 500
- Chat overlay: 1000
- Modals: 2000
- Tooltips: 3000
- Never use arbitrary z-index values

### Loading States

- Show skeleton loaders for content, not spinners
- Preserve layout during loading to prevent jumps
- Show progress bars for operations longer than 3 seconds
- Maintain button positions during state changes

---
# LLM Query Assistant Architecture V2: Orchestrated Execution

This document outlines an updated architecture that evolves from a rigid 4-stage pipeline to a dynamic, plan-based execution model. The core goal remains the same: to reliably handle complex graph queries. However, the LLM's role shifts from a classifier to a **planner**, creating a sequence of tasks for an orchestrator to execute.

## Core Architecture: The Orchestrator and Execution Plan

The new architecture is centered around two key components:

1.  **Execution Plan Generator (LLM)**: The LLM's primary role is to analyze the user's request and generate a structured, step-by-step **Execution Plan** in JSON format. This plan consists of discrete, well-defined tasks.
2.  **Orchestrator**: A deterministic component that reads the execution plan, executes each task in order, manages the state (passing outputs from one step to the inputs of the next), evaluates conditions, and short-circuits the plan if a step fails or requires user clarification.

This approach replaces the sequential four-stage pipeline with a more flexible and transparent system.

---

### Stage 1: Execution Plan Generation

**Purpose**: To translate a natural language user query into a machine-readable list of executable tasks.

**Implementation**: `generateExecutionPlan(query, conversationHistory, availableTasks)`

**Process**:
1.  **Task-Oriented Prompt**: The LLM is provided with the user query, conversation history, and a list of available tasks (tools) it can use.
2.  **Plan Generation**: The LLM constructs a JSON object representing the plan. Each task in the plan includes:
    * `task_type`: The name of the function to call (e.g., `validate_entity`, `generate_cypher`).
    * `params`: The arguments for the task, which can be static values or references to the output of previous tasks.
    * `on_failure`: A conditional instruction defining what to do if the task fails, enabling graceful error handling and short-circuiting.
    * `reasoning`: A brief explanation of why this task is necessary.

**Example Execution Plan:**

For a user query like: *"Compare pain points between the Sector and Department nodes."*

```json
{
  "plan": [
    {
      "task_type": "validate_entity",
      "params": { "entity_type": "Sector" },
      "on_failure": "clarify_and_halt",
      "reasoning": "Confirm the 'Sector' node type exists in the schema."
    },
    {
      "task_type": "validate_entity",
      "params": { "entity_type": "Department" },
      "on_failure": "clarify_and_halt",
      "reasoning": "Confirm the 'Department' node type exists in the schema."
    },
    {
      "task_type": "generate_cypher",
      "params": {
        "goal": "Find all pain points connected to Sectors",
        "entities": ["Sector", "PainPoint"]
      },
      "reasoning": "Create a query to fetch the first dataset for comparison."
    },
    {
      "task_type": "execute_cypher",
      "params": { "query": "$step3.output" },
      "reasoning": "Run the first query against the graph database."
    },
    {
      "task_type": "generate_cypher",
      "params": {
        "goal": "Find all pain points connected to Departments",
        "entities": ["Department", "PainPoint"]
      },
      "reasoning": "Create a query to fetch the second dataset for comparison."
    },
    {
      "task_type": "execute_cypher",
      "params": { "query": "$step5.output" },
      "reasoning": "Run the second query against the graph database."
    },
    {
      "task_type": "analyze_and_summarize",
      "params": {
        "dataset1": "$step4.output",
        "dataset2": "$step6.output"
      },
      "reasoning": "Use the LLM to compare the two sets of pain points and generate a summary."
    }
  ]
}


## Stage 2: The Orchestrator

**Purpose**: To execute the generated plan, manage state, and handle logic.

**Process**:

1.  **Plan Ingestion**: The Orchestrator receives the JSON plan from the LLM.
2.  **Sequential Execution**: It iterates through the tasks one by one.
3.  **State Management**: The output of each successfully completed task is stored and can be referenced by subsequent tasks (e.g., `$step3.output`).
4.  **Conditional Logic & Short-Circuiting**: Before executing a task, the Orchestrator checks its dependencies. If a preceding task failed and the `on_failure` action is `clarify_and_halt`, the Orchestrator stops execution and returns the specified clarification message to the user. This prevents executing a flawed or incomplete plan.

---

## The Task Library (Tools)

This is a collection of deterministic, single-purpose functions that the execution plan can invoke. This library is easily extensible.

**Core Tasks**:

* `validate_entity`: Checks if an entity type (node label) exists in the graph schema.
* `find_connection_paths`: Analyzes the schema to determine the most likely connection path between two or more entities.
* `generate_cypher`: A focused LLM call to generate a Cypher query for a *specific, well-defined goal*. This task inherits all the critical query generation rules, error patterns, and best practices from the original plan.
* `execute_cypher`: Runs a query against the Neo4j database and returns the result. Includes automated recovery and validation.
* `analyze_and_summarize`: Uses an LLM to perform higher-level analysis on data returned from the graph (e.g., comparison, summarization).
* `generate_creative_text`: Uses an LLM for brainstorming or idea generation based on context from the graph.
* `clarify_with_user`: Halts execution and poses a question to the user to resolve ambiguity.

---

## Cypher Generation & Validation

While `generate_cypher` is now a single task, all previous critical rules, schema contexts, and safety checks are preserved and enforced within this task's implementation.

* **Schema Context**: The task is always provided with the current graph schema to ensure generated queries are valid.
* **Critical Query Rules**: The prompt for this task explicitly includes the rules for returning relationships (e.g., `RETURN s, r1, p, r2, d`) to ensure proper graph visualization.
* **Automated Recovery**: The `execute_cypher` task contains the validation and auto-fixing logic (`validateAndFixCypherQuery()`). If a query generated by the `generate_cypher` task fails with a common error (e.g., `Type mismatch: expected Path but was Node`), this task can attempt to fix it or trigger a fallback plan.

The graph schema remains unchanged:
```
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

## Security and Optimization

These principles from the original plan are maintained and integrated into the new architecture.

* **Security**: Cypher injection prevention is handled within the `execute_cypher` task by parameterizing queries and validating inputs.
* **Optimization**: Caching, rate limiting, and timeouts are managed by the Orchestrator as it executes tasks. Successful plans or query fragments can be cached to speed up future, similar requests.

---

## V2 Architecture: Critical Issues and Solutions

### **CRITICAL**: Graph Visualization Must Always Be Displayed

**Problem**: When execution plans include both `execute_cypher` (returns graph data) and `analyze_and_summarize` steps, the analysis result overwrites the query result, causing graph visualization to be lost.

**Root Cause**: In `Orchestrator.js`, the result handling logic processes results sequentially but uses destructive assignment:
1. `execute_cypher` sets `finalResult = { type: 'query', graphData: ... }` ✅
2. `analyze_and_summarize` overwrites with `finalResult = { type: 'analysis', analysis: ... }` ❌

**Solution Implemented**: Modified Orchestrator result handling to preserve graph data when analysis is added:
```javascript
// Handle analysis results
if (taskResult.output && taskResult.output.analysis) {
  if (finalResult && finalResult.graphData) {
    // Enhance existing query result with analysis
    finalResult.analysis = taskResult.output.analysis;
    finalResult.summary = taskResult.output.analysis;
  } else {
    // Only analysis, no previous graph data
    finalResult = {
      type: 'analysis',
      analysis: taskResult.output.analysis,
      summary: taskResult.output.analysis
    };
  }
}
```

### **Execution Plan Optimization Opportunities**

Current execution patterns often include redundant steps:

#### **Common Inefficiencies**:
1. **Redundant Entity Validation**: Validating known schema entities (`Industry`, `Sector`, `PainPoint`)
2. **Unused Connection Path Analysis**: Generating verbose Neo4j path objects that aren't utilized
3. **Inconsistent Validation Logic**: Validating some entities but not others used in queries
4. **Over-Engineering Simple Queries**: 6-step plans for straightforward "find X in Y" queries

#### **Optimization Strategies**:
1. **Smart Validation**: Cache schema entities, skip validation for known types
2. **Pattern Recognition**: Detect common query patterns and use optimized templates
3. **Streamlined Execution**: Reduce typical plans from 6 steps to 2-3 steps for simple queries
4. **Dynamic Analysis Depth**: Adjust analysis complexity based on query type

#### **Example Optimized Plan**:
```json
{
  "plan": [
    {
      "task_type": "generate_cypher",
      "params": {
        "goal": "Find all pain points in banking industry",
        "entities": ["Industry", "Sector", "PainPoint"]
      }
    },
    {
      "task_type": "execute_cypher", 
      "params": {"query": "$step1.output"}
    },
    {
      "task_type": "analyze_and_summarize",
      "params": {"dataset": "$step2.output"}
    }
  ]
}
```

### **Parameter Contract Fixes Implemented**

1. **`analyze_and_summarize`**: Now handles both single `dataset` and comparison `dataset1`/`dataset2` parameters
2. **`find_connection_paths`**: Accepts both `entities` array and individual `start_entity`/`end_entity` parameters
3. **Graph Data Preservation**: Enhanced Cypher generation to include relationship variables in RETURN clauses

### **UI/UX Improvements**

#### **Processing Steps Display Overflow Fix**
**Problem**: Input/Output JSON strings in processing steps would overflow their containers, creating horizontal scrolling and poor readability.

**Solution Implemented**: 
- Enhanced CSS with proper overflow handling: `word-break: break-all`, `overflow-wrap: break-word`, `overflow: hidden`
- Improved `truncateText()` function with intelligent JSON formatting:
  - Pretty-prints JSON when possible within character limit
  - Shows key-value previews for large JSON objects
  - Graceful fallback for non-JSON content
  - Better readability for debugging execution steps

**Files Modified**: 
- `client/src/App.css`: `.step-content` and `.step-detail` overflow handling
- `client/src/components/ChatMessage.tsx`: Enhanced `truncateText()` function

---

## File Structure

- ChatInterface.tsx: Handles user interactions, calls onApplyQueryResult
- App.tsx: Manages graph state, handleApplyQueryResult -> handleGraphDataUpdate
- GraphViz.tsx: Renders visualization from props, getCurrentGraphData()
- types.ts: Defines ChatQueryResult interface
- ChatProcessor.ts: Implements 4-stage reasoning pipeline
- server/routes/chat.js: Backend chat endpoint with Neo4j integration

---

## Critical: Honest Data Handling & No Hallucination

### Fundamental Rule: Never Hallucinate Data
- NEVER suggest entities that don't exist in the database
- NEVER imply that non-existent data might be available  
- ALWAYS be explicit when requested data is missing
- ALWAYS work only with actual database contents

### Direct Data Limitation Communication
When users request specific entities that don't exist:
- ✅ "I don't have a 'Retail' industry in our database"  
- ✅ "The available industries are: Banking and Insurance"
- ❌ "Let me show you other options" (too vague)
- ❌ Suggesting "Consumer Goods" or "E-commerce" if they don't exist

### Conversation Flow for Missing Data
1. **Acknowledge the specific request**: "You're looking for [X]"
2. **State the limitation directly**: "I don't have [X] in the database" 
3. **Show what's actually available**: "The available [category] are: [real list]"
4. **Offer real alternatives**: "Would you like to explore [actual option]?"

This ensures users understand data boundaries and prevents confusion about what actually exists in the system.

---

## General Development Principles

### Core Philosophy
- Extend, don't replace - Use existing patterns and components
- Debug systematically - Add logging to trace data flow
- Test end-to-end - Verify complete user flows work
- Document recurring issues - Update this file when problems repeat
- Focus on functionality first - Optimize for scale later
- Never hallucinate data - Always work with actual database contents

### Key Learnings
- Graph updates are a recurring issue - always follow the established pattern
- Visualization confirmation requires proper data flow, not string parsing
- Console debugging is essential for tracing React state updates
- The existing architecture works well when followed correctly
- LLM Cypher Generation: Sequential queries fail with relationships(node) errors - implemented 3-layer protection system
- Path/Node Type Mismatches: Most common LLM error requires automatic detection and fallback query generation
- **V2 Architecture Critical Issue**: Result handling logic must preserve graph data when analysis steps are added
- **Execution Plan Inefficiencies**: Many plans include redundant validation and unused connection analysis steps
- **Graph Visualization Priority**: All queries returning nodes/edges must trigger frontend graph updates, regardless of additional analysis

### Performance Targets (Proof of Concept)

| Operation | Target | Maximum |
|-----------|--------|---------|
| Graph Update (100 nodes) | <500ms | <2s |
| Query Generation | <3s | <10s |
| Initial Load | <5s | <15s |
| Memory Usage | <300MB | <600MB |

### Testing Strategy

Integration Tests:
- Graph update with 100+ nodes
- Basic chat interaction flow
- Query generation and execution
- Error recovery mechanisms
- Port conflict handling

Manual Testing Checklist:
- Create and visualize a basic graph
- Execute 5 different query types
- Test error messages and recovery
- Verify graph updates from chat
- Check UI contrast and readability

### Monitoring and Debugging

Essential Logging:
```javascript
// Add to key functions
console.log('[Component] Action:', { timestamp: Date.now(), data });
```

Debug Flags:
```javascript
const DEBUG = {
  GRAPH_UPDATES: true,
  CHAT_QUERIES: true,
  STATE_CHANGES: true
};
```

Performance Monitoring:
```javascript
console.time('GraphUpdate');
// ... update logic
console.timeEnd('GraphUpdate');
```

---

## Version History

- v1.0: Initial documentation
- v1.1: Added port management section
- v1.2: Enhanced LLM query generation with 3-layer protection
- v1.3: Added error boundaries and state management rules
- v1.4: Simplified for proof of concept focus
