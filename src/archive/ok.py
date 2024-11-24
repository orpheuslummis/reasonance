import assemblyai as aai

aai.settings.api_key = "1ff1d90eba8749869602b8e547b820e4"

audio_file = "./data/malcomx.ogg"

config = aai.TranscriptionConfig(
    speaker_labels=True,
)

transcript = aai.Transcriber().transcribe(audio_file, config)

for utterance in transcript.utterances:
    print(f"Speaker {utterance.speaker}: {utterance.text}")
