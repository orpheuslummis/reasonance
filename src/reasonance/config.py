import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    INACTIVE_SESSION_TIMEOUT = 5  # minutes
    CLEANUP_INTERVAL = 60  # seconds
    RECORDINGS_DIR = "recordings"
    ARCHIVES_DIR = "archives"
    CLAUDE_API_KEY = os.getenv("CLAUDE_API_KEY")
    CLAUDE_MODEL = "claude-3-5-haiku-20241022"
    MAX_SUMMARY_LENGTH = 100
    ASSEMBLYAI_API_KEY = os.getenv("ASSEMBLYAI_API_KEY")
