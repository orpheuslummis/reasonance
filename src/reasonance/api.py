from fastapi import FastAPI, HTTPException, Form, status, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import logging
from sse_starlette.sse import EventSourceResponse
from pydantic import BaseModel, Field
import asyncio
from datetime import datetime
from contextlib import asynccontextmanager
import json
import assemblyai as aai
import os

from .session_manager import SessionManager
from .models import Session

# Setup logging
logger = logging.getLogger(__name__)

# Initialize AssemblyAI
aai.settings.api_key = os.getenv("ASSEMBLYAI_API_KEY")


# Initialize FastAPI app
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await session_manager.start_cleanup_task()
    yield
    # Shutdown
    await session_manager.stop_cleanup_task()


app = FastAPI(lifespan=lifespan)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Initialize session manager
session_manager = SessionManager()


class SessionCreate(BaseModel):
    participant_name: str = Field(
        ..., description="Name of the participant creating the session"
    )


class MessageData(BaseModel):
    message: str = Field(..., description="Message content to analyze")
    speaker: str = Field(..., description="Speaker name")


@app.post("/start-session")
async def create_session(participant: SessionCreate):
    """Create a new session"""
    session = session_manager.create_session()
    session.add_participant(participant.participant_name)
    return {"session_id": session.session_id}


@app.get("/session/{session_id}")
async def get_session(session_id: str):
    """Get session data"""
    session_data = session_manager.get_session_data(session_id)
    if not session_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )
    return session_data


@app.get("/session/{session_id}/anchors")
async def get_anchors(session_id: str):
    """Get all anchors for a session"""
    session = session_manager.get_session(session_id)
    if not session:
        if session_id in session_manager.archived_sessions:
            archived_data = session_manager.archived_sessions[session_id]
            return {"anchors": archived_data.get("anchors", [])}
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )
    return {"anchors": session.anchors}


class AnchorData(BaseModel):
    position: int = Field(..., ge=0)
    length: int = Field(..., gt=0)
    word: str
    turnId: int = Field(..., ge=0)
    userId: str


@app.post("/session/{session_id}/anchors")
async def add_anchor(session_id: str, anchor_data: AnchorData):
    """Add a new anchor to a session"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )

    new_anchor = session.add_anchor(anchor_data.dict())
    await session_manager.broadcast_to_session(
        session_id, {"type": "anchor", "data": new_anchor}
    )

    return {"status": "success", "anchor": new_anchor}


@app.get("/session/{session_id}/argument-graph")
async def get_argument_graph(session_id: str):
    """Get the argument graph for a session"""
    session = session_manager.get_session(session_id)
    if not session:
        if session_id in session_manager.archived_sessions:
            archived_data = session_manager.archived_sessions[session_id]
            return archived_data.get("argument_graph", {"nodes": {}, "edges": []})
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )
    return session.argument_mapper.get_graph()


@app.get("/sessions")
async def list_sessions():
    """Get list of active sessions"""
    active = session_manager.get_active_sessions_info()
    return active


@app.delete("/session/{session_id}")
async def archive_session(session_id: str):
    """Archive a session"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )
    session_manager.remove_session(session_id)
    return {"status": "success"}


@app.post("/session/{session_id}/participants")
async def add_participant(session_id: str, name: str = Form(...)):
    """Add a participant to a session"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )
    session.add_participant(name)
    await session_manager.broadcast_to_session(
        session_id, {"type": "participant_joined", "name": name}
    )
    return {"status": "success"}


@app.delete("/session/{session_id}/participants/{name}")
async def remove_participant(session_id: str, name: str):
    """Remove a participant from a session"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )
    session.remove_participant(name)
    await session_manager.broadcast_to_session(
        session_id, {"type": "participant_left", "name": name}
    )
    return {"status": "success"}


