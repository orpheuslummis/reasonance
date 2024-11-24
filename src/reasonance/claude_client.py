import anthropic
import json
import logging
from .config import Config

logger = logging.getLogger(__name__)

claude_client = anthropic.AsyncAnthropic(api_key=Config.CLAUDE_API_KEY)


async def call_claude(prompt: str) -> dict:
    """Call Claude API"""
    try:
        message = await claude_client.messages.create(
            model=Config.CLAUDE_MODEL,
            max_tokens=1024,
            system="You are an AI that analyzes arguments and discussion points. You must always return valid JSON. If you cannot analyze the message, return a default JSON structure.",
            messages=[{"role": "user", "content": prompt}],
        )

        response_text = message.content[0].text

        # Try to clean the response if it contains markdown code blocks
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0].strip()
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0].strip()

        return json.loads(response_text)

    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON response from Claude: {response_text}")
        logger.error(f"JSON decode error: {e}")
        return {
            "type": "claim",
            "targets": [],
            "summary": "Failed to parse Claude's response",
        }
    except Exception as e:
        logger.error(f"Error calling Claude API: {e}")
        return {
            "type": "claim",
            "targets": [],
            "summary": "Failed to analyze message",
        }
