import { useCallback, useEffect, useState } from "react";
import { API_CONFIG } from "../config";
import { ArgumentGraph, Session, Transcript } from "../types";

interface SessionEventCallbacks {
    onParticipantUpdate: (participants: string[]) => void;
    onTranscriptUpdate: (transcript: Transcript) => void;
    onArgumentGraphUpdate: (graph: ArgumentGraph) => void;
    onMessageCountUpdate?: (sessionId: string, count: number) => void;
}

export function useSessionEvents(
    sessionId: string | null,
    callbacks: SessionEventCallbacks,
) {
    const [error, setError] = useState<string | null>(null);
    const {
        onParticipantUpdate,
        onTranscriptUpdate,
        onArgumentGraphUpdate,
        onMessageCountUpdate,
    } = callbacks;

    useEffect(() => {
        let eventSource: EventSource;
        let retryCount = 0;
        let reconnectTimeout: NodeJS.Timeout;
        const { retryAttempts, retryDelay, withCredentials } =
            API_CONFIG.SSE_CONFIG;

        const handleInitialState = (data: any) => {
            try {
                // Handle participants
                if (Array.isArray(data.participants)) {
                    onParticipantUpdate(data.participants);
                }

                // Handle transcripts
                if (Array.isArray(data.transcripts)) {
                    data.transcripts.forEach((transcript: Transcript) => {
                        onTranscriptUpdate(transcript);
                    });
                }

                // Handle argument graph
                if (data.argument_graph) {
                    onArgumentGraphUpdate(data.argument_graph);
                }
            } catch (err) {
                console.error("Error processing initial state:", err);
                setError("Error loading session data");
            }
        };

        const handleMessage = (event: MessageEvent) => {
            try {
                const data = JSON.parse(event.data);
                console.log("Received SSE data:", data);

                if (data.type === "keepalive") return;

                switch (data.type) {
                    case "initial_state":
                        handleInitialState(data);
                        break;
                    case "argument_update":
                        onArgumentGraphUpdate(data.data);
                        break;
                    case "participant_joined":
                    case "participant_left":
                    case "participant_update":
                        if (data.participants) {
                            onParticipantUpdate(data.participants);
                        }
                        break;
                    case "transcript":
                        onTranscriptUpdate(data.data);
                        if (onMessageCountUpdate && sessionId) {
                            onMessageCountUpdate(sessionId, data.message_count);
                        }
                        break;
                    default:
                        console.warn("Unknown event type:", data.type);
                }
            } catch (err) {
                console.error("Failed to process SSE message:", err);
                setError("Error processing server message");
            }
        };

        const handleError = (event: Event) => {
            const target = event.target as EventSource;
            console.error("SSE error:", event);

            if (target.readyState === EventSource.CLOSED) {
                eventSource?.close();

                if (retryCount < retryAttempts) {
                    retryCount++;
                    console.log(
                        `Retrying connection (${retryCount}/${retryAttempts})...`,
                    );
                    reconnectTimeout = setTimeout(
                        connectEventSource,
                        retryDelay * retryCount,
                    );
                } else {
                    setError("Connection lost. Please refresh the page.");
                }
            }
        };

        const connectEventSource = () => {
            if (eventSource) {
                eventSource.close();
            }

            if (!sessionId) return;

            const url = new URL(
                `${API_CONFIG.BASE_URL}/session/${sessionId}/events`,
            );
            eventSource = new EventSource(url.toString(), { withCredentials });

            eventSource.addEventListener("error", handleError);
            eventSource.addEventListener("message", handleMessage);

            eventSource.onopen = () => {
                console.log("SSE connection opened for session:", sessionId);
                retryCount = 0;
                setError(null);
            };
        };

        connectEventSource();

        return () => {
            if (eventSource) {
                eventSource.removeEventListener("error", handleError);
                eventSource.removeEventListener("message", handleMessage);
                eventSource.close();
            }
            if (reconnectTimeout) {
                clearTimeout(reconnectTimeout);
            }
        };
    }, [
        sessionId,
        onParticipantUpdate,
        onTranscriptUpdate,
        onArgumentGraphUpdate,
        onMessageCountUpdate,
    ]);

    return { error };
}

export function useHomePageEvents(
    setSessions: (
        sessions: Session[] | ((prev: Session[]) => Session[]),
    ) => void,
) {
    const [isLoading, setIsLoading] = useState(true);
    const [isArchiveLoading, setIsArchiveLoading] = useState(true);

    const fetchInitialSessions = useCallback(async () => {
        try {
            // Fetch active sessions
            const activeResponse = await fetch(
                `${API_CONFIG.BASE_URL}/sessions`,
            );
            if (!activeResponse.ok) {
                throw new Error("Failed to fetch active sessions");
            }
            const activeData = await activeResponse.json();

            // Fetch archived sessions
            const archivedResponse = await fetch(
                `${API_CONFIG.BASE_URL}/archived-sessions`,
            );
            if (!archivedResponse.ok) {
                throw new Error("Failed to fetch archived sessions");
            }
            const archivedData = await archivedResponse.json();

            // Combine and set sessions
            // Note: activeData and archivedData are now arrays directly
            setSessions([
                ...activeData.map((session: Session) => ({
                    ...session,
                    is_archived: false,
                })),
                ...archivedData.map((session: Session) => ({
                    ...session,
                    is_archived: true,
                })),
            ]);

            setIsLoading(false);
            setIsArchiveLoading(false);
        } catch (error) {
            console.error("Error fetching initial sessions:", error);
            // Still set loading to false even if there's an error
            setIsLoading(false);
            setIsArchiveLoading(false);
            // You might want to show an error message to the user here
        }
    }, [setSessions]);

    useEffect(() => {
        let eventSource: EventSource;
        let retryCount = 0;
        const maxRetries = 3;

        const connectEventSource = () => {
            eventSource = new EventSource(`${API_CONFIG.BASE_URL}/events`, {
                withCredentials: false,
            });

            eventSource.onopen = () => {
                retryCount = 0; // Reset retry count on successful connection
            };

            eventSource.onerror = (error) => {
                console.error("SSE connection error:", error);
                eventSource.close();

                if (retryCount < maxRetries) {
                    retryCount++;
                    setTimeout(connectEventSource, 1000 * retryCount); // Exponential backoff
                }
            };

            eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    console.log("Received SSE data:", data);

                    if (data.type === "sessions_update") {
                        setSessions((prevSessions: Session[]) => {
                            const archivedSessions = prevSessions.filter(
                                (s: Session) => s.is_archived,
                            );
                            return [
                                ...data.active.map((s: Session) => ({
                                    ...s,
                                    is_archived: false,
                                })),
                                ...archivedSessions,
                            ].sort((a: Session, b: Session) => {
                                const countDiff = (b.transcript_count || 0) -
                                    (a.transcript_count || 0);
                                if (countDiff !== 0) return countDiff;
                                return new Date(b.created_at).getTime() -
                                    new Date(a.created_at).getTime();
                            });
                        });
                    }
                } catch (err) {
                    console.error(
                        "Failed to parse SSE message:",
                        err,
                        event.data,
                    );
                }
            };
        };

        // Initial data fetch
        fetchInitialSessions();

        // Setup SSE connection
        connectEventSource();

        return () => {
            if (eventSource) {
                eventSource.close();
            }
        };
    }, [setSessions, fetchInitialSessions]);

    return { isLoading, isArchiveLoading };
}
