from datetime import datetime
from typing import Dict, List, Optional, Set
import os
import json
import logging
from pathlib import Path
import shutil
from .config import Config
from .types import ArgumentNode, ArgumentType
from .argument_mapper import ArgumentMapper

logger = logging.getLogger(__name__)


class Session:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.turn_count = 0
        self.transcripts: List[Dict] = []
        self.created_at = datetime.now()
        self.last_activity = datetime.now()
        self.last_turn_id = 0
        self.participants: Set[str] = set()
        self.connected_clients = 0
        self.anchors: List[Dict] = []

        # Initialize ArgumentMapper
        self.argument_mapper = ArgumentMapper()

        self.session_dir = os.path.join(Config.RECORDINGS_DIR, f"session_{session_id}")
        os.makedirs(self.session_dir, exist_ok=True)

        self.artifacts = []
        self.timeline = self._create_timeline()

        logger.info(f"Created new session: {session_id}")

    def _create_timeline(self) -> Dict:
        return {
            "transcripts": self.transcripts,
            "artifacts": self.artifacts,
            "anchors": self.anchors,
            "argument_graph": self.argument_mapper.get_graph(),
            "metadata": {
                "created_at": self.created_at.isoformat(),
                "participants": list(self.participants),
                "session_id": self.session_id,
                "is_archived": False,
            },
        }

    @property
    def is_inactive(self) -> bool:
        inactive_duration = datetime.now() - self.last_activity
        return (
            self.connected_clients <= 0
            and len(self.participants) == 0
            and inactive_duration.total_seconds() > Config.INACTIVE_SESSION_TIMEOUT * 60
        )

    def update_activity(self):
        self.last_activity = datetime.now()

    def add_participant(self, name: str):
        self.participants.add(name)
        self.connected_clients += 1
        self.update_activity()

    def remove_participant(self, name: str):
        self.participants.discard(name)
        self.connected_clients = max(0, self.connected_clients - 1)
        self.update_activity()

    def archive(self):
        """Archive the session data to a JSON file"""
        self.timeline["metadata"]["is_archived"] = True
        self.timeline["metadata"]["archived_at"] = datetime.now().isoformat()
        self.timeline["metadata"]["participants"] = list(self.participants)

        archive_path = Path(Config.ARCHIVES_DIR) / f"{self.session_id}.json"
        archive_path.parent.mkdir(parents=True, exist_ok=True)

        with open(archive_path, "w") as f:
            json.dump(
                {
                    "transcripts": self.transcripts,
                    "artifacts": self.artifacts,
                    "anchors": self.anchors,
                    "argument_graph": self.argument_mapper.get_graph(),
                    "metadata": {
                        "created_at": self.created_at.isoformat(),
                        "archived_at": datetime.now().isoformat(),
                        "participants": list(self.participants),
                        "session_id": self.session_id,
                        "is_archived": True,
                        "transcript_count": len(self.transcripts),
                        "participant_count": len(self.participants),
                    },
                },
                f,
                indent=2,
            )

        if os.path.exists(self.session_dir):
            archive_recordings_dir = (
                Path(Config.ARCHIVES_DIR) / f"recordings_{self.session_id}"
            )
            shutil.move(self.session_dir, archive_recordings_dir)

    def add_anchor(self, anchor_data: dict) -> dict:
        """Add an anchor and return the standardized anchor data"""
        new_anchor = {
            "position": anchor_data["position"],
            "length": anchor_data["length"],
            "word": anchor_data["word"],
            "turnId": anchor_data["turnId"],
            "userId": anchor_data["userId"],
            "timestamp": datetime.now().isoformat(),
        }
        self.anchors.append(new_anchor)
        self.timeline["anchors"] = self.anchors
        return new_anchor

    def remove_anchor(
        self, turn_id: int, position: int, length: int, user_id: str
    ) -> Optional[dict]:
        """Remove an anchor and return the removed anchor data if found"""
        for i, anchor in enumerate(self.anchors):
            if (
                anchor["turnId"] == turn_id
                and anchor["position"] == position
                and anchor["length"] == length
                and anchor["userId"] == user_id
            ):
                removed = self.anchors.pop(i)
                self.timeline["anchors"] = self.anchors
                return removed
        return None

    async def analyze_message(
        self,
        turn_id: int,
        message: str,
        speaker: str,
    ) -> ArgumentNode:
        """Analyze a message and update the argument graph"""
        try:
            # Get full conversation context
            context = self.get_all_turns()

            return await self.argument_mapper.analyze_message(
                turn_id=turn_id, message=message, speaker=speaker, context_turns=context
            )
        except Exception as e:
            logger.error(f"Analysis failed: {e}")
            return ArgumentNode(
                turn_id=turn_id,
                type=ArgumentType.CLAIM,
                summary=message[:100],
                speaker=speaker,
            )

    def get_recent_turns(self, count: int) -> List[dict]:
        """Get recent turns for context"""
        return sorted(self.transcripts, key=lambda x: x["timestamp"], reverse=True)[
            :count
        ]

    def get_all_turns(self) -> List[dict]:
        """Get all conversation turns"""
        return sorted(self.transcripts, key=lambda x: x["timestamp"])

    async def analyze_and_broadcast(
        self,
        turn_id: int,
        message: str,
        speaker: str,
    ) -> Dict:
        """Analyze message and broadcast results"""
        node = await self.analyze_message(
            turn_id=turn_id, message=message, speaker=speaker
        )

        graph_data = self.argument_mapper.get_graph()

        return {"node": node, "graph": graph_data}
