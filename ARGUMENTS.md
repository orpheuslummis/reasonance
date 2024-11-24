# Argumentation Graph System Specification

## 1. Data Structures

### Core Types

```typescript
enum ArgumentType {
    CLAIM = "claim",
    SUPPORT = "support",
    COUNTER = "counter",
    RESPONSE = "response",
}

interface ArgumentNode {
    turn_id: number;
    type: ArgumentType;
    summary: string;
    timestamp: string;
    topic?: string;
    position?: {
        x: number;
        y: number;
    };
}

interface ArgumentEdge {
    source_id: number;
    target_id: number;
    type: ArgumentType;
    timestamp: string;
}

interface ArgumentGraph {
    nodes: Record<string, ArgumentNode>;
    edges: ArgumentEdge[];
}
```

### D3 Integration Types

```typescript
interface GraphNode extends d3.SimulationNodeDatum {
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

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
    source: string;
    target: string;
    type: ArgumentType;
    timestamp?: string;
}
```

## 2. Claude Integration

### Analysis Prompt

```typescript
const CLAUDE_PROMPT = `
Analyze this message in an ongoing group discussion about [TOPIC].
Your task is to identify how this message relates to the argument structure.

Message: [MESSAGE]

Recent context:
[CONTEXT]

Return a JSON object with:
1. type: The message type (one of: claim, support, counter, response)
   - claim: A new main point or position
   - support: Evidence or reasoning that supports another point
   - counter: An objection or counter-argument
   - response: A direct reply to another point
2. targets: Array of message IDs this message responds to
3. summary: One-line summary of the main point (max 100 chars)

Example response:
{
  "type": "counter",
  "targets": ["msg_123"],
  "summary": "Shrimp's simple nervous systems mean they can't meaningfully suffer"
}

Important rules:
- Each message must be linked to at least one previous message unless it's a new claim
- Type must be one of the four specified types
- Summary should be concise and capture the key argument
`;
```

## 3. Web Implementation

### Backend API (Node.js/Express example)

```typescript
interface AnalysisResult {
    type: ArgumentNode["type"];
    targets: string[];
    summary: string;
}

async function analyzeMessage(
    message: Message,
    context: Message[],
): Promise<AnalysisResult> {
    const prompt = CLAUDE_PROMPT
        .replace("[MESSAGE]", message.text)
        .replace("[CONTEXT]", JSON.stringify(context))
        .replace("[TOPIC]", getCurrentTopic());

    const response = await claude.complete({
        prompt,
        max_tokens: 150,
        temperature: 0,
    });

    return JSON.parse(response);
}

async function buildArgumentGraph(
    messages: Message[],
): Promise<ArgumentGraph> {
    const graph: ArgumentGraph = {
        nodes: new Map(),
        edges: [],
    };

    for (const msg of messages) {
        const context = getRecentMessages(graph, 3);
        const analysis = await analyzeMessage(msg, context);

        // Add node
        graph.nodes.set(msg.id, {
            id: msg.id,
            type: analysis.type,
            content: msg.text,
            summary: analysis.summary,
            author: msg.author,
            timestamp: msg.timestamp,
        });

        // Add edges
        for (const targetId of analysis.targets) {
            graph.edges.push({
                source: msg.id,
                target: targetId,
                type: analysis.type,
            });
        }
    }

    return graph;
}
```

## 4. Frontend Visualization (React)

Key components:

1. Graph container
2. Individual argument nodes
3. Edge visualization
4. Collapsible threads

```typescript
// Main component
const ArgumentGraph: React.FC<{ messages: Message[] }> = ({ messages }) => {
    const [graph, setGraph] = useState<ArgumentGraph | null>(null);

    useEffect(() => {
        const processMessages = async () => {
            const result = await buildArgumentGraph(messages);
            setGraph(result);
        };
        processMessages();
    }, [messages]);

    return (
        <div className="p-6 max-w-4xl mx-auto">
            {graph && <ArgumentTree graph={graph} />}
        </div>
    );
};

// Recursive tree component
const ArgumentTree: React.FC<{
    node: ArgumentNode;
    graph: ArgumentGraph;
}> = ({ node, graph }) => {
    const childEdges = graph.edges.filter((e) => e.target === node.id);

    return (
        <div className="argument-thread">
            <ArgumentNode node={node} />
            {childEdges.length > 0 && (
                <div className="ml-8 border-l-2">
                    {childEdges.map((edge) => (
                        <ArgumentTree
                            key={edge.source}
                            node={graph.nodes.get(edge.source)!}
                            graph={graph}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
```

## 5. Visual Design

Colors for argument types:

- Claim: Green (#4CAF50)
- Support: Blue (#2196F3)
- Counter: Red (#F44336)
- Response: Purple (#9C27B0)

Node Styling:

- Circle radius: 25px
- Drop shadow: 0 2px 3px rgba(0,0,0,0.2)
- Selected state: 3px black border
- Type indicator: First letter, uppercase, white, bold, 14px

Edge Styling:

- Line width: 2px
- Counter arguments: Dashed line (5,5)
- Arrow markers at end
- Hover effect: Increased width and brightness

Layout:

- Threaded view with indentation
- Clear visual hierarchy
- Collapsible threads
- Compact but readable text
- Author and timestamp visible
- Type indicator badge

## 6. Usage Example

```typescript
// Example conversation
const messages = [
    {
        id: "msg1",
        author: "Alice",
        text:
            "We should donate to help farmed shrimp because they are produced in massive numbers - over 4.5 million tonnes annually.",
        timestamp: Date.now(),
    },
    {
        id: "msg2",
        author: "Bob",
        text:
            "The massive scale doesn't matter if shrimp can't meaningfully suffer due to their simple nervous systems.",
        timestamp: Date.now(),
    },
];

// Display graph
<ArgumentGraph messages={messages} />;
```

## 7. Future Extensions

Possible enhancements:

1. Real-time updates via WebSocket
2. Export/import of argument graphs
3. Interactive editing/annotation
4. Search and filtering
5. Multiple visualization modes
6. Argument strength indicators
7. Topic clustering

## 8. Real-time Updates

### Event Types

```typescript
enum ArgumentEventType {
    NODE_POSITION = "node_position",
    GRAPH_UPDATE = "graph_update",
    NODE_SELECT = "node_select",
}

interface ArgumentEvent {
    type: ArgumentEventType;
    data: {
        nodeId?: string;
        position?: { x: number; y: number };
        graph?: ArgumentGraph;
    };
}
```

### Server-Sent Events (SSE)

- Event stream endpoint: `/events`
- Keep-alive interval: 30 seconds
- Event types:
  - `argument_update`: Full graph updates
  - `node_position`: Individual node position updates

## 9. Force Layout Parameters

```typescript
const forceConfig = {
    link: {
        distance: {
            support: 80,
            default: 120,
        },
    },
    charge: {
        strength: -300,
        maxDistance: 350,
    },
    collision: {
        radius: 60,
    },
    center: {
        strength: 0.1,
    },
};
```
