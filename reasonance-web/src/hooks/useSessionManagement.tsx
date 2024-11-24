import { Dispatch, SetStateAction, useCallback } from "react";
import { API_CONFIG } from "../config";
import { Transcript } from "../types";

interface UseSessionManagementProps {
    userName: string;
    sessionId: string | null;
    setSessionId: (id: string | null) => void;
    setTranscripts: Dispatch<SetStateAction<Transcript[]>>;
    setParticipants: (participants: string[]) => void;
    onMessageCountUpdate?: (sessionId: string, count: number) => void;
}

export function useSessionManagement({
    userName,
    sessionId,
    setSessionId,
    setTranscripts,
    setParticipants,
    onMessageCountUpdate,
}: UseSessionManagementProps) {
    const joinSession = useCallback(async (id: string) => {
        try {
            const response = await fetch(
                `${API_CONFIG.BASE_URL}/join-session/${id}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ participant_name: userName }),
                },
            );

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            setSessionId(id);

            // Fetch existing transcripts
            const transcriptsResponse = await fetch(
                `${API_CONFIG.BASE_URL}/session-transcripts/${id}`,
            );
            if (transcriptsResponse.ok) {
                const data = await transcriptsResponse.json();
                setTranscripts(data.transcripts.reverse());
            }
        } catch (error) {
            console.error("Failed to join session:", error);
            throw error;
        }
    }, [userName, setSessionId, setTranscripts]);

    const createSession = useCallback(async () => {
        try {
            // Create the session
            const response = await fetch(
                `${API_CONFIG.BASE_URL}/start-session`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                    },
                    body: JSON.stringify({ participant_name: userName }),
                    credentials: "include",
                    mode: "cors",
                },
            );

            if (!response.ok) {
                const errorData = await response.text();
                throw new Error(
                    `Failed to create session: ${response.status} - ${errorData}`,
                );
            }

            const data = await response.json();

            // Join the session directly without checking timeline first
            const joinResponse = await fetch(
                `${API_CONFIG.BASE_URL}/join-session/${data.session_id}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ participant_name: userName }),
                },
            );

            if (!joinResponse.ok) {
                throw new Error(
                    `Failed to join session: ${joinResponse.status}`,
                );
            }

            setSessionId(data.session_id);

            // Fetch transcripts after joining
            const transcriptsResponse = await fetch(
                `${API_CONFIG.BASE_URL}/session-transcripts/${data.session_id}`,
            );
            if (transcriptsResponse.ok) {
                const transcriptData = await transcriptsResponse.json();
                setTranscripts(transcriptData.transcripts.reverse());
            }
        } catch (error) {
            console.error("Failed to create session:", error);
            setSessionId(null);
            throw error;
        }
    }, [userName, setSessionId, setTranscripts]);

    const leaveSession = useCallback(async (id: string) => {
        try {
            await fetch(`${API_CONFIG.BASE_URL}/leave-session/${id}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ participant_name: userName }),
            });
        } catch (error) {
            console.error("Failed to leave session:", error);
            throw error;
        }
    }, [userName]);

    const backToSessions = useCallback(async () => {
        if (sessionId) {
            try {
                await leaveSession(sessionId);
            } catch (error) {
                console.error("Error leaving session:", error);
            }
        }
        setSessionId(null);
        setTranscripts([]);
        setParticipants([]);
    }, [
        sessionId,
        leaveSession,
        setSessionId,
        setTranscripts,
        setParticipants,
    ]);

    const handleMessageCountUpdate = useCallback(
        (id: string, count: number) => {
            if (onMessageCountUpdate) {
                onMessageCountUpdate(id, count);
            }
        },
        [onMessageCountUpdate],
    );

    return {
        createSession,
        joinSession,
        leaveSession,
        backToSessions,
        handleMessageCountUpdate,
    };
}
