import { useCallback, useEffect, useRef, useState } from "react";
import { API_CONFIG } from "../config";

interface AudioRecorderState {
    isRecording: boolean;
    error: string | null;
}

export function useAudioRecorder(sessionId: string | null, userName: string) {
    const [state, setState] = useState<AudioRecorderState>({
        isRecording: false,
        error: null,
    });
    const mediaRecorder = useRef<MediaRecorder | null>(null);
    const audioChunks = useRef<Blob[]>([]);

    const startRecording = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
            });
            mediaRecorder.current = new MediaRecorder(stream);
            audioChunks.current = [];

            mediaRecorder.current.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunks.current.push(event.data);
                }
            };

            mediaRecorder.current.onstop = async () => {
                const audioBlob = new Blob(audioChunks.current, {
                    type: "audio/webm",
                });
                const formData = new FormData();
                formData.append("audio", audioBlob);
                formData.append("speaker", userName);

                try {
                    const response = await fetch(
                        `${API_CONFIG.BASE_URL}/upload-audio/${sessionId}`,
                        {
                            method: "POST",
                            body: formData,
                        },
                    );

                    if (!response.ok) {
                        throw new Error(
                            `Upload failed: ${response.statusText}`,
                        );
                    }

                    // Clear the chunks after successful upload
                    audioChunks.current = [];
                } catch (error) {
                    console.error("Error uploading audio:", error);
                    setState((prev) => ({
                        ...prev,
                        error: "Failed to upload audio",
                    }));
                }
            };

            mediaRecorder.current.start();
            setState({ isRecording: true, error: null });
        } catch (error) {
            console.error("Error accessing microphone:", error);
            setState({
                isRecording: false,
                error: "Could not access microphone",
            });
        }
    }, [sessionId, userName]);

    const stopRecording = useCallback(() => {
        if (
            mediaRecorder.current && mediaRecorder.current.state !== "inactive"
        ) {
            mediaRecorder.current.stop();
            mediaRecorder.current.stream.getTracks().forEach((track) =>
                track.stop()
            );
            setState((prev) => ({ ...prev, isRecording: false }));
        }
    }, []);

    useEffect(() => {
        return () => {
            if (mediaRecorder.current) {
                stopRecording();
            }
        };
    }, [stopRecording]);

    return {
        isRecording: state.isRecording,
        error: state.error,
        startRecording,
        stopRecording,
    };
}
