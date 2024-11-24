import os
import logging
from pynput import keyboard
import time
import subprocess
import requests
from threading import Thread
from datetime import datetime
from queue import Queue

# Configure logging
logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)


class TurnClient:
    def __init__(self, api_url="http://localhost:8000"):
        self.api_url = api_url.rstrip("/")
        self.session_id = None
        self.turn_count = 0
        self.should_stop = False
        self.is_recording = False
        self.current_process = None
        self.speaker_name = "Speaker A"

        # Audio settings
        self.SAMPLE_RATE = 16000
        self.CHANNELS = 1

        # Verify audio setup
        self.verify_audio_setup()

        # Recording control
        self.is_recording_requested = False
        self.listener = keyboard.Listener(
            on_press=self._on_press, on_release=self._on_release
        )
        self.listener.start()

        # Processing queue
        self.processing_queue = Queue()
        self.processing_thread = Thread(target=self._process_recordings, daemon=True)
        self.processing_thread.start()

        # Create temporary directory for recordings
        self.temp_dir = os.path.join(
            "temp_recordings", datetime.now().strftime("%Y%m%d_%H%M%S")
        )
        os.makedirs(self.temp_dir, exist_ok=True)

    def verify_audio_setup(self):
        """Verify that audio recording is possible"""
        try:
            result = subprocess.run(
                ["sox", "--version"], capture_output=True, text=True
            )
            if result.returncode != 0:
                raise RuntimeError("sox is not installed. Please install it first.")
        except FileNotFoundError:
            raise RuntimeError("sox is not installed. Please install it first.")

    def start_session(self):
        """Initialize a new session with the API"""
        try:
            response = requests.post(f"{self.api_url}/start-session")
            response.raise_for_status()
            self.session_id = response.json()["session_id"]
            return True
        except Exception as e:
            logger.error(f"Failed to start session: {e}")
            return False

    def record_turn(self):
        """Record a single turn using sox"""
        filename = os.path.join(self.temp_dir, f"turn_{self.turn_count}.wav")

        try:
            sox_args = [
                "sox",
                "-q",
                "-d",
                "--buffer",
                "256",
                "--no-show-progress",
                f"--rate={self.SAMPLE_RATE}",
                f"--channels={self.CHANNELS}",
                "--encoding=signed-integer",
                "--bits=16",
                "--type=wav",
                filename,
            ]

            self.current_process = subprocess.Popen(
                sox_args, stdout=subprocess.PIPE, stderr=subprocess.PIPE
            )

            while self.is_recording_requested and not self.should_stop:
                time.sleep(0.1)

            if self.current_process:
                self.current_process.terminate()
                self.current_process.wait()
                self.current_process = None

            return filename

        except Exception as e:
            logger.error(f"Error during recording: {e}")
            if self.current_process:
                self.current_process.terminate()
                self.current_process = None
            return None

    def upload_turn(self, filename):
        """Upload a recorded turn to the API"""
        try:
            with open(filename, "rb") as f:
                files = {"audio_file": ("audio.wav", f, "audio/wav")}
                data = {"speaker": self.speaker_name}

                response = requests.post(
                    f"{self.api_url}/upload-turn/{self.session_id}",
                    files=files,
                    data=data,
                )

                if response.status_code != 200:
                    print(f"Error response: {response.text}")

                response.raise_for_status()
                return response.json()
        except Exception as e:
            logger.error(f"Failed to upload turn: {e}")
            if hasattr(e, "response") and hasattr(e.response, "text"):
                logger.error(f"Error details: {e.response.text}")
            return None

    def _on_press(self, key):
        """Handle key press events"""
        try:
            if key == keyboard.Key.space:
                self.is_recording_requested = not self.is_recording_requested
            elif key == keyboard.Key.esc:
                self.should_stop = True
                return False
        except Exception as e:
            logger.debug(f"Error in key press handler: {e}")

    def _on_release(self, key):
        """Handle key release events"""
        pass

    def _process_recordings(self):
        """Background worker to process recordings"""
        while True:
            try:
                turn_number, filename = self.processing_queue.get()
                if filename and os.path.exists(filename):
                    # Upload the recording
                    result = self.upload_turn(filename)
                    if result:
                        print(f"\nTurn {turn_number}: {result['transcript']}\n")
                        self.speaker_name = (
                            "Speaker B"
                            if self.speaker_name == "Speaker A"
                            else "Speaker A"
                        )

                    # Cleanup
                    try:
                        os.remove(filename)
                    except Exception:
                        pass
                self.processing_queue.task_done()
            except Exception as e:
                logger.debug(f"Processing error: {e}")

    def run(self):
        """Main loop for the turn-based recording system"""
        if not self.start_session():
            print("Failed to start session. Exiting...")
            return

        print("\n=== Turn-Based Recording Client ===")
        print("Instructions:")
        print("1. Press SPACE to start/stop recording")
        print("2. Press ESC to exit")
        print(f"\nSession ID: {self.session_id}")
        print("\nReady for turns...\n")

        try:
            while not self.should_stop:
                if self.is_recording_requested and not self.is_recording:
                    try:
                        self.turn_count += 1
                        self.is_recording = True
                        print(f"\nRecording {self.speaker_name}...")

                        filename = self.record_turn()
                        if filename:
                            self.processing_queue.put((self.turn_count, filename))

                    except Exception as e:
                        logger.debug(f"Error during turn {self.turn_count}: {e}")
                    finally:
                        print("Stopped.")
                        self.is_recording = False
                        self.is_recording_requested = False

                time.sleep(0.1)

        except KeyboardInterrupt:
            print("\n\nExiting...")
        finally:
            self.cleanup()

    def cleanup(self):
        """Clean up resources"""
        logger.info("Cleaning up resources...")
        if self.current_process:
            try:
                self.current_process.terminate()
                self.current_process.wait()
            except Exception as e:
                logger.error(f"Error terminating sox process: {e}")

        self.listener.stop()


def main():
    client = TurnClient()
    client.run()


if __name__ == "__main__":
    main()