@app.get("/session/{session_id}/events")
async def session_events(session_id: str):
    """SSE endpoint for session updates"""
    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Content-Type": "text/event-stream",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Last-Event-ID",
    }

    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )

    queue = session_manager.add_client_queue(session_id)

    async def event_generator():
        try:
            # Get current argument graph state
            graph_data = session.argument_mapper.get_graph()

            # Send enhanced initial state
            initial_state = {
                "type": "initial_state",
                "participants": list(session.participants),
                "transcripts": session.transcripts,
                "argument_graph": graph_data,  # Add argument graph to initial state
            }
            yield {"data": json.dumps(initial_state)}

            while True:
                message = await queue.get()
                if message is None:
                    break
                yield message
        finally:
            session_manager.remove_client_queue(session_id, queue)

    return EventSourceResponse(event_generator(), headers=headers)


@app.post("/session/{session_id}/analyze")
async def analyze_message_endpoint(
    session_id: str,
    message_data: MessageData,
):
    """Analyze a message and update the argument graph"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )

    try:
        result = await _analyze_and_broadcast(
            session=session,
            session_id=session_id,
            turn_id=session.last_turn_id + 1,
            message=message_data.message,
            speaker=message_data.speaker,
        )

        return {
            "status": "success",
            "node": {
                "id": str(result["node"].turn_id),
                "type": result["node"].type.value,
                "summary": result["node"].summary,
                "speaker": result["node"].speaker,
            },
            "graph": result["graph"],
        }

    except Exception as e:
        logger.error(f"Analysis error: {e}")
        logger.exception("Full traceback:")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e)
        )


@app.get("/session/{session_id}/argument-layout")
async def get_argument_layout(session_id: str):
    """Get the argument graph with layout information"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )

    graph = session.argument_mapper.get_graph()
    layout = session.argument_mapper.get_layout()
    return {"graph": graph, "layout": layout}


@app.get("/events")
async def global_events():
    """SSE endpoint for global updates"""
    headers = {
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "Content-Type": "text/event-stream",
        "Access-Control-Allow-Origin": "http://localhost:5173",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Headers": "Last-Event-ID",
    }

    queue = asyncio.Queue()
    session_manager.add_global_queue(queue)

    async def event_generator():
        try:
            # Send initial message to establish connection
            yield {"data": json.dumps({"type": "connected"})}
            yield {"data": json.dumps({"type": "keepalive"})}

            while True:
                try:
                    message = await asyncio.wait_for(queue.get(), timeout=30)
                    if message is None:
                        break
                    yield message
                    yield {"data": json.dumps({"type": "keepalive"})}
                except asyncio.TimeoutError:
                    # Send keepalive on timeout
                    yield {"data": json.dumps({"type": "keepalive"})}
        finally:
            session_manager.remove_global_queue(queue)

    return EventSourceResponse(event_generator(), headers=headers)


@app.get("/archived-sessions")
async def list_archived_sessions():
    """Get list of archived sessions"""
    archived = session_manager.get_archived_sessions_info()
    return archived


class ParticipantJoin(BaseModel):
    participant_name: str = Field(
        ..., description="Name of the participant joining the session"
    )


@app.post("/join-session/{session_id}")
async def join_session(session_id: str, participant: ParticipantJoin):
    """Join an existing session"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )

    # Add participant to session
    session.add_participant(participant.participant_name)

    # Broadcast participant update
    await session_manager.broadcast_to_session(
        session_id,
        {"type": "participant_update", "participants": list(session.participants)},
    )

    # Also broadcast to home page to update participant count
    await session_manager.broadcast_global(
        {
            "type": "sessions_update",
            "active": session_manager.get_active_sessions_info(),
        }
    )

    return {"status": "success"}


@app.get("/session-transcripts/{session_id}")
async def get_session_transcripts(session_id: str):
    """Get all transcripts for a session"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )
    return {"transcripts": session.transcripts}


@app.get("/session/{session_id}/participants")
async def get_session_participants(session_id: str):
    """Get all participants in a session"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )
    return {"participants": list(session.participants)}


@app.post("/send-message/{session_id}")
async def send_message(session_id: str, message_data: MessageData):
    """Add a new message and analyze it"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )

    # Create transcript
    turn_id = session.last_turn_id + 1
    transcript = {
        "turn_id": turn_id,
        "speaker": message_data.speaker,
        "transcript": message_data.message,
        "timestamp": datetime.now().isoformat(),
    }

    session.transcripts.append(transcript)
    session.last_turn_id = turn_id

    # Broadcast transcript
    await session_manager.broadcast_to_session(
        session_id, {"type": "transcript", "data": transcript}
    )

    # Broadcast updated session info to home page
    await session_manager.broadcast_global(
        {
            "type": "sessions_update",
            "active": session_manager.get_active_sessions_info(),
        }
    )

    # Analyze in background task
    asyncio.create_task(
        analyze_and_broadcast(
            session_id=session_id,
            turn_id=turn_id,
            message=message_data.message,
            speaker=message_data.speaker,
            session=session,
        )
    )

    return {"status": "success", "turn_id": turn_id}


