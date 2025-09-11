# AI Catalog - Industry Pain Point & Solution Discovery Platform

An intelligent SaaS platform that helps businesses discover AI project opportunities by analyzing industry pain points and matching them with solution blueprints.

## 🌟 Overview

The AI Catalog is a full-stack application designed for AI software vendors to identify and sell projects to banks, insurance companies, and other enterprises. It provides an interactive graph-based interface for exploring relationships between industries, sectors, departments, pain points, and AI project opportunities.

## 🚀 Key Features

### 📊 Interactive Graph Visualization
- **Node-based exploration**: Navigate through interconnected data representing industries, sectors, departments, and pain points
- **Dynamic filtering**: Filter by specific industries, sectors, or departments
- **Zoom & pan controls**: Explore large datasets with smooth navigation
- **Node focusing**: Click any node to see detailed connections and relationships

### 🤖 AI-Powered Chat Interface
- **Natural language queries**: Ask questions like "What are the main pain points in retail banking?"
- **Intelligent responses**: Get comprehensive answers with supporting graph visualizations
- **Context-aware**: The AI understands your current view and provides relevant insights
- **Query examples**: Built-in example queries to get started quickly

### 🗂️ Version Management System
- **Multiple catalog versions**: Create and manage different versions of your data catalog
- **Draft versions**: Work on changes without affecting the live catalog
- **Version switching**: Easily switch between different catalog versions
- **Import/Export**: Import new data via Cypher scripts or export existing catalogs

### 🏗️ Catalog Builder (Admin)
- **Node creation**: Add new industries, sectors, departments, pain points, and project opportunities
- **Relationship management**: Define connections between different entities
- **Bulk import**: Import large datasets using Cypher query language
- **Data validation**: Automatic validation of data relationships and integrity

## 🏛️ Data Schema

The platform organizes data in a hierarchical structure:

```
Industry (Banking, Insurance)
├── Sectors (Retail Banking, Commercial Banking, Life Insurance)
    ├── Departments (Customer Service, Risk Management, Claims)
        └── Pain Points (Manual processes, Compliance issues, Data silos)
            └── Project Opportunities (AI solutions addressing specific pain points)
                ├── Required Roles (Data Scientists, ML Engineers)
                └── Modules & Sub-modules (Implementation components)
```

## 💡 Use Cases

### For AI Vendors
- **Market Research**: Understand pain points across different industries and sectors
- **Solution Mapping**: Match your AI capabilities with market needs
- **Sales Enablement**: Use data insights to approach prospects with targeted solutions
- **Competitive Analysis**: Identify market gaps and opportunities

### For Enterprises
- **Problem Discovery**: Identify pain points you might not have considered
- **Solution Exploration**: Find AI projects that address your specific challenges
- **Benchmarking**: See what other companies in your sector are addressing
- **Digital Transformation Planning**: Build a roadmap of AI initiatives

## 🔧 Technical Stack

### Frontend
- **React 18** with TypeScript
- **Interactive Graph Visualization** using vis-network
- **Responsive Design** with modern CSS
- **Real-time Chat Interface** with streaming responses

### Backend
- **Node.js & Express** RESTful API
- **Neo4j Graph Database** for relationship management
- **Multi-LLM Support** (OpenAI GPT, Google Gemini, Groq)
- **Version Management** with separate database instances

### Infrastructure
- **Docker** containerization for Neo4j
- **Environment-based Configuration** for development/production
- **Vercel-ready** frontend deployment
- **Scalable Backend** architecture

## 🚀 Quick Start

### Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ai-catalog
   ```

2. **Install dependencies**
   ```bash
   npm run install-all
   ```

3. **Start services**
   ```bash
   npm run dev
   ```

4. **Access the application**
   - Frontend: http://localhost:3001
   - Backend API: http://localhost:5002
   - Neo4j Browser: http://localhost:7474

### Production Deployment

#### Frontend (Vercel)
```bash
vercel
```

#### Backend
Deploy to Railway, Heroku, or DigitalOcean with:
- Neo4j cloud instance
- Environment variables for API keys
- CORS configured for frontend domain

## 🎮 How to Use

### 1. Exploring the Graph
- Start with the **overview cards** showing node type counts
- Click any card to filter the graph view
- Use **mouse controls**: drag to pan, scroll to zoom
- Click nodes to see detailed information and connections

### 2. Using the AI Chat
- Click the **chat icon** to open the AI assistant
- Try example queries or ask your own questions
- The AI will provide insights and update the graph visualization
- Use **natural language** like "Show me fintech pain points" or "What AI projects address customer service issues?"

### 3. Managing Versions (Admin)
- Access **Admin Tools** → **Manage Versions**
- Create **draft versions** for testing changes
- **Import data** using Cypher scripts
- **Switch versions** to compare different datasets

### 4. Building the Catalog (Admin)
- Use the **Catalog Builder** to add new entities
- Define **relationships** between industries, sectors, and pain points
- Add **project opportunities** with detailed requirements
- **Validate data** before publishing to live catalog

## 📋 Example Queries

- "What are the biggest pain points in commercial banking?"
- "Show me AI projects that address regulatory compliance"
- "Which departments in insurance companies have the most automation opportunities?"
- "Find projects that require data scientists and machine learning engineers"
- "Compare pain points between retail and commercial banking"

## 🔐 Environment Variables

### Required for Backend
```env
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your_password
GROQ_API_KEY=your_groq_key
GEMINI_API_KEY=your_gemini_key
PORT=5002
```

### Required for Frontend
```env
REACT_APP_API_URL=https://your-backend-url.com
```

## 📊 Performance Features

- **Optimized Rendering**: Progressive loading for large graphs (100+ nodes)
- **Smart Caching**: Client-side caching of frequently accessed data
- **Lazy Loading**: Load data on-demand as users explore
- **Memory Management**: Efficient cleanup of unused graph elements

## 🔍 Advanced Features

### Graph Analytics
- **Path Finding**: Discover connections between entities
- **Clustering**: Group related pain points and solutions
- **Impact Analysis**: Understand which pain points affect multiple sectors

### Data Import/Export
- **Cypher Import**: Import complex relationship data
- **CSV Export**: Export filtered datasets for analysis
- **API Integration**: Connect with external data sources

### Customization
- **Theming**: Customize colors and styling
- **Layout Options**: Different graph layout algorithms
- **Filter Presets**: Save commonly used filter combinations

## 📚 Development Commands

### Quick Start
- **`npm run dev`** - Start full application (recommended)
- **`npm run install-all`** - Install all dependencies

### Services Management
- **`npm run start:services`** - Start Neo4j container
- **`npm run stop:services`** - Stop Neo4j container
- **`npm run reset:db`** - Reset and reload database

### Testing
- **`npm run test:dev`** - Start test environment
- **`npm run test:server`** - Backend tests
- **`npm run test:frontend`** - Frontend tests

### Development Tools
- **`npm run server`** - Backend only (port 5002)
- **`npm run client`** - Frontend only (port 3001)
- **`npm run build`** - Build for production

## 🚧 Project Structure

```
ai-catalog/
├── client/                    # React Frontend
│   ├── src/
│   │   ├── components/        # React components
│   │   ├── utils/            # API utilities
│   │   ├── App.tsx           # Main application
│   │   └── types.ts          # TypeScript definitions
│   └── build/                # Production build
├── server/                   # Node.js Backend
│   ├── chat/                 # AI chat processing
│   ├── llm/                  # LLM management
│   └── index.js             # Express server
├── scripts/                  # Utility scripts
├── catalog.cypher           # Neo4j schema
├── docker-compose.yml       # Neo4j setup
├── vercel.json             # Deployment config
└── README.md               # This file
```

## 🤝 Contributing

1. **Fork** the repository
2. **Create** a feature branch
3. **Make** your changes
4. **Test** thoroughly
5. **Submit** a pull request

## 📞 Support

For questions, issues, or feature requests:
- **Issues**: GitHub Issues
- **Documentation**: Check the codebase comments
- **Community**: Share your feedback

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Built with ❤️ for the AI community**

*Helping businesses discover AI opportunities through intelligent data visualization and natural language interaction.*