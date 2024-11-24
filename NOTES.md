NOTE: this is a bit outdated now.

# Reasonance MVP Specification

## Project Overview

Reasonance is an augmented conversation system for sensemaking, designed to make
visible and support the natural structure of conversations with additional
intelligence.

## Technical Stack

### Backend

- Python with FastAPI
- AssemblyAI for speech-to-text
- Server-Sent Events (SSE) for real-time updates
- Environment configuration via dotenv

### Frontend

- React + Vite
- EventSource for SSE consumption
- File upload handling for audio
- Responsive layout system

## Core Components

### 1. Session Management System

#### Session Model

```python
- session_id: str (UUID)
- participants: Set[str]
- turn_count: int
- transcripts: List[Dict]
- created_at: datetime
- last_activity: datetime
- connected_clients: int
```

#### Cleanup System

- Automatic cleanup of inactive sessions
- Configurable cleanup interval (default: 10 seconds)
- Session considered inactive when no participants and no connected clients

### 2. User Interface Layout

#### Top Bar

- Application name (Reasonance)
- Current session ID/name
- Participant count display
- Current user's name

#### Main Content Area (80%)

- Shared view space for conversation analysis
- Real-time transcript display
- Maximum 7 visible analysis elements
- Support for pinned elements

#### Bottom Area (20%)

- Turn-based audio recording interface
- Recent transcripts display with speaker attribution
- Recording controls

### 3. Application Flow

1. Initial Landing
   - User name input
   - Active sessions list with participant counts
   - Session creation option

2. Session Participation
   - Join/leave session functionality
   - Turn-based audio recording
   - Real-time transcript updates
   - Shared view synchronization

### 4. Audio Processing Pipeline

1. Client-side audio recording
2. Audio file upload to server
3. AssemblyAI processing
4. Transcript delivery via SSE
5. LLM analysis of transcripts
6. UI updates for all session participants

## API Endpoints

### Session Management

```
POST /start-session
- Input: { participant_name: str }
- Output: { session_id: str, status: str }

GET /sessions
- Output: { sessions: List[SessionInfo] }

POST /join-session/{session_id}
- Input: { participant_name: str }
- Output: { status: str }

POST /leave-session/{session_id}
- Input: { participant_name: str }
- Output: { status: str }
```

### Turn Management

```
POST /upload-turn/{session_id}
- Input: audio_file: File, speaker: str
- Output: Transcription result

GET /session-updates/{session_id}
- SSE endpoint for session-specific updates
- Events: participants, transcripts, analysis

GET /session-updates-home
- SSE endpoint for home page updates
- Events: active sessions list
```

### Real-time Updates

- Server-Sent Events for live updates
- Separate channels for:
  - Home page session list
  - Individual session updates
  - Transcript updates
  - Analysis updates

## Data Flow

1. User Records Turn
   - Audio capture
   - File upload
   - Speaker metadata

2. Server Processing
   - Speech-to-text conversion
   - LLM analysis
   - Broadcast updates

3. Client Updates
   - Real-time transcript display
   - Analysis visualization
   - Participant list updates

## State Management

### Server State

- Active sessions
- Session queues for SSE
- Participant tracking
- Turn history

### Client State

- User information
- Current session
- Recording status
- Local transcript cache

## Configuration

- INACTIVE_SESSION_TIMEOUT: 1 minute
- CLEANUP_INTERVAL: 10 seconds
- CORS: Configured for development (localhost:5173)
- Environment variables:
  - ASSEMBLYAI_API_KEY
  - Other API keys as needed

## Non-Functional Requirements

- Efficient session cleanup
- Reliable turn management
- Clear speaker attribution
- Privacy-preserving design
- Error handling for network issues
- Responsive design

## Out of Scope for MVP

- Authentication system
- Persistent storage
- Multiple conversation types
- Advanced analysis features
- Custom session names
- Chat functionality
- File sharing
- Session recording export

---

new priorities

discourse graph
