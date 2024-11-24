import { useCallback, useEffect, useState } from "react";
import { API_CONFIG } from "./config";
import { Session, Transcript } from "./types";
import { useAudioRecorder } from "./hooks/useAudioRecorder";
import { useHomePageEvents, useSessionEvents } from "./hooks/useSessionEvents";
import { useSessionManagement } from "./hooks/useSessionManagement";
import { useErrorHandler } from "./hooks/useErrorHandler";
import { Navbar } from "./components/Navbar";
import { ChatPanel } from "./components/ChatPanel";
import { ArgumentGraph as ArgumentGraphComponent } from "./components/ArgumentGraph";
import { ArgumentEdge, ArgumentNode } from "./types";
import "./App.css";

const useTheme = () => {
  // Remove the manual theme toggle and localStorage
  const [theme, setTheme] = useState(() => {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = (e: MediaQueryListEvent) => {
      setTheme(e.matches ? "dark" : "light");
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return { theme }; // Remove toggleTheme since we're following system
};

function useArgumentGraph(sessionId: string | null) {
  const [graph, setGraph] = useState<{
    nodes: Record<string, ArgumentNode>;
    edges: ArgumentEdge[];
  }>({ nodes: {}, edges: [] });
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>();

  useEffect(() => {
    console.log("Argument graph updated:", graph);
  }, [graph]);

  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
  }, []);

  return {
    graph,
    setGraph,
    selectedNodeId,
    handleNodeClick,
  };
}

function App() {
  // User state
  const [userName, setUserName] = useState(() =>
    localStorage.getItem(API_CONFIG.USERNAME_KEY) || ""
  );
  const [isNameSubmitted, setIsNameSubmitted] = useState(() =>
    Boolean(localStorage.getItem(API_CONFIG.USERNAME_KEY))
  );

  // Session state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<string[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);

  // UI state
  const [chatError, setChatError] = useState<string | null>(null);

  // Custom hooks
  const { isRecording, error: recordingError, startRecording, stopRecording } =
    useAudioRecorder(sessionId, userName);

  const { handleError } = useErrorHandler();
  const {
    graph: argumentGraph,
    setGraph: setArgumentGraph,
    selectedNodeId,
    handleNodeClick,
  } = useArgumentGraph(sessionId);

  const updateSessionMessageCount = useCallback(
    (sessionId: string, count: number) => {
      setSessions((prevSessions) =>
        prevSessions.map((session) =>
          session.session_id === sessionId
            ? { ...session, transcript_count: count }
            : session
        )
      );
    },
    [],
  );

  // Session updates handler
  const { error: sessionError } = useSessionEvents(
    sessionId,
    {
      onParticipantUpdate: setParticipants,
      onTranscriptUpdate: useCallback((transcript: Transcript) => {
        setTranscripts((prev) => {
          const exists = prev.some((t) => t.turn_id === transcript.turn_id);
          if (exists) {
            return prev.map((t) =>
              t.turn_id === transcript.turn_id ? transcript : t
            );
          }
          return [...prev, transcript].sort((a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
        });
      }, []),
      onArgumentGraphUpdate: useCallback((graphData: any) => {
        console.log("Updating argument graph:", graphData);
        const graph = graphData.graph || graphData;

        // Add edges based on node relationships
        if (graph.nodes) {
          const edges: ArgumentEdge[] = [];
          const nodeIds = Object.keys(graph.nodes);

          // For each node after the first one, create an edge to the previous node
          for (let i = 1; i < nodeIds.length; i++) {
            const currentNode = graph.nodes[nodeIds[i]];
            const previousNode = graph.nodes[nodeIds[i - 1]];

            edges.push({
              source: previousNode.id,
              target: currentNode.id,
              type: currentNode.type,
              timestamp: currentNode.timestamp,
            });
          }

          setArgumentGraph({
            nodes: graph.nodes,
            edges: edges,
          });
        } else {
          setArgumentGraph(graph);
        }
      }, []),
      onMessageCountUpdate: updateSessionMessageCount,
    },
  );

  // Make stopRecording async to match ChatPanel props
  const handleStopRecording = useCallback(async () => {
    await stopRecording();
  }, [stopRecording]);

  const { isLoading: homePageLoading, isArchiveLoading } = useHomePageEvents(
    setSessions,
  );

  const { createSession, joinSession, leaveSession, backToSessions } =
    useSessionManagement({
      userName,
      sessionId,
      setSessionId,
      setTranscripts,
      setParticipants,
      onMessageCountUpdate: updateSessionMessageCount,
    });

  useTheme();

  // Add viewArchived function
  const viewArchived = useCallback(async (archivedSessionId: string) => {
    try {
      const response = await fetch(
        `${API_CONFIG.BASE_URL}/session-timeline/${archivedSessionId}`,
      );

      if (!response.ok) {
        throw new Error("Failed to fetch archived session");
      }

      const data = await response.json();
      setSessionId(archivedSessionId);
      setTranscripts(data.transcripts);
      setParticipants(data.metadata.participants);
    } catch (error) {
      handleError(error, "Error viewing archived session");
    }
  }, [setSessionId, setTranscripts, setParticipants, handleError]);

  // Event handlers
  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (userName.trim()) {
      localStorage.setItem(API_CONFIG.USERNAME_KEY, userName);
      setIsNameSubmitted(true);
    }
  };

  const handleSendMessage = async (message: string) => {
    try {
      const response = await fetch(
        `${API_CONFIG.BASE_URL}/send-message/${sessionId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            speaker: userName,
            message: message,
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Failed to send message: ${errorData}`);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      handleError(error, "Failed to send message");
    }
  };

  const handleAudioFileSelected = async (file: File) => {
    if (!sessionId || !userName) return;

    // Add size limit check (e.g., 10MB)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_FILE_SIZE) {
      console.error("File too large");
      return;
    }

    try {
      const formData = new FormData();
      formData.append("audio", file);
      formData.append("speaker", userName);

      const response = await fetch(
        `${API_CONFIG.BASE_URL}/upload-audio/${sessionId}`,
        {
          method: "POST",
          body: formData,
        },
      );

      if (!response.ok) {
        throw new Error("Failed to upload audio file");
      }
    } catch (error: unknown) {
      console.error("Error uploading audio file:", error);
      handleError(error, "Failed to upload audio file");
    }
  };

  // Cleanup on unmount or session change
  useEffect(() => {
    return () => {
      if (sessionId) {
        leaveSession(sessionId).catch((error: Error) =>
          console.error("Failed to leave session:", error)
        );
      }
    };
  }, [sessionId, leaveSession]);

  // Add this to find the current session
  const currentSession = sessionId
    ? sessions.find((s) => s.session_id === sessionId)
    : null;

  // Name entry screen
  if (!isNameSubmitted) {
    return (
      <div className="app">
        <Navbar
          userName=""
          sessionId={null}
          onBackToSessions={backToSessions}
          participants={[]}
        />
        <div className="name-entry">
          <form onSubmit={handleNameSubmit} className="name-form">
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Enter your name"
              required
            />
            <button type="submit">Continue</button>
          </form>
        </div>
      </div>
    );
  }

  // Session selection screen
  if (!sessionId) {
    return (
      <div className="app">
        <Navbar
          userName={userName}
          sessionId={null}
          onBackToSessions={backToSessions}
          participants={[]}
        />
        <div className="session-selection">
          {/* Active Sessions Section */}
          <div className="session-section">
            <div className="session-header">
              <h2>Active Sessions</h2>
              <button className="create-session-btn" onClick={createSession}>
                Create New Session
              </button>
            </div>
            {homePageLoading
              ? (
                <div className="loading-container">
                  <div>
                    <div className="loading-spinner" />
                    <div className="loading-text">
                      Loading active sessions...
                    </div>
                  </div>
                </div>
              )
              : (
                <div className="session-grid">
                  {sessions
                    .filter((session) => !session.is_archived)
                    .sort((a, b) => {
                      if (b.transcript_count !== a.transcript_count) {
                        return b.transcript_count - a.transcript_count;
                      }
                      return new Date(b.created_at).getTime() -
                        new Date(a.created_at).getTime();
                    })
                    .map((session) => (
                      <div
                        key={session.session_id}
                        className="session-card active"
                      >
                        <div className="session-info">
                          <h3>Session {session.session_id.substring(0, 8)}</h3>
                          <div className="session-stats">
                            <span>
                              {session.participant_count} participants
                            </span>
                            <span>{session.transcript_count} messages</span>
                          </div>
                        </div>
                        <button
                          onClick={() => joinSession(session.session_id)}
                        >
                          Join Session
                        </button>
                      </div>
                    ))}
                </div>
              )}
          </div>

          {/* Archived Sessions Section */}
          <div className="session-section">
            <div className="session-header">
              <h2>Archived Sessions</h2>
            </div>
            {isArchiveLoading
              ? (
                <div className="loading-container">
                  <div>
                    <div className="loading-spinner" />
                    <div className="loading-text">
                      Loading archived sessions...
                    </div>
                  </div>
                </div>
              )
              : (
                <div className="session-grid">
                  {sessions
                    .filter((session) =>
                      session.is_archived && session.transcript_count > 0
                    )
                    .sort((a, b) => {
                      if (b.transcript_count !== a.transcript_count) {
                        return b.transcript_count - a.transcript_count;
                      }
                      return new Date(b.created_at).getTime() -
                        new Date(a.created_at).getTime();
                    })
                    .map((session) => (
                      <div
                        key={session.session_id}
                        className="session-card archived"
                      >
                        <div className="session-info">
                          <h3>Session {session.session_id.substring(0, 8)}</h3>
                          <div className="session-stats">
                            <span>
                              {session.participant_count} participants
                            </span>
                            <span>{session.transcript_count} messages</span>
                          </div>
                          <span className="session-date">
                            {new Date(session.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <button
                          onClick={() => viewArchived(session.session_id)}
                        >
                          View Archive
                        </button>
                      </div>
                    ))}
                </div>
              )}
          </div>
        </div>
      </div>
    );
  }

  // Active session screen
  return (
    <div className="app">
      <Navbar
        userName={userName}
        sessionId={sessionId}
        onBackToSessions={backToSessions}
        participants={participants}
      />
      <div className="content-container">
        <div className="shared-view">
          <ArgumentGraphComponent
            nodes={argumentGraph.nodes}
            edges={argumentGraph.edges}
            onNodeClick={handleNodeClick}
            selectedNodeId={selectedNodeId}
            width={800}
            height={600}
          />
        </div>
        <ChatPanel
          transcripts={transcripts}
          isRecording={isRecording}
          error={recordingError || sessionError || chatError}
          onError={setChatError}
          onStartRecording={startRecording}
          onStopRecording={handleStopRecording}
          onSendMessage={handleSendMessage}
          onAudioFileSelected={handleAudioFileSelected}
          userName={userName}
          sessionId={sessionId || ""}
          setTranscripts={setTranscripts}
          isArchived={currentSession?.is_archived}
        />
      </div>
    </div>
  );
}

export default App;
