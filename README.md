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

### Quick Start with Docker

1. **Clone and install dependencies**:
   ```bash
   npm run install-all
   ```

2. **Start Neo4j with Docker**:
   ```bash
   docker-compose up -d
   ```
   
   This starts Neo4j on:
   - Browser interface: http://localhost:7474
   - Bolt connection: bolt://localhost:7687
   - Login: neo4j/password123

3. **Wait for Neo4j to be ready** (about 30 seconds), then initialize the database:
   ```bash
   # The app will start on port 5000, so initialize the database
   npm run server &
   sleep 5
   curl -X POST http://localhost:5000/api/init-database
   pkill -f "node server"
   ```

4. **Run the application**:
   ```bash
   npm run dev
   ```

   This starts both the backend server (port 5000) and frontend (port 3000).

### Manual Neo4j Setup (Alternative)

If you prefer to install Neo4j manually:

1. Install Neo4j Desktop or Server (v4.4 or higher)
2. Set up environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your Neo4j credentials
   ```
3. Ensure Neo4j is running on `bolt://localhost:7687`
4. Continue with steps 3-4 above

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
2. Re-run database initialization
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