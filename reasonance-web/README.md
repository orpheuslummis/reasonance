# Reasonance

Reasonance is a real-time collaborative discussion platform that combines audio
transcription, text chat, and argument mapping to facilitate structured
conversations and debates.

https://docs.google.com/document/d/1fWjrdVzkpNvoA-RPq7HpjV_740kKAh4fEmNk2aWWS2g/edit?tab=t.0#heading=h.s9vf8hze1psz

## Features

### Real-time Communication

- Audio recording and transcription with AssemblyAI integration
- Text-based messaging with instant updates
- Live participant presence indicators
- Dynamic session management and archival

### Argument Mapping

- Interactive visual representation of discussion flow
- Support for various argument types (claims, supports, counters, responses)
- D3.js-powered graph visualization with real-time updates
- Node selection and relationship tracking

### Session Management

- Create and join active discussion sessions
- View and replay archived sessions
- Real-time participant tracking
- Comprehensive session timeline view

## Technology Stack

### Frontend (`reasonance-web`)

- React 18.x with TypeScript
- D3.js for interactive graph visualization
- Vite for modern build tooling
- Server-Sent Events (SSE) for real-time updates

### Backend (`reasonance`)

- FastAPI for high-performance async API
- AssemblyAI integration for audio transcription
- CORS-enabled for secure cross-origin requests
- Async/await architecture for scalable performance

## Getting Started

### Prerequisites

- Node.js 16.x or higher
- Python 3.8 or higher
- AssemblyAI API key

### Installation

1. Clone the repository:

```bash
git clone [repository-url]
cd reasonance
```

2. Install frontend dependencies:

```bash
cd reasonance-web
npm install
```

3. Install backend dependencies:

```bash
cd ../reasonance
pip install -r requirements.txt
```

4. Configure environment variables:

Frontend (.env):

```
VITE_API_URL=http://localhost:8000
```

Backend (.env):

```
ASSEMBLYAI_API_KEY=your_api_key
```

5. Start the development servers:

Frontend:

```bash
cd reasonance-web
npm run dev
```

Backend:

```bash
cd reasonance
python -m uvicorn reasonance.api:app --reload
```

## Project Structure

### Frontend

```
reasonance-web/
├── src/
│   ├── components/     # React components
│   ├── hooks/         # Custom React hooks
│   ├── types/         # TypeScript definitions
│   └── config/        # Configuration files
```

### Backend

```
reasonance/
├── reasonance/
│   ├── api.py         # FastAPI routes
│   ├── models.py      # Data models
│   ├── session_manager.py    # Session management
│   └── argument_mapper.py    # Argument mapping logic
```

## Features in Detail

### Real-time Session Management

- Create new discussion sessions with unique identifiers
- Join existing sessions with live participant updates
- View real-time participant information and status
- Access and replay archived sessions with full timeline

### Audio Processing

- Browser-based audio recording with instant feedback
- Support for audio file uploads
- Real-time transcription via AssemblyAI
- Automatic speaker identification and tracking

### Argument Mapping Visualization

- Dynamic force-directed graph layout
- Interactive node selection and highlighting
- Real-time edge creation and update
- Support for different argument relationship types
- Export capabilities for graph data

## Development

### Running Tests

```bash
# Frontend
npm run test

# Backend
pytest
```

### Code Style

- Frontend follows TypeScript strict mode
- Backend follows PEP 8 guidelines
- ESLint and Prettier configured for consistent formatting

## Deployment

### Frontend Deployment

1. Build the production bundle:

```bash
npm run build
```

2. Serve the built files from the `dist` directory using your preferred static
   file server

### Backend Deployment

1. Install production dependencies:

```bash
pip install -r requirements.txt
```

2. Run with a production ASGI server:

```bash
uvicorn reasonance.api:app --host 0.0.0.0 --port 8000
```

## Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/AmazingFeature`
3. Commit your changes: `git commit -m 'Add some AmazingFeature'`
4. Push to the branch: `git push origin feature/AmazingFeature`
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file
for details.

## Acknowledgments

- [AssemblyAI](https://www.assemblyai.com/) for providing the audio
  transcription API
- [D3.js](https://d3js.org/) for powerful visualization capabilities
- [FastAPI](https://fastapi.tiangolo.com/) for the high-performance backend
  framework
- The open source community for various tools and libraries used in this project
