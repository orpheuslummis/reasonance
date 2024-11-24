export interface Anchor {
    position: number;
    length: number;
    word: string;
    turnId: number;
    userId: string;
    timestamp: string;
}

export interface Transcript {
    turn_id: number;
    speaker: string;
    transcript: string;
    timestamp: string;
    anchors?: Anchor[];
}

export interface Artifact {
    id: string;
    type: string;
    content: any;
    timestamp: string;
}

export interface Timeline {
    transcripts: Transcript[];
    artifacts: Artifact[];
    metadata: {
        created_at: string;
        participants: string[];
        session_id: string;
        is_archived?: boolean;
    };
}

export interface Session {
    session_id: string;
    participant_count: number;
    created_at: string;
    is_archived?: boolean;
    transcript_count: number;
}

export enum ArgumentType {
    CLAIM = "claim",
    SUPPORT = "support",
    COUNTER = "counter",
    RESPONSE = "response",
}

export interface Position {
    x: number;
    y: number;
}

export interface ArgumentNode {
    id: string;
    turn_id: number;
    type: ArgumentType;
    summary: string;
    speaker: string;
    timestamp: string;
    topic?: string;
    position?: Position;
}

export interface ArgumentEdge {
    source: string;
    target: string;
    type: ArgumentType;
    timestamp: string;
}

export interface ArgumentGraph {
    nodes: Record<string, ArgumentNode>;
    edges: ArgumentEdge[];
}

export interface GraphNode extends d3.SimulationNodeDatum {
    id: string;
    turn_id: number;
    type: ArgumentType;
    summary: string;
    timestamp: string;
    position?: {
        x: number;
        y: number;
    };
}

export interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
    source: GraphNode;
    target: GraphNode;
    type: ArgumentType;
    timestamp?: string;
}
