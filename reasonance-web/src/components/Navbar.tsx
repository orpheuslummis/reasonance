interface NavbarProps {
    userName: string;
    sessionId: string | null;
    onBackToSessions: () => void;
    participants: string[];
}

export function Navbar({
    userName,
    sessionId,
    onBackToSessions,
    participants,
}: NavbarProps) {
    return (
        <nav className="navbar">
            <div className="navbar-brand">
                <svg
                    className="brand-logo"
                    width="32"
                    height="32"
                    viewBox="0 0 32 32"
                >
                    <g className="waves">
                        <path
                            className="wave wave-1"
                            d="M4 16 C 8 8, 12 8, 16 16 C 20 24, 24 24, 28 16"
                            fill="none"
                            strokeWidth="2"
                        />
                        <path
                            className="wave wave-2"
                            d="M4 16 C 8 12, 12 12, 16 16 C 20 20, 24 20, 28 16"
                            fill="none"
                            strokeWidth="2"
                        />
                        <path
                            className="wave wave-3"
                            d="M4 16 C 8 14, 12 14, 16 16 C 20 18, 24 18, 28 16"
                            fill="none"
                            strokeWidth="2"
                        />
                    </g>
                </svg>
                <h1 onClick={onBackToSessions}>
                    Reasonance
                </h1>
                {sessionId && (
                    <span className="session-title">
                        Session {sessionId.split("-")[0]}
                        {participants &&
                            ` (${participants.length} participants)`}
                    </span>
                )}
            </div>
            <div className="navbar-content">
                {userName && (
                    <span className="username">
                        {userName}
                    </span>
                )}
                {sessionId && (
                    <button
                        className="nav-button"
                        onClick={onBackToSessions}
                    >
                        Leave Session
                    </button>
                )}
            </div>
        </nav>
    );
}
