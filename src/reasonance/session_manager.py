from typing import Dict, List, Optional
import asyncio
import logging
import json
from pathlib import Path
import uuid
from .models import Session
from .config import Config

logger = logging.getLogger(__name__)


class SessionManager:
    def __init__(self):
        self.active_sessions: Dict[str, Session] = {}
        self.session_queues: Dict[str, List[asyncio.Queue]] = {}
        self.global_queues: List[asyncio.Queue] = []
        self.archived_sessions = self._load_archived_sessions()
        self.cleanup_task = None

    def _load_archived_sessions(self) -> Dict:
        """Load all archived sessions from the archives directory"""
        archived = {}
        archives_dir = Path(Config.ARCHIVES_DIR)
        if archives_dir.exists():
            for file in archives_dir.glob("*.json"):
                try:
                    with open(file) as f:
                        session_data = json.load(f)
                        archived[file.stem] = session_data
                except Exception as e:
                    logger.error(f"Error loading archived session {file}: {e}")
        return archived

    def create_session(self) -> Session:
        """Create a new session with a unique ID"""
        session_id = str(uuid.uuid4())
        session = Session(session_id)
        self.active_sessions[session_id] = session
        self.session_queues[session_id] = []
        logger.info(f"Created new session: {session_id}")
        return session

    def get_session(self, session_id: str) -> Optional[Session]:
        """Get an active session by ID"""
        return self.active_sessions.get(session_id)

    def remove_session(self, session_id: str):
        """Remove a session and clean up its resources"""
        if session_id in self.active_sessions:
            session = self.active_sessions[session_id]
            session.archive()  # Archive before removing
            del self.active_sessions[session_id]
            del self.session_queues[session_id]
            logger.info(f"Removed session: {session_id}")

    async def broadcast_to_session(self, session_id: str, data: dict):
        """Broadcast a message to all clients in a session"""
        if session_id in self.session_queues:
            # Remove any top-level timestamp before broadcasting
            if "timestamp" in data:
                del data["timestamp"]

            message = {"data": json.dumps(data)}
            for queue in self.session_queues[session_id]:
                await queue.put(message)

    async def broadcast_to_home(self, data: dict):
        """Broadcast updates to home page clients"""
        if hasattr(self, "home_queues"):
            for queue in self.home_queues:
                await queue.put(data)

    def add_client_queue(self, session_id: str) -> asyncio.Queue:
        """Add a new client queue to a session"""
        if session_id not in self.session_queues:
            self.session_queues[session_id] = []
        queue = asyncio.Queue()
        self.session_queues[session_id].append(queue)
        return queue

    def remove_client_queue(self, session_id: str, queue: asyncio.Queue):
        """Remove a client queue from a session"""
        if session_id in self.session_queues:
            try:
                self.session_queues[session_id].remove(queue)
            except ValueError:
                pass  # Queue already removed

    async def cleanup_inactive_sessions(self):
        """Periodically clean up inactive sessions"""
        while True:
            try:
                for session_id, session in list(self.active_sessions.items()):
                    if session.is_inactive:
                        logger.info(f"Cleaning up inactive session: {session_id}")
                        self.remove_session(session_id)
                        # Notify home page clients about session removal
                        await self.broadcast_to_home(
                            {"type": "session_removed", "session_id": session_id}
                        )
            except Exception as e:
                logger.error(f"Error in cleanup task: {e}")

            await asyncio.sleep(Config.CLEANUP_INTERVAL)

    async def start_cleanup_task(self):
        """Start the background cleanup task"""
        if self.cleanup_task is None:
            self.cleanup_task = asyncio.create_task(self.cleanup_inactive_sessions())
            logger.info("Started session cleanup task")

    async def stop_cleanup_task(self):
        """Stop the background cleanup task"""
        if self.cleanup_task:
            self.cleanup_task.cancel()
            try:
                await self.cleanup_task
            except asyncio.CancelledError:
                pass
            self.cleanup_task = None
            logger.info("Stopped session cleanup task")

    def get_active_sessions_info(self) -> List[Dict]:
        """Get information about all active sessions"""
        return [
            {
                "session_id": session.session_id,
                "participant_count": len(session.participants),
                "created_at": session.created_at.isoformat(),
                "transcript_count": len(session.transcripts),
                "is_archived": False,
            }
            for session in self.active_sessions.values()
        ]

    def get_archived_sessions_info(self) -> List[Dict]:
        """Get information about all archived sessions"""
        return [
            {
                "session_id": session_id,
                "participant_count": len(
                    data.get("metadata", {}).get("participants", [])
                ),
                "created_at": data.get("metadata", {}).get("created_at", ""),
                "transcript_count": len(data.get("transcripts", [])),
                "is_archived": True,
            }
            for session_id, data in self.archived_sessions.items()
        ]

    def get_session_data(self, session_id: str) -> Optional[Dict]:
        """Get complete session data, either active or archived"""
        if session_id in self.active_sessions:
            session = self.active_sessions[session_id]
            return {
                "transcripts": session.transcripts,
                "anchors": session.anchors,
                "argument_graph": {
                    "nodes": session.argument_nodes,
                    "edges": session.argument_edges,
                },
                "metadata": {
                    "created_at": session.created_at.isoformat(),
                    "participants": list(session.participants),
                    "session_id": session.session_id,
                    "is_archived": False,
                },
            }

    def add_global_queue(self, queue: asyncio.Queue):
        """Add a queue for global events"""
        self.global_queues.append(queue)

    def remove_global_queue(self, queue: asyncio.Queue):
        """Remove a global event queue"""
        if queue in self.global_queues:
            self.global_queues.remove(queue)

    async def broadcast_global(self, message: Dict):
        """Broadcast message to all global listeners"""
        for queue in self.global_queues:
            await queue.put({"data": json.dumps(message)})
