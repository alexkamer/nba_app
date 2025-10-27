# NBA Analytics Application - Setup Guide

This guide will walk you through setting up and running the NBA Analytics application on your local machine.

## Prerequisites

Before you begin, make sure you have the following installed:

- **Python 3.12+** - [Download Python](https://www.python.org/downloads/)
- **Node.js 18+** and **npm** - [Download Node.js](https://nodejs.org/)
- **uv** (Python package manager) - Install with: `pip install uv`

## Project Structure

```
nba_app/
├── backend/          # FastAPI backend server
├── frontend/         # React + Vite frontend
├── nba.db           # SQLite database
└── pyproject.toml   # Python dependencies
```

## Setup Instructions

### 1. Clone or Download the Repository

If you haven't already, navigate to the project directory:

```bash
cd /path/to/nba_app
```

### 2. Backend Setup

#### 2.1 Configure Environment Variables

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

3. The default `.env` configuration should work for local development:
   ```env
   DATABASE_URL=sqlite:///../nba.db
   CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
   API_TITLE=NBA Analytics API
   API_VERSION=1.0.0
   HOST=127.0.0.1
   PORT=8000
   ```

#### 2.2 Install Python Dependencies

From the project root directory:

```bash
uv sync
```

This will install all required Python packages defined in `pyproject.toml`.

#### 2.3 Initialize the Database

Run database migrations to set up the schema:

```bash
PYTHONPATH=/path/to/nba_app/backend uv run alembic upgrade head
```

Replace `/path/to/nba_app/backend` with your actual backend path.

#### 2.4 Start the Backend Server

From the backend directory:

```bash
PYTHONPATH=/path/to/nba_app/backend uv run uvicorn api.main:app --reload --host 127.0.0.1 --port 8000
```

Or use the simpler command:

```bash
cd backend
uv run uvicorn api.main:app --reload
```

The backend API will be available at: **http://127.0.0.1:8000**

API Documentation: **http://127.0.0.1:8000/docs**

### 3. Frontend Setup

Open a new terminal window for the frontend.

#### 3.1 Navigate to Frontend Directory

```bash
cd frontend
```

#### 3.2 Configure Environment Variables

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. The default configuration should point to the backend:
   ```env
   VITE_API_URL=http://127.0.0.1:8000
   ```

#### 3.3 Install Node Dependencies

```bash
npm install
```

#### 3.4 Start the Development Server

```bash
npm run dev
```

The frontend will be available at: **http://localhost:5173**

## Verifying the Setup

### Test the Backend

Once the backend is running, test it with:

```bash
curl http://127.0.0.1:8000/health
```

Expected response:
```json
{"status": "healthy"}
```

### Test the Frontend

1. Open your browser to **http://localhost:5173**
2. You should see the NBA Analytics application interface
3. Try searching for a player or browsing teams

## Common Issues and Troubleshooting

### Backend Issues

**Port 8000 already in use:**
```bash
# Find the process using port 8000
lsof -i :8000

# Kill the process (replace PID with actual process ID)
kill -9 <PID>
```

**Database not found:**
- Make sure you ran the Alembic migrations: `alembic upgrade head`
- Check that `nba.db` exists in the project root

**Import errors:**
- Ensure you set `PYTHONPATH` correctly when running commands
- Verify all dependencies are installed: `uv sync`

### Frontend Issues

**Port 5173 already in use:**
- Vite will automatically try the next available port
- Check the terminal output for the actual port

**API connection errors:**
- Verify the backend is running on port 8000
- Check that `VITE_API_URL` in `.env` matches your backend URL
- Ensure CORS is configured correctly in the backend

**Dependencies installation fails:**
- Clear npm cache: `npm cache clean --force`
- Delete `node_modules` and `package-lock.json`, then run `npm install` again

## Development Workflow

### Running Both Servers

You'll need two terminal windows:

**Terminal 1 - Backend:**
```bash
cd backend
PYTHONPATH=$(pwd) uv run uvicorn api.main:app --reload
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

### Making Changes

- **Backend**: The server auto-reloads on file changes (thanks to `--reload` flag)
- **Frontend**: Vite provides hot module replacement (HMR) for instant updates

## Building for Production

### Backend

The backend runs with uvicorn in production mode:

```bash
uv run uvicorn api.main:app --host 0.0.0.0 --port 8000
```

### Frontend

Build the optimized production bundle:

```bash
cd frontend
npm run build
```

The built files will be in `frontend/dist/`.

To preview the production build:

```bash
npm run preview
```

## Additional Scripts

### Database Management

**Create a new migration:**
```bash
PYTHONPATH=/path/to/backend uv run alembic revision --autogenerate -m "description"
```

**Rollback migration:**
```bash
PYTHONPATH=/path/to/backend uv run alembic downgrade -1
```

### Code Quality

**Frontend linting:**
```bash
cd frontend
npm run lint
```

## API Endpoints

Once running, explore the API at **http://127.0.0.1:8000/docs**

Key endpoints:
- `/api/players/search` - Search for players
- `/api/teams` - Get all teams
- `/api/games` - Get game data
- `/api/stats/leaders` - Get stat leaders
- `/api/schedule` - Get game schedule
- `/api/predictions` - Get game predictions

## Support

If you encounter issues:

1. Check that all prerequisites are installed
2. Verify environment variables are set correctly
3. Ensure both backend and frontend servers are running
4. Check the console/terminal for error messages
5. Review the API documentation at `/docs`

## Next Steps

- Explore the codebase structure
- Check out the API documentation
- Review the database models in `backend/database/models.py`
- Customize the frontend components in `frontend/src/`

Happy coding!
