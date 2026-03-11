import os
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))
MODEL = "llama-3.1-8b-instant"


def get_reply(chat_history: list[dict]) -> str:
    """Send chat history to Groq and get a reply."""
    response = client.chat.completions.create(
        model=MODEL,
        messages=chat_history,
        max_tokens=512
    )
    return response.choices[0].message.content
