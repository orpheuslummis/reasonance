from dataclasses import dataclass, field
from enum import Enum
from datetime import datetime
from typing import Optional


class ArgumentType(str, Enum):
    CLAIM = "claim"
    SUPPORT = "support"
    COUNTER = "counter"
    RESPONSE = "response"


@dataclass
class Position:
    x: float = 0
    y: float = 0


@dataclass
class ArgumentNode:
    turn_id: int
    type: ArgumentType
    summary: str
    speaker: str
    topic: Optional[str] = None
    position: Optional[Position] = None
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class ArgumentEdge:
    source_id: int
    target_id: int
    type: ArgumentType
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
