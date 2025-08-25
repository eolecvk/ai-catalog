# AI Project Catalog SaaS

A comprehensive SaaS platform for AI software vendors to discover and sell AI projects to banks and insurance companies. The platform uses a Neo4j graph database to model relationships between industries, sectors, pain points, and AI project opportunities.

## Features

- **Industry Selection**: Choose between Banking and Insurance industries
- **Sector Filtering**: Select specific sectors within chosen industries  
- **Pain Point Identification**: Identify business problems to solve
- **Project Recommendations**: Get AI project suggestions based on selections
- **Graph-Based Matching**: Uses Neo4j graph database for intelligent recommendations

## Architecture

### Backend (Node.js + Express)
- RESTful API endpoints for data retrieval
- Neo4j integration using official driver
- Cypher queries for graph traversal
- CORS enabled for frontend communication

### Frontend (React + TypeScript)
- Progressive selection flow (Industries → Sectors → Pain Points → Projects)
- Responsive design with modern UI
- Real-time filtering based on graph relationships
- Project cards with detailed information

### Database (Neo4j Graph Database)
- Industries connected to Sectors
- Sectors linked to Pain Points
- Project Opportunities addressing specific Pain Points
- Rich relationship modeling with roles and modules

## Getting Started

### Prerequisites
- Node.js (v16 or higher)
- Docker and Docker Compose
- npm or yarn package manager

### Quick Start (Recommended)

1. **Install dependencies**:
   ```bash
   npm run install-all
   ```

2. **Start everything with one command**:
   ```bash
   npm run dev
   ```
   
   This automatically:
   - Starts Neo4j via Docker Compose
   - Waits for Neo4j to be ready
   - Starts both server (port 5000) and client (port 3000)

3. **Access the application**:
   - Frontend: http://localhost:3000
   - Neo4j Browser: http://localhost:7474 (neo4j/password123)

### Development Commands

- **`npm run dev`** - Start Neo4j + full application
- **`npm run dev:full`** - Fresh start with database reset
- **`npm run reset:db`** - Reset and repopulate database
- **`npm run start:services`** - Start only Neo4j
- **`npm run stop:services`** - Stop Neo4j

### Database Management

The database reset utility (`npm run reset:db`) will:
- Clear all existing data
- Load from `catalog.cypher`
- Show detailed progress and node counts
- Perfect for schema experimentation

### Manual Setup (Alternative)

If you need manual control:

1. **Start Neo4j manually**:
   ```bash
   docker-compose up -d
   npm run wait:neo4j  # Wait for readiness
   ```

2. **Initialize database** (if needed):
   ```bash
   npm run reset:db
   ```

3. **Run application**:
   ```bash
   npm run server  # Terminal 1
   npm run client  # Terminal 2
   ```

### API Endpoints

- `GET /api/health` - Database connection health check
- `GET /api/industries` - Get all available industries
- `POST /api/sectors` - Get sectors for selected industries
- `POST /api/painpoints` - Get pain points for selected sectors  
- `POST /api/projects` - Get project recommendations based on selections
- `POST /api/init-database` - Initialize database with Cypher schema

## Project Structure

```
ai-catalog/
├── catalog.cypher          # Neo4j graph schema and data
├── docker-compose.yml      # Neo4j container setup
├── scripts/
│   └── reset-db.js        # Database reset utility
├── server/
│   └── index.js           # Express API server
├── client/
│   ├── src/
│   │   ├── App.tsx        # Main React component
│   │   ├── App.css        # Styling
│   │   └── types.ts       # TypeScript interfaces
│   └── public/
└── package.json           # Root dependencies and scripts
```

## Graph Schema

The Neo4j graph models the following entities and relationships:

- **Industries** (Banking, Insurance) 
- **Sectors** (Retail Banking, Health Insurance, etc.)
- **Pain Points** (Fraud Detection, Claims Processing, etc.)
- **Project Opportunities** (Specific AI solutions)
- **Modules & Sub-modules** (Implementation components)
- **Roles** (Required team members)

## Usage Flow

1. **Select Industries**: Choose Banking and/or Insurance
2. **Choose Sectors**: Pick relevant business sectors
3. **Identify Pain Points**: Select problems to address
4. **View Projects**: See recommended AI solutions with:
   - Business case and priority
   - Required roles and skills
   - Implementation modules
   - Technology stack details

## Development

### Adding New Projects

1. Update `catalog.cypher` with new nodes and relationships
2. Reset database: `npm run reset:db`
3. Projects will automatically appear in recommendations

### Customizing UI

- Edit `client/src/App.css` for styling changes
- Modify `client/src/App.tsx` for functionality updates
- Update `client/src/types.ts` for new data structures

## Deployment

For production deployment:

1. Set up Neo4j Aura or enterprise instance
2. Configure environment variables for production
3. Build the React frontend: `npm run build`
4. Deploy backend to cloud platform (AWS, Azure, GCP)
5. Serve built frontend files

## Contributing

1. Fork the repository
2. Create feature branch
3. Add your changes
4. Update documentation
5. Submit pull request

## License

MIT License - see LICENSE file for details