import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { ArgumentEdge, ArgumentNode, ArgumentType, Position } from "../types";

interface GraphNode extends d3.SimulationNodeDatum {
    id: string;
    turn_id: number;
    type: ArgumentType;
    summary: string;
    timestamp: string;
    speaker: string;
    position?: Position;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
    source: GraphNode;
    target: GraphNode;
    type: ArgumentType;
    timestamp?: string;
}

interface ArgumentGraphProps {
    nodes: Record<string, ArgumentNode | undefined>;
    edges: ArgumentEdge[];
    onNodeClick?: (nodeId: string) => void;
    selectedNodeId?: string;
    width?: number;
    height?: number;
    onLayoutChange?: (nodeId: string, x: number, y: number) => void;
    onSelectionAnalysis?: (nodes: GraphNode[], edges: GraphLink[]) => void;
}

const COLOR_MAP: Record<ArgumentType, string> = {
    [ArgumentType.CLAIM]: "#4CAF50",
    [ArgumentType.SUPPORT]: "#2196F3",
    [ArgumentType.COUNTER]: "#F44336",
    [ArgumentType.RESPONSE]: "#9C27B0",
};

// Add drag function definition at the top
const drag = (
    simulation: d3.Simulation<GraphNode, undefined>,
    onLayoutChange?: (nodeId: string, x: number, y: number) => void,
) => {
    return d3.drag<SVGGElement, GraphNode>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended);

    function dragstarted(
        event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>,
    ) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
    }

    function dragged(event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>) {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
    }

    function dragended(
        event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>,
    ) {
        if (!event.active) simulation.alphaTarget(0);
        if (onLayoutChange) {
            onLayoutChange(
                event.subject.id,
                Math.round(event.x),
                Math.round(event.y),
            );
        }
        event.subject.fx = event.x;
        event.subject.fy = event.y;
    }
};

