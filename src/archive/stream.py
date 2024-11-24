# Works best when:
# - Each speaker speaks for at least 30 seconds uninterrupted
# - Speakers avoid short phrases like "Yeah", "Right"
# - Cross-talking is minimized
# - The maximum number of speakers is 10

import assemblyai as aai
import os
import logging
import signal
import threading
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

logging.getLogger("websockets").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)

should_stop = threading.Event()


def signal_handler(signum, frame):
    should_stop.set()


original_next = aai.extras.MicrophoneStream.__next__


def patched_next(self):
    if should_stop.is_set():
        raise StopIteration
    try:
        data = self._stream.read(self._chunk_size, exception_on_overflow=False)
        return data
    except KeyboardInterrupt:
        should_stop.set()
        raise StopIteration


aai.extras.MicrophoneStream.__next__ = patched_next


def on_open(session_opened: aai.RealtimeSessionOpened):
    logger.info(f"Session ID: {session_opened.session_id}")
    logger.debug(f"Session expires at: {session_opened.expires_at}")


def on_data(transcript: aai.RealtimeTranscript):
    if not transcript.text:
        return

    if isinstance(transcript, aai.RealtimeFinalTranscript):
        print("\nFinal:", transcript.text)
    else:
        print(f"\rPartial: {transcript.text}", end="", flush=True)


def on_error(error: aai.RealtimeError):
    logger.error(f"Error: {error}")


def on_close():
    logger.info("Session closed")


def main():
    api_key = os.getenv("ASSEMBLYAI_API_KEY")
    if not api_key:
        raise ValueError("ASSEMBLYAI_API_KEY not found in environment variables")

    aai.settings.api_key = api_key
    microphone_stream = None
    transcriber = None

    logger.info("Initializing transcriber...")
    transcriber = aai.RealtimeTranscriber(
        sample_rate=16_000,
        on_data=on_data,
        on_error=on_error,
        on_open=on_open,
        on_close=on_close,
        end_utterance_silence_threshold=300,
        speaker_labels=True,
    )

    signal.signal(signal.SIGINT, signal_handler)

    try:
        print("\n=== Starting Transcription Session ===")
        logger.info("Connecting to AssemblyAI...")
        transcriber.connect()

        print("🎤 Starting microphone recording... (Press Ctrl+C to stop)")
        logger.info("Starting microphone stream...")
        microphone_stream = aai.extras.MicrophoneStream(sample_rate=16_000)

        print("🔄 Streaming audio to AssemblyAI...\n")
        transcriber.stream(microphone_stream)

    except KeyboardInterrupt:
        print("\n\n=== Stopping Transcription Session ===")
        logger.info("Stopping on user request (Ctrl+C)...")
    except Exception:
        logger.exception("Unexpected error occurred")
    finally:
        logger.info("Cleaning up...")
        try:
            if microphone_stream:
                microphone_stream._stream.stop_stream()
                microphone_stream._stream.close()
            if transcriber:
                transcriber.close()
        except Exception as e:
            logger.error(f"Error during cleanup: {e}")
        os._exit(0)


if __name__ == "__main__":
    main()