async def analyze_and_broadcast(
    session_id: str, turn_id: int, message: str, speaker: str, session: Session
):
    """Analyze message and broadcast results"""
    try:
        # Unpack the tuple returned by analyze_message
        node, confidence = await session.analyze_message(
            turn_id=turn_id,
            message=message,
            speaker=speaker,
        )

        # Get updated graph
        graph_data = session.argument_mapper.get_graph()

        # Prepare update data with confidence score
        update_data = {
            "type": "argument_update",
            "data": {
                "graph": graph_data,
                "latest_node": {
                    "id": str(node.turn_id),
                    "type": node.type.value,
                    "summary": node.summary,
                    "speaker": node.speaker,
                    "confidence": confidence,  # Include confidence score
                },
            },
        }

        # Broadcast update
        await session_manager.broadcast_to_session(session_id, update_data)

        return {"node": node, "graph": graph_data, "confidence": confidence}

    except Exception as e:
        logger.error(f"Analysis error: {e}")
        logger.exception("Full traceback:")
        raise


# ... (audio processing endpoints remain the same)


# Add this class near other model definitions
class ParticipantLeave(BaseModel):
    participant_name: str = Field(
        ..., description="Name of the participant leaving the session"
    )


@app.post("/leave-session/{session_id}")
async def leave_session(session_id: str, participant: ParticipantLeave):
    """Leave an existing session"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )

    # Remove participant from session
    session.remove_participant(participant.participant_name)

    # Broadcast participant update
    await session_manager.broadcast_to_session(
        session_id,
        {"type": "participant_update", "participants": list(session.participants)},
    )

    # Also broadcast to home page to update participant count
    await session_manager.broadcast_global(
        {
            "type": "sessions_update",
            "active": session_manager.get_active_sessions_info(),
        }
    )

    return {"status": "success"}


async def broadcast_to_session(session_id: str, message: dict):
    # Remove any top-level timestamp before broadcasting
    if "timestamp" in message:
        del message["timestamp"]
    # ... rest of the broadcast code ...


class AnchorCreate(BaseModel):
    position: int
    length: int
    word: str
    turnId: int
    userId: str


@app.post("/session/{session_id}/anchors")
async def create_anchor(session_id: str, anchor: AnchorCreate):
    """Create a new anchor in a transcript"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )

    # Find the transcript
    transcript = next(
        (t for t in session.transcripts if t["turn_id"] == anchor.turnId), None
    )
    if not transcript:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Transcript not found"
        )

    # Add timestamp to anchor
    anchor_data = anchor.dict()
    anchor_data["timestamp"] = datetime.now().isoformat()

    # Initialize anchors list if it doesn't exist
    if "anchors" not in transcript:
        transcript["anchors"] = []

    transcript["anchors"].append(anchor_data)

    # Broadcast anchor update
    await session_manager.broadcast_to_session(
        session_id, {"type": "add", "data": anchor_data}
    )

    return {"status": "success"}


