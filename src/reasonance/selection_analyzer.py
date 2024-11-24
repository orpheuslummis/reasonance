from typing import Dict, List
import logging
from .claude_client import call_claude

logger = logging.getLogger(__name__)


async def analyze_selection(nodes: List[Dict], edges: List[Dict]) -> Dict:
    """Analyze a selected subgraph of nodes and edges"""
    try:
        # Format the nodes and edges for analysis
        nodes_text = "\n".join(
            [
                f"Node {node['id']}: {node['speaker']} says \"{node['summary']}\""
                for node in nodes
            ]
        )

        edges_text = "\n".join(
            [
                f"Node {edge['source']} {edge['type']} Node {edge['target']}"
                for edge in edges
            ]
        )

        # Call Claude for analysis with a structured prompt
        analysis = await call_claude(f"""Analyze this selected portion of an argument graph.
            Focus on understanding the relationships and key points in the discussion.

            Selected Nodes:
            {nodes_text}

            Relationships between nodes:
            {edges_text}

            Analyze the discussion and provide a structured analysis in JSON format:
            {{
                "main_themes": [<2-3 key themes or topics discussed>],
                "key_points": [<3-5 main arguments or points made>],
                "conclusion": "<overall conclusion about the discussion>",
                "confidence": <float between 0-1 indicating analysis confidence>
            }}
            
            Keep the analysis concise and focused on the most important aspects.
            """)

        # Validate and clean the response
        cleaned_analysis = {
            "main_themes": analysis.get("main_themes", [])[:3],  # Limit to 3 themes
            "key_points": analysis.get("key_points", [])[:5],  # Limit to 5 points
            "conclusion": analysis.get("conclusion", "Unable to determine conclusion"),
            "confidence": min(
                max(float(analysis.get("confidence", 0.5)), 0), 1
            ),  # Clamp between 0-1
        }

        return cleaned_analysis

    except Exception as e:
        logger.error(f"Selection analysis error: {e}")
        return {
            "main_themes": ["Analysis failed"],
            "key_points": ["Unable to analyze selection"],
            "conclusion": "Analysis failed due to an error",
            "confidence": 0.0,
        }
