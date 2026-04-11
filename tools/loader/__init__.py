"""
HelpeX Tool Loader - Loads all tools and fails fast if any tool fails to initialize.

Each tool must implement:
- name: str
- version: str
- tools: list[dict] — list of tool definitions
- init() -> None — validate credentials/connectivity
- execute(tool_name: str, params: dict) -> Any

If any tool fails to init(), the entire process exits with error code 1.
"""
import importlib
import sys
from pathlib import Path
from typing import Any

# tools/loader/__init__.py -> tools/
TOOLS_DIR = Path(__file__).parent.parent
_loaded_tools: dict[str, Any] = {}


def _import_tools():
    """Import all tool modules from the tools/helpex directory."""
    tool_modules = []

    # Find all Python files in helpex/ (excluding __init__ and base classes)
    for file in (TOOLS_DIR / "helpex").iterdir():
        if file.suffix == ".py" and file.stem not in ("__init__", "base"):
            tool_modules.append(file.stem)

    return sorted(tool_modules)


def load_tools() -> dict[str, Any]:
    """
    Load all HelpeX tools. Fails fast if any tool fails to initialize.

    Returns:
        dict[str, Any]: Dictionary of loaded tool instances, keyed by tool name
    """
    global _loaded_tools

    if _loaded_tools:
        return _loaded_tools

    print("[loader] Loading HelpeX tools...")

    tool_modules = _import_tools()

    if not tool_modules:
        print("[loader] ERROR: No tool modules found!", file=sys.stderr)
        sys.exit(1)

    for module_name in tool_modules:
        try:
            # Import the module
            module = importlib.import_module(f"tools.helpex.{module_name}")

            # Get the tool instance (should have a `tool` attribute)
            if not hasattr(module, "tool"):
                print(f"[loader] ERROR: {module_name} has no 'tool' attribute", file=sys.stderr)
                sys.exit(1)

            instance = module.tool

            # Validate required attributes
            for attr in ("name", "version", "tools", "init"):
                if not hasattr(instance, attr):
                    print(f"[loader] ERROR: {module_name} missing '{attr}' attribute", file=sys.stderr)
                    sys.exit(1)

            # Initialize the tool (validates credentials/connectivity)
            print(f"[loader] Initializing {instance.name} v{instance.version}...", end=" ")
            instance.init()
            print("OK")

            _loaded_tools[instance.name] = instance

        except ImportError as e:
            print(f"[loader] ERROR: Failed to import {module_name}: {e}", file=sys.stderr)
            sys.exit(1)
        except Exception as e:
            print(f"[loader] ERROR: Failed to initialize {module_name}: {e}", file=sys.stderr)
            sys.exit(1)

    print(f"[loader] All tools loaded successfully ({len(_loaded_tools)})")
    return _loaded_tools


def get_tool(name: str) -> Any:
    """Get a loaded tool by name."""
    if not _loaded_tools:
        load_tools()
    return _loaded_tools.get(name)


def get_all_tools() -> list[dict]:
    """Get list of all available tool definitions for LLM."""
    if not _loaded_tools:
        load_tools()

    tools = []
    for tool in _loaded_tools.values():
        tools.extend(tool.tools)
    return tools


def execute_tool(tool_name: str, params: dict) -> Any:
    """Execute a tool by name with given parameters."""
    if not _loaded_tools:
        load_tools()

    # Find which tool contains this tool definition
    for tool_instance in _loaded_tools.values():
        for t in tool_instance.tools:
            if t["function"]["name"] == tool_name:
                return tool_instance.execute(tool_name, params)

    raise ValueError(f"Unknown tool: {tool_name}")