from typing import Dict, List, Tuple
import logging
from .types import ArgumentType, ArgumentNode, ArgumentEdge
from .claude_client import call_claude

logger = logging.getLogger(__name__)


class ArgumentMapper:
    """Handles analysis and mapping of arguments in conversations"""

    def __init__(self):
        self.nodes: Dict[int, ArgumentNode] = {}
        self.edges: List[ArgumentEdge] = []
        self.confidence_threshold = 0.5

    async def analyze_message(
        self,
        turn_id: int,
        message: str,
        speaker: str,
        context_turns: List[Dict],
    ) -> Tuple[ArgumentNode, float]:
        """
        Analyze a message using Claude's natural understanding
        Returns: Tuple of (ArgumentNode, confidence_score)
        """
        try:
            # Format context
            context = self._format_context(context_turns)
            graph_context = self._format_graph_context()

            # Enhanced prompt for better relationship detection
            analysis = await call_claude(
                f"""Analyze this message in an ongoing discussion.

                    Context of previous messages:
                    {context}

                    Current argument graph:
                    {graph_context}

                    Message to analyze:
                    {speaker}: {message}

                    Respond ONLY with a JSON object in the following exact format, with no additional text or explanation:
                    {{
                        "type": "<one of: claim, support, counter, response>",
                        "summary": "<concise summary, max 150 chars>",
                        "targets": [<list of turn_ids this directly responds to>],
                        "topic": "<broad topic category>",
                        "confidence": <float between 0-1>,
                        "reasoning": "<brief explanation>"
                    }}"""
            )

            # Enhanced validation
            confidence = self._validate_analysis(analysis, turn_id)

            # Create node from analysis
            node = ArgumentNode(
                turn_id=turn_id,
                type=ArgumentType(analysis.get("type", "claim")),
                summary=analysis.get("summary", message[:100] + "..."),
                speaker=speaker,
                topic=analysis.get("topic"),
            )

            # Add node and create edges
            self._add_node_and_edges(node, analysis.get("targets", []))

            return node, confidence

        except Exception as e:
            logger.error(f"Analysis failed for turn {turn_id}: {e}")
            return self._create_fallback_node(turn_id, message, speaker), 0.0

    def _validate_analysis(self, analysis: Dict, turn_id: int) -> float:
        """Validate the analysis results and return confidence score"""
        confidence = float(analysis.get("confidence", 0))

        if not isinstance(analysis.get("targets", []), list):
            logger.warning(f"Invalid targets format for turn {turn_id}")
            analysis["targets"] = []
            confidence *= 0.8

        if confidence < self.confidence_threshold:
            logger.warning(f"Low confidence analysis ({confidence}) for turn {turn_id}")

        if "type" not in analysis or analysis["type"] not in [
            t.value for t in ArgumentType
        ]:
            logger.warning(f"Invalid argument type for turn {turn_id}")
            analysis["type"] = "claim"
            confidence *= 0.8

        return confidence

    def _add_node_and_edges(self, node: ArgumentNode, targets: List[int]) -> None:
        """Add node to graph and create edges for targets"""
        self.nodes[node.turn_id] = node

        for target_id in targets:
            if target_id in self.nodes:
                edge = ArgumentEdge(
                    source_id=node.turn_id, target_id=target_id, type=node.type
                )
                self.edges.append(edge)

    def _create_fallback_node(
        self, turn_id: int, message: str, speaker: str
    ) -> ArgumentNode:
        """Create a fallback node when analysis fails"""
        fallback_node = ArgumentNode(
            turn_id=turn_id,
            type=ArgumentType.CLAIM,
            summary=message[:100] + "...",
            speaker=speaker,
            topic=None,
        )
        self.nodes[turn_id] = fallback_node
        return fallback_node

    def _format_context(self, turns: List[Dict]) -> str:
        """Format conversation turns into context string"""
        return "\n".join(f"{turn['speaker']}: {turn['transcript']}" for turn in turns)

    def _format_graph_context(self) -> str:
        """Format current graph state for context"""
        context = []
        for turn_id, node in self.nodes.items():
            related = [
                edge.target_id for edge in self.edges if edge.source_id == turn_id
            ]
            related_str = ", ".join(f"#{r}" for r in related)
            context.append(
                f"#{turn_id} ({node.type.value}): {node.summary} "
                f"[Responds to: {related_str}]"
            )
        return "\n".join(context)

    def get_graph(self) -> Dict:
        """Get the complete argument graph"""
        return {
            "nodes": {
                str(turn_id): {
                    "id": str(turn_id),
                    "turn_id": node.turn_id,
                    "type": node.type.value,
                    "summary": node.summary,
                    "topic": node.topic,
                    "speaker": node.speaker,
                }
                for turn_id, node in self.nodes.items()
            },
            "edges": [
                {
                    "source": str(edge.source_id),
                    "target": str(edge.target_id),
                    "type": edge.type.value,
                }
                for edge in self.edges
            ],
        }
