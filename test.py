from beeper import get_chats
import json

chats = get_chats()
print(json.dumps(chats, indent=2))
with open("chats.json", "w") as f:
    json.dump(chats, f)