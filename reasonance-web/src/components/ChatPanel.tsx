import { useEffect, useRef, useState } from "react";
import { Anchor, Transcript } from "../types";
import { API_CONFIG } from "../config";

interface ChatPanelHandlers {
    onStartRecording: () => Promise<void>;
    onStopRecording: () => Promise<void>;
    onSendMessage: (message: string) => Promise<void>;
    onAudioFileSelected: (file: File) => Promise<void>;
    onError: (error: string | null) => void;
}

interface ChatPanelProps extends ChatPanelHandlers {
    transcripts: Transcript[];
    isRecording: boolean;
    error: string | null;
    isUploading?: boolean;
    userName: string;
    sessionId: string;
    setTranscripts: React.Dispatch<React.SetStateAction<Transcript[]>>;
    isArchived?: boolean;
}

interface AudioUploadResponse {
    status: string;
    turn_id: number;
}

export function ChatPanel({
    transcripts,
    isRecording,
    error,
    onStartRecording,
    onStopRecording,
    onSendMessage,
    onAudioFileSelected,
    isUploading,
    onError,
    userName,
    sessionId,
    setTranscripts,
    isArchived,
}: ChatPanelProps) {
    const [message, setMessage] = useState("");
    const [isDragging, setIsDragging] = useState(false);
    const audioChunks = useRef<Blob[]>([]);
    const mediaRecorder = useRef<MediaRecorder | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const handleSend = async () => {
        if (message.trim()) {
            const trimmedMessage = message.trim();
            setMessage("");

            try {
                await onSendMessage(trimmedMessage);
            } catch (error) {
                onError("Failed to send message");
                setMessage(trimmedMessage);
            }
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        const files = Array.from(e.dataTransfer.files);
        const audioFile = files.find((file) => file.type.startsWith("audio/"));

        if (audioFile) {
            onAudioFileSelected(audioFile);
        } else {
            onError("Please drop an audio file (mp3, wav, etc.)");
            setTimeout(() => onError(null), 3000);
        }
    };

    const handleStartRecording = async () => {
        try {
            await onStartRecording();
        } catch (error) {
            console.error("Error starting recording:", error);
            onError("Failed to start recording");
        }
    };

    const handleStopRecording = () => {
        onStopRecording();
    };

    const scrollToBottom = () => {
        if (messagesEndRef.current) {
            // Use requestAnimationFrame to ensure DOM updates are complete
            requestAnimationFrame(() => {
                messagesEndRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "end",
                });
            });
        }
    };

    useEffect(() => {
        scrollToBottom();

        // Add resize observer to handle dynamic content changes
        const resizeObserver = new ResizeObserver(() => {
            scrollToBottom();
        });

        if (messagesEndRef.current) {
            resizeObserver.observe(messagesEndRef.current);
        }

        return () => {
            resizeObserver.disconnect();
        };
    }, [transcripts]);

    const getCaretRangeFromPoint = (x: number, y: number): Range | null => {
        // Chrome/Safari
        if (document.caretRangeFromPoint) {
            return document.caretRangeFromPoint(x, y);
        }
        // Firefox
        const firefoxDocument = document as any; // Type assertion for Firefox-specific method
        if (firefoxDocument.caretPositionFromPoint) {
            const position = firefoxDocument.caretPositionFromPoint(x, y);
            if (position) {
                const range = document.createRange();
                range.setStart(position.offsetNode, position.offset);
                range.setEnd(position.offsetNode, position.offset);
                return range;
            }
        }
        return null;
    };

    const handleTextClick = async (e: React.MouseEvent, turnId: number) => {
        if (isArchived) return;

        e.preventDefault();

        const range = getCaretRangeFromPoint(e.clientX, e.clientY);
        if (!range || !range.startContainer) return;

        // Get the clicked word
        const textNode = range.startContainer;
        if (textNode.nodeType !== Node.TEXT_NODE) return;

        const text = textNode.textContent || "";
        const clickPosition = range.startOffset;

        // Find word boundaries using a more precise method
        let wordStart = clickPosition;
        let wordEnd = clickPosition;

        // Find start of word
        while (wordStart > 0 && /\w/.test(text[wordStart - 1])) {
            wordStart--;
        }

        // Find end of word
        while (wordEnd < text.length && /\w/.test(text[wordEnd])) {
            wordEnd++;
        }

        const clickedWord = text.slice(wordStart, wordEnd);
        if (!clickedWord || !/\w+/.test(clickedWord)) return;

        // Create the anchor with the correct type
        const newAnchor: Anchor = {
            position: wordStart,
            length: wordEnd - wordStart,
            word: clickedWord,
            turnId,
            userId: userName,
            timestamp: new Date().toISOString(),
        };

        try {
            const response = await fetch(
                `${API_CONFIG.BASE_URL}/session/${sessionId}/anchors`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(newAnchor),
                },
            );

            if (!response.ok) throw new Error("Failed to save anchor");

            // Update the transcript with the new anchor
            setTranscripts((prev: Transcript[]) =>
                prev.map((t) => {
                    if (t.turn_id === turnId) {
                        // Check if an anchor already exists at this position
                        const anchorExists = (t.anchors || []).some(
                            (a) =>
                                a.position === wordStart &&
                                a.userId === userName,
                        );

                        if (anchorExists) return t;

                        return {
                            ...t,
                            anchors: [...(t.anchors || []), newAnchor],
                        };
                    }
                    return t;
                })
            );
        } catch (error) {
            console.error("Error saving anchor:", error);
            onError("Failed to save anchor point");
            setTimeout(() => onError(null), 3000);
        }
    };

    const handleAnchorClick = async (anchor: Anchor) => {
        try {
            // Add removing class for animation
            const anchorElement = document.querySelector(
                `[data-turn-id="${anchor.turnId}"][data-position="${anchor.position}"]`,
            );
            if (anchorElement) {
                anchorElement.classList.add("removing");
                // Wait for animation
                await new Promise((resolve) => setTimeout(resolve, 300));
            }

            const response = await fetch(
                `${API_CONFIG.BASE_URL}/session/${sessionId}/anchors/${anchor.turnId}/${anchor.position}`,
                {
                    method: "DELETE",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ userId: userName }),
                },
            );

            if (!response.ok) throw new Error("Failed to remove anchor");

            // Update transcripts by removing the anchor
            setTranscripts((prev: Transcript[]) =>
                prev.map((t) =>
                    t.turn_id === anchor.turnId
                        ? {
                            ...t,
                            anchors: (t.anchors || []).filter((a) =>
                                !(a.position === anchor.position &&
                                    a.userId === anchor.userId)
                            ),
                        }
                        : t
                )
            );
        } catch (error) {
            console.error("Error removing anchor:", error);
            onError("Failed to remove anchor point");
            setTimeout(() => onError(null), 3000);
        }
    };

    const renderTranscriptWithAnchors = (transcript: Transcript) => {
        const text = transcript.transcript;
        const transcriptAnchors = transcript.anchors || [];

        if (transcriptAnchors.length === 0) {
            return <span key={`text-${transcript.turn_id}-full`}>{text}</span>;
        }

        // Sort anchors by position
        const sortedAnchors = [...transcriptAnchors].sort((a, b) => {
            // First sort by position
            if (a.position !== b.position) {
                return a.position - b.position;
            }
            // If positions are equal, sort by length (longer anchors first)
            if (a.length !== b.length) {
                return b.length - a.length;
            }
            // If lengths are equal, sort by timestamp (newer first)
            return new Date(b.timestamp).getTime() -
                new Date(a.timestamp).getTime();
        });

        // Remove overlapping anchors
        const filteredAnchors = sortedAnchors.filter((anchor, index) => {
            // Check if this anchor overlaps with any previous anchors
            for (let i = 0; i < index; i++) {
                const prevAnchor = sortedAnchors[i];
                const overlap = anchor.position <
                        (prevAnchor.position + prevAnchor.length) &&
                    (anchor.position + anchor.length) > prevAnchor.position;
                if (overlap) return false;
            }
            return true;
        });

        const result: JSX.Element[] = [];
        let lastIndex = 0;

        filteredAnchors.forEach((anchor, idx) => {
            // Add text before anchor
            if (anchor.position > lastIndex) {
                result.push(
                    <span key={`text-${transcript.turn_id}-${idx}-pre`}>
                        {text.slice(lastIndex, anchor.position)}
                    </span>,
                );
            }

            // Add anchored word
            result.push(
                <span
                    key={`anchor-${transcript.turn_id}-${idx}`}
                    className="anchor-point"
                    data-position={anchor.position}
                    data-length={anchor.length}
                    data-turn-id={transcript.turn_id}
                    data-creator={anchor.userId === userName}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (anchor.userId === userName) {
                            handleAnchorClick(anchor);
                        }
                    }}
                >
                    <span className="anchor-highlight" />
                    <span className="anchor-tooltip">
                        Marked by {anchor.userId}
                        <br />
                        {new Date(anchor.timestamp).toLocaleTimeString()}
                        {anchor.userId === userName && (
                            <>
                                <br />
                                <small>(Click to remove)</small>
                            </>
                        )}
                    </span>
                    {text.slice(
                        anchor.position,
                        anchor.position + anchor.length,
                    )}
                </span>,
            );

            lastIndex = anchor.position + anchor.length;
        });

        // Add remaining text
        if (lastIndex < text.length) {
            result.push(
                <span key={`text-${transcript.turn_id}-final`}>
                    {text.slice(lastIndex)}
                </span>,
            );
        }

        return <>{result}</>;
    };

    return (
        <div className="chat-panel" data-archived={isArchived}>
            <div className="chat-messages">
                {transcripts.slice().reverse().map((transcript) => (
                    <div
                        key={`transcript-${transcript.turn_id}-${transcript.timestamp}`}
                        className="message-wrapper"
                    >
                        <div
                            className={`transcript-content ${
                                transcript.speaker === userName
                                    ? "self"
                                    : "other"
                            }`}
                        >
                            <div className="message-header">
                                <span className="speaker-label">
                                    {transcript.speaker}
                                </span>
                                <span className="timestamp">
                                    {new Date(transcript.timestamp)
                                        .toLocaleTimeString()}
                                </span>
                            </div>
                            <div
                                className="transcript-text"
                                onClick={(e) =>
                                    handleTextClick(e, transcript.turn_id)}
                            >
                                {renderTranscriptWithAnchors(transcript)}
                            </div>
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>
            {!isArchived
                ? (
                    <div
                        className={`chat-controls ${
                            isDragging ? "dragging" : ""
                        }`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                    >
                        <div className="message-input-container">
                            <textarea
                                className="message-input"
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                onKeyPress={handleKeyPress}
                                placeholder="Type a message..."
                                rows={1}
                            />
                            <div className="button-group">
                                <button
                                    className={`record-button ${
                                        isRecording ? "recording" : ""
                                    }`}
                                    onClick={isRecording
                                        ? handleStopRecording
                                        : handleStartRecording}
                                >
                                    {isRecording ? "⏹" : "🎤"}
                                </button>
                                <button
                                    className="send-button"
                                    onClick={handleSend}
                                    disabled={(!message.trim() &&
                                        !isRecording) ||
                                        isUploading}
                                >
                                    {isUploading ? "Uploading..." : "Send"}
                                </button>
                            </div>
                        </div>
                        {error && <div className="error-message">{error}</div>}
                    </div>
                )
                : (
                    <div className="archived-message">
                        This is an archived session. Messages cannot be added.
                    </div>
                )}
        </div>
    );
}