@app.delete("/session/{session_id}/anchors/{turn_id}/{position}")
async def delete_anchor(session_id: str, turn_id: int, position: int, user_data: dict):
    """Delete an anchor from a transcript"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )

    # Find the transcript
    transcript = next((t for t in session.transcripts if t["turn_id"] == turn_id), None)
    if not transcript:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Transcript not found"
        )

    # Remove the anchor
    if "anchors" in transcript:
        transcript["anchors"] = [
            a
            for a in transcript["anchors"]
            if not (a["position"] == position and a["userId"] == user_data["userId"])
        ]

    # Broadcast anchor removal
    await session_manager.broadcast_to_session(
        session_id,
        {
            "type": "remove",
            "data": {
                "turnId": turn_id,
                "position": position,
                "userId": user_data["userId"],
            },
        },
    )

    return {"status": "success"}


async def _analyze_and_broadcast(
    session: Session,
    session_id: str,
    turn_id: int,
    message: str,
    speaker: str,
) -> dict:
    """Shared analysis and broadcasting logic"""
    try:
        # Unpack the tuple returned by analyze_message
        node, confidence = await session.analyze_message(
            turn_id=turn_id,
            message=message,
            speaker=speaker,
        )

        # Get updated graph
        graph_data = session.argument_mapper.get_graph()

        # Prepare update data with confidence score
        update_data = {
            "type": "argument_update",
            "data": {
                "graph": graph_data,
                "latest_node": {
                    "id": str(node.turn_id),
                    "type": node.type.value,
                    "summary": node.summary,
                    "speaker": node.speaker,
                    "confidence": confidence,  # Include confidence score
                },
            },
        }

        # Broadcast update
        await session_manager.broadcast_to_session(session_id, update_data)

        return {"node": node, "graph": graph_data, "confidence": confidence}

    except Exception as e:
        logger.error(f"Analysis error: {e}")
        logger.exception("Full traceback:")
        raise


@app.post("/upload-audio/{session_id}")
async def upload_audio(
    session_id: str,
    audio: UploadFile = File(...),
    speaker: str = Form(...),
):
    """Handle audio upload and transcription"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )

    try:
        # Read audio file content
        audio_content = await audio.read()

        # Validate audio content
        if not audio_content:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Empty audio content"
            )

        # Create transcript with placeholder
        turn_id = session.last_turn_id + 1
        transcript = {
            "turn_id": turn_id,
            "speaker": speaker,
            "transcript": "[Transcribing...]",  # Updated placeholder
            "timestamp": datetime.now().isoformat(),
        }

        session.transcripts.append(transcript)
        session.last_turn_id = turn_id

        # Broadcast initial transcript
        await session_manager.broadcast_to_session(
            session_id, {"type": "transcript", "data": transcript}
        )

        # Process audio in background task
        asyncio.create_task(
            process_audio_and_update(
                session_id=session_id,
                turn_id=turn_id,
                audio_content=audio_content,
                speaker=speaker,
                session=session,
            )
        )

        return {"status": "success", "turn_id": turn_id}

    except Exception as e:
        logger.error(f"Audio upload error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e)
        )


async def process_audio_and_update(
    session_id: str,
    turn_id: int,
    audio_content: bytes,
    speaker: str,
    session: Session,
):
    """Process audio and update transcript"""
    try:
        # Save audio content temporarily
        temp_filename = (
            f"temp_audio_{turn_id}.webm"  # Changed extension to match frontend
        )
        with open(temp_filename, "wb") as f:
            f.write(audio_content)

        try:
            # Transcribe using AssemblyAI
            transcriber = aai.Transcriber()
            transcript = transcriber.transcribe(temp_filename)

            if transcript.status == aai.TranscriptStatus.error:
                logger.error(f"Transcription failed: {transcript.error}")
                message = "[Transcription failed]"
            else:
                message = (
                    transcript.text or "[Empty transcript]"
                )  # Handle empty transcripts

            # Update transcript
            for t in session.transcripts:
                if t["turn_id"] == turn_id:
                    t["transcript"] = message
                    await session_manager.broadcast_to_session(
                        session_id, {"type": "transcript", "data": t}
                    )
                    break

            # Only analyze if we have actual text
            if message and message not in [
                "[Transcription failed]",
                "[Empty transcript]",
            ]:
                await _analyze_and_broadcast(
                    session=session,
                    session_id=session_id,
                    turn_id=turn_id,
                    message=message,
                    speaker=speaker,
                )

        finally:
            # Clean up temporary file
            try:
                os.remove(temp_filename)
            except Exception as e:
                logger.error(f"Error removing temporary file: {e}")

    except Exception as e:
        logger.error(f"Audio processing error: {e}")
        logger.exception("Full traceback:")