export function ArgumentGraph({
    nodes,
    edges,
    onNodeClick,
    selectedNodeId,
    width = 1200,
    height = 800,
    onLayoutChange,
    onSelectionAnalysis,
}: ArgumentGraphProps) {
    const svgRef = useRef<SVGSVGElement>(null);
    const [transform, setTransform] = useState<d3.ZoomTransform>(
        d3.zoomIdentity,
    );
    const [selectedElements, setSelectedElements] = useState<{
        nodes: Set<string>;
        edges: Set<string>;
    }>({
        nodes: new Set(),
        edges: new Set(),
    });

    // Keep only one declaration of simulationDataRef at component level
    const simulationDataRef = useRef<{
        nodes: GraphNode[];
        links: GraphLink[];
    }>({ nodes: [], links: [] });

    useEffect(() => {
        console.log("ArgumentGraph received update:", { nodes, edges });
    }, [nodes, edges]);

    useEffect(() => {
        if (!svgRef.current) return;

        // Clear previous graph
        d3.select(svgRef.current).selectAll("*").remove();

        // Create SVG container with viewBox for responsiveness
        const svg = d3.select(svgRef.current)
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("preserveAspectRatio", "xMidYMid meet");

        // Create container group for zoom/pan
        const g = svg.append("g").attr("class", "graph-container");

        // Prepare data with enhanced validation
        const graphNodes: GraphNode[] = Object.entries(nodes || {}).map(
            ([id, node]) => {
                if (!node) {
                    console.warn(`Invalid node data for id ${id}:`, node);
                    return {
                        id,
                        turn_id: parseInt(id),
                        type: ArgumentType.CLAIM,
                        summary: "Unknown",
                        timestamp: new Date().toISOString(),
                        speaker: "Unknown",
                        x: width / 2,
                        y: height / 2,
                    };
                }

                return {
                    id,
                    turn_id: node.turn_id,
                    type: node.type,
                    summary: node.summary || "Unknown",
                    timestamp: node.timestamp || new Date().toISOString(),
                    speaker: node.speaker || "Unknown",
                    x: node.position?.x ?? width / 2,
                    y: node.position?.y ?? height / 2,
                    ...(node.position && {
                        fx: node.position.x,
                        fy: node.position.y,
                    }),
                };
            },
        );

        console.log("Processed nodes:", graphNodes);

        const graphLinks = (edges || []).map(
            (edge: ArgumentEdge): GraphLink | null => {
                const sourceNode = graphNodes.find((n) => n.id === edge.source);
                const targetNode = graphNodes.find((n) => n.id === edge.target);

                if (!sourceNode || !targetNode) {
                    console.warn("Edge missing nodes", {
                        edge,
                        sourceId: edge.source,
                        targetId: edge.target,
                        sourceFound: !!sourceNode,
                        targetFound: !!targetNode,
                        availableNodes: graphNodes.map((n) => ({
                            id: n.id,
                            type: n.type,
                        })),
                    });
                    return null;
                }

                return {
                    source: sourceNode,
                    target: targetNode,
                    type: edge.type,
                    timestamp: edge.timestamp,
                };
            },
        ).filter((link): link is GraphLink => link !== null);

        // Add debug logging to track the full transformation
        console.log("Edge processing:", {
            inputEdges: edges,
            processedLinks: graphLinks,
            availableNodes: graphNodes.map((n) => ({ id: n.id, type: n.type })),
            graphNodesMap: Object.fromEntries(
                graphNodes.map((n) => [n.id, n.type]),
            ),
        });

        // Use the processed data directly in the simulation
        const simulationData = {
            nodes: graphNodes,
            links: graphLinks,
        };

        // Enhanced force simulation with correct typing
        const simulation = d3.forceSimulation<GraphNode>(simulationData.nodes)
            .force(
                "link",
                d3.forceLink<GraphNode, GraphLink>(simulationData.links)
                    .id((d) => d.id)
                    .distance(80),
            )
            .force(
                "charge",
                d3.forceManyBody()
                    .strength(-100),
            )
            .force(
                "center",
                d3.forceCenter(width / 2, height / 2),
            )
            .force(
                "collision",
                d3.forceCollide()
                    .radius(30),
            );

        // Add debug logging for simulation data
        console.log("Simulation data:", {
            nodes: simulationData.nodes.map((n) => ({
                id: n.id,
                x: n.x,
                y: n.y,
                fx: n.fx,
                fy: n.fy,
            })),
            links: simulationData.links.map((l) => ({
                source: l.source,
                target: l.target,
                type: l.type,
            })),
        });

        // Create arrow markers with improved styling
        const defs = svg.append("defs");
        Object.entries(COLOR_MAP).forEach(([type, color]) => {
            defs.append("marker")
                .attr("id", `arrow-${type}`)
                .attr("viewBox", "0 -5 10 10")
                .attr("refX", 20)
                .attr("refY", 0)
                .attr("markerWidth", 6)
                .attr("markerHeight", 6)
                .attr("orient", "auto")
                .append("path")
                .attr("d", "M0,-5L10,0L0,5")
                .attr("fill", color);
        });

        // First create a group for all edges
        const linkGroup = g.append("g")
            .attr("class", "links")
            .selectAll("g")
            .data(graphLinks)
            .join("g")
            .attr(
                "class",
                (d) =>
                    `edge-group ${
                        selectedElements.edges.has(
                                `${(d.source as GraphNode).id}-${
                                    (d.target as GraphNode).id
                                }`,
                            )
                            ? "selected"
                            : ""
                    }`,
            )
            .on("click", (event: MouseEvent, d: GraphLink) => {
                event.preventDefault();
                const edgeId = `${(d.source as GraphNode).id}-${
                    (d.target as GraphNode).id
                }`;
                setSelectedElements((prev) => ({
                    ...prev,
                    edges: prev.edges.has(edgeId)
                        ? new Set([...prev.edges].filter((id) => id !== edgeId))
                        : new Set([...prev.edges, edgeId]),
                }));
            });

        // Add the visible edge line
        linkGroup.append("line")
            .attr("class", "edge-visible")
            .attr("stroke", (d) => COLOR_MAP[d.type])
            .attr("marker-end", (d) => `url(#arrow-${d.type})`);

        // Add the invisible hitbox
        linkGroup.append("line")
            .attr("class", "edge-hitbox");

        // Add the selection handle (circle in the middle)
        linkGroup.append("circle")
            .attr("class", "edge-handle")
            .attr("r", 6)
            .attr("stroke", (d) => COLOR_MAP[d.type])
            .attr("fill", "var(--bg-primary)");

        // Update the simulationDataRef
        simulationDataRef.current = {
            nodes: graphNodes,
            links: graphLinks,
        };

        // Enhanced node groups with better interaction
        const nodeGroups = g.selectAll<SVGGElement, GraphNode>("g.node")
            .data(simulationData.nodes)
            .join("g")
            .attr(
                "class",
                (d) =>
                    `node ${
                        selectedElements.nodes.has(d.id) ? "selected" : ""
                    }`,
            )
            .call(drag(simulation, onLayoutChange));

        // Add selection ring before the main circle
        nodeGroups.append("circle")
            .attr("class", "selection-ring");

        // Add a selection indicator to nodes
        nodeGroups.append("circle")
            .attr("r", 24)
            .attr("class", "selection-indicator")
            .attr("fill", "none")
            .attr("stroke-dasharray", "4,4")
            .attr("opacity", 0)
            .attr("stroke", "#ff0");

        // Update selection indicators
        nodeGroups.select(".selection-indicator")
            .attr("opacity", (d) => selectedElements.nodes.has(d.id) ? 0.8 : 0);

        // Add node circles with colors
        nodeGroups.append("circle")
            .attr("r", 20)
            .attr("fill", (d) => COLOR_MAP[d.type])
            .attr("stroke", (d) => {
                if (selectedElements.nodes.has(d.id)) return "#ff0";
                return d.id === selectedNodeId ? "#FFD700" : "#fff";
            })
            .attr(
                "stroke-width",
                (d) => selectedElements.nodes.has(d.id) ? 4 : 2,
            );

        // Add speaker label above node
        nodeGroups.append("text")
            .attr("class", "speaker-label")
            .attr("y", -25)
            .attr("text-anchor", "middle")
            .attr("fill", "#666")
            .attr("font-size", "12px")
            .text((d) => d.speaker || "Unknown");

        // Add type indicator
        nodeGroups.append("text")
            .attr("class", "type-indicator")
            .attr("y", 0)
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "middle")
            .attr("fill", "#fff")
            .attr("font-size", "12px")
            .text((d) => d.type.charAt(0).toUpperCase());

        // Add summary tooltip
        const tooltip = d3.select("body")
            .append("div")
            .attr("class", "graph-tooltip")
            .style("opacity", 0)
            .style("position", "absolute")
            .style("background", "#fff")
            .style("padding", "10px")
            .style("border-radius", "4px")
            .style("box-shadow", "0 2px 4px rgba(0,0,0,0.2)");

        nodeGroups
            .on("mouseover", (event, d) => {
                tooltip.transition()
                    .duration(200)
                    .style("opacity", .9);
                tooltip.html(`
                    <strong>${d.speaker}</strong><br/>
                    <em>Turn ${d.turn_id}: ${d.type}</em><br/>
                    ${d.summary}
                `)
                    .style("left", (event.pageX + 10) + "px")
                    .style("top", (event.pageY - 28) + "px");
            })
            .on("mouseout", () => {
                tooltip.transition()
                    .duration(500)
                    .style("opacity", 0);
            });

        // Zoom behavior
        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.1, 4])
            .on("zoom", ({ transform }) => {
                g.attr("transform", transform);
                setTransform(transform);
            });

        svg.call(zoom);

        // Update positions on simulation tick
        simulation.on("tick", () => {
            linkGroup.selectAll<SVGLineElement, GraphLink>("line")
                .attr("x1", (d) => ((d.source as GraphNode).x ?? width / 2))
                .attr("y1", (d) => ((d.source as GraphNode).y ?? height / 2))
                .attr("x2", (d) => ((d.target as GraphNode).x ?? width / 2))
                .attr("y2", (d) => ((d.target as GraphNode).y ?? height / 2));

            // Position the edge handle with proper typing
            linkGroup.selectAll<SVGCircleElement, GraphLink>(".edge-handle")
                .attr("cx", (d) => {
                    const sourceX = (d.source as GraphNode).x ?? width / 2;
                    const targetX = (d.target as GraphNode).x ?? width / 2;
                    return (sourceX + targetX) / 2;
                })
                .attr("cy", (d) => {
                    const sourceY = (d.source as GraphNode).y ?? height / 2;
                    const targetY = (d.target as GraphNode).y ?? height / 2;
                    return (sourceY + targetY) / 2;
                });

            nodeGroups.attr(
                "transform",
                (d) => `translate(${d.x ?? width / 2},${d.y ?? height / 2})`,
            );
        });

        // Add simulation warmup
        simulation.alpha(1).restart();

        // Handle real-time position updates
        const handlePositionUpdate = (data: any) => {
            if (data.type === "node_position" && data.nodeId && data.position) {
                const node = simulationData.nodes.find((n) =>
                    n.id === data.nodeId
                );
                if (node) {
                    node.fx = data.position.x;
                    node.fy = data.position.y;
                    simulation.alpha(0.3).restart();
                }
            }
        };

        // Add event listener for real-time updates
        window.addEventListener("argument_update", handlePositionUpdate);

        // Add debug logging for final graph state
        console.log("Final graph state:", {
            nodes: simulationData.nodes.map((n) => ({
                id: n.id,
                type: n.type,
            })),
            links: simulationData.links.map((l) => ({
                source: (l.source as GraphNode).id,
                target: (l.target as GraphNode).id,
                type: l.type,
            })),
        });

        // Add node click handler since it's in the props but unused
        nodeGroups
            .on("click", (event: MouseEvent, d: GraphNode) => {
                event.preventDefault();
                setSelectedElements((prev) => ({
                    ...prev,
                    nodes: prev.nodes.has(d.id)
                        ? new Set([...prev.nodes].filter((id) => id !== d.id))
                        : new Set([...prev.nodes, d.id]),
                }));
            });

        // Update visual styling for selection
        nodeGroups.select("circle")
            .attr("stroke", (d) => {
                if (selectedElements.nodes.has(d.id)) return "#ff0";
                return d.id === selectedNodeId ? "#FFD700" : "#fff";
            })
            .attr(
                "stroke-width",
                (d) => selectedElements.nodes.has(d.id) ? 4 : 2,
            );

        linkGroup
            .attr("stroke-width", (d: GraphLink) => {
                const edgeId = `${(d.source as GraphNode).id}-${
                    (d.target as GraphNode).id
                }`;
                return selectedElements.edges.has(edgeId) ? 4 : 2;
            })
            .attr("opacity", (d: GraphLink) => {
                const edgeId = `${(d.source as GraphNode).id}-${
                    (d.target as GraphNode).id
                }`;
                return selectedElements.edges.has(edgeId) ? 1 : 0.6;
            });

        return () => {
            if (simulation) simulation.stop();
            if (tooltip) tooltip.remove();
            window.removeEventListener("argument_update", handlePositionUpdate);
        };
    }, [nodes, edges, selectedNodeId, width, height, onLayoutChange]);

    // Add function to generate graph JSON
    const copyGraphJson = () => {
        const graphData = {
            nodes: Object.entries(nodes).map(([id, node]) => ({
                id,
                ...node,
                position: {
                    x: Math.round((node?.position?.x || 0) * 100) / 100,
                    y: Math.round((node?.position?.y || 0) * 100) / 100,
                },
            })),
            edges: edges.map((edge) => ({
                ...edge,
                source: edge.source,
                target: edge.target,
            })),
        };

        navigator.clipboard.writeText(JSON.stringify(graphData, null, 2))
            .then(() => {
                alert("Graph JSON copied to clipboard!");
            })
            .catch((err) => {
                console.error("Failed to copy graph JSON:", err);
                alert("Failed to copy graph JSON");
            });
    };

    return (
        <div className="argument-graph">
            <svg ref={svgRef} style={{ width: "100%", height: "100%" }} />
            <div className="graph-controls">
                <button
                    onClick={() => setTransform(d3.zoomIdentity)}
                    className="reset-view-button"
                >
                    Reset View
                </button>
                <div className="transform-info">
                    Scale:{" "}
                    {Math.round(transform.k * 100)}% Position: ({Math.round(
                        transform.x,
                    )}, {Math.round(transform.y)})
                </div>
            </div>
            <button
                onClick={copyGraphJson}
                className="copy-json-button"
                style={{
                    position: "absolute",
                    bottom: "10px",
                    left: "10px",
                    padding: "8px 12px",
                    backgroundColor: "#444",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                }}
            >
                Copy Graph JSON
            </button>
            {(selectedElements.nodes.size > 0 ||
                selectedElements.edges.size > 0) && (
                <div
                    className="selection-controls"
                    style={{
                        position: "absolute",
                        top: "10px",
                        right: "10px",
                        display: "flex",
                        gap: "10px",
                    }}
                >
                    <button
                        onClick={() =>
                            setSelectedElements({
                                nodes: new Set(),
                                edges: new Set(),
                            })}
                        style={{
                            padding: "8px 12px",
                            backgroundColor: "#666",
                            color: "white",
                            border: "none",
                            borderRadius: "4px",
                            cursor: "pointer",
                        }}
                    >
                        Clear Selection
                    </button>
                    <button
                        onClick={() => {
                            if (!onSelectionAnalysis) return;

                            const selectedNodes = simulationDataRef.current
                                .nodes.filter(
                                    (n: GraphNode) =>
                                        selectedElements.nodes.has(n.id),
                                );
                            const selectedEdges = simulationDataRef.current
                                .links.filter(
                                    (e: GraphLink) =>
                                        selectedElements.edges.has(
                                            `${(e.source as GraphNode).id}-${
                                                (e.target as GraphNode).id
                                            }`,
                                        ),
                                );

                            onSelectionAnalysis(selectedNodes, selectedEdges);
                        }}
                        style={{
                            padding: "8px 12px",
                            backgroundColor: "#4CAF50",
                            color: "white",
                            border: "none",
                            borderRadius: "4px",
                            cursor: "pointer",
                        }}
                    >
                        Analyze Selection ({selectedElements.nodes.size} nodes,
                        {" "}
                        {selectedElements.edges.size} edges)
                    </button>
                </div>
            )}
        </div>
    );
}
