import assemblyai as aai
import os
import logging
from dotenv import load_dotenv
from pynput import keyboard
import time
import subprocess
from queue import Queue
from threading import Thread
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)

# Suppress HTTP logging
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("urllib3").setLevel(logging.WARNING)


class TurnBasedRecorder:
    def __init__(self):
        # Initialize AssemblyAI
        load_dotenv()
        api_key = os.getenv("ASSEMBLYAI_API_KEY")
        if not api_key:
            raise ValueError("ASSEMBLYAI_API_KEY not found in environment variables")
        aai.settings.api_key = api_key

        self.turn_count = 0
        self.should_stop = False
        self.is_recording = False
        self.current_process = None

        # Audio settings
        self.SAMPLE_RATE = 16000
        self.CHANNELS = 1

        # Add audio device verification
        self.verify_audio_setup()

        # Change space_pressed to is_recording_requested
        self.is_recording_requested = False
        self.listener = keyboard.Listener(
            on_press=self._on_press, on_release=self._on_release
        )
        self.listener.start()

        # Add processing queue and worker thread
        self.processing_queue = Queue()
        self.processing_thread = Thread(target=self._process_recordings, daemon=True)
        self.processing_thread.start()

        # Add session directory
        self.session_timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.session_dir = os.path.join(
            "recordings", f"session_{self.session_timestamp}"
        )
        os.makedirs(self.session_dir, exist_ok=True)

    def verify_audio_setup(self):
        """Verify that audio recording is possible"""
        try:
            # Check if sox is installed
            result = subprocess.run(
                ["sox", "--version"], capture_output=True, text=True
            )
            if result.returncode != 0:
                raise RuntimeError("sox is not installed. Please install it first.")

            # Check for audio input devices
            result = subprocess.run(
                ["sox", "-n", "--help"], capture_output=True, text=True
            )
            if result.returncode != 0:
                raise RuntimeError("Unable to access audio devices")
        except FileNotFoundError:
            raise RuntimeError("sox is not installed. Please install it first.")

    def record_turn(self):
        """Record a single turn using sox"""
        filename = os.path.join(self.session_dir, f"turn_{self.turn_count}.wav")

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

            # Create file directory if it doesn't exist
            os.makedirs(
                os.path.dirname(filename) if os.path.dirname(filename) else ".",
                exist_ok=True,
            )

            self.current_process = subprocess.Popen(
                sox_args, stdout=subprocess.PIPE, stderr=subprocess.PIPE
            )

            # Record until space is pressed again or ESC is pressed
            while self.is_recording_requested and not self.should_stop:
                time.sleep(0.1)

            # Stop recording
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

    def transcribe_file(self, filename):
        """Transcribe a WAV file using AssemblyAI"""
        try:
            transcriber = aai.Transcriber()
            transcript = transcriber.transcribe(filename)

            if transcript.status == aai.TranscriptStatus.error:
                logger.error(f"Transcription failed: {transcript.error}")
                return None

            return transcript.text
        except Exception as e:
            logger.error(f"Error during transcription: {e}")
            return None

    def _on_press(self, key):
        """Handle key press events"""
        try:
            if key == keyboard.Key.space:
                # Toggle recording state
                self.is_recording_requested = not self.is_recording_requested
            elif key == keyboard.Key.esc:
                self.should_stop = True
                return False
        except Exception as e:
            logger.debug(f"Error in key press handler: {e}")

    def _on_release(self, key):
        """Handle key release events"""
        pass  # We don't need this anymore but keeping it for the listener

    def _process_recordings(self):
        """Background worker to process recordings"""
        while True:
            try:
                turn_number, filename = self.processing_queue.get()
                if filename and os.path.exists(filename):
                    # Transcribe the recording
                    text = self.transcribe_file(filename)
                    if text:
                        print(f"\nTurn {turn_number}: {text}\n")

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
        print("\n=== Turn-Based Recording System ===")
        print("Instructions:")
        print("1. Press SPACE to start/stop recording")
        print("2. Press ESC to exit")
        print("\nReady for turns...\n")

        try:
            while not self.should_stop:
                if self.is_recording_requested and not self.is_recording:
                    try:
                        self.turn_count += 1
                        self.is_recording = True
                        print("\nRecording...")

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

        # Stop the keyboard listener
        self.listener.stop()


def main():
    recorder = TurnBasedRecorder()
    recorder.run()


if __name__ == "__main__":
    main()
