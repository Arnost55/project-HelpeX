"""
Base class for HelpeX tools.
"""
from abc import ABC, abstractmethod
from typing import Any


class HelpeXTool(ABC):
    """Base class for all HelpeX tools."""

    name: str = "base"
    version: str = "0.0.0"
    tools: list[dict] = []

    @abstractmethod
    def init(self) -> None:
        """
        Initialize the tool. Validate credentials and connectivity.
        Raise an exception if initialization fails.
        """
        pass

    @abstractmethod
    def execute(self, tool_name: str, params: dict) -> Any:
        """
        Execute a tool by name with given parameters.

        Args:
            tool_name: The name of the tool to execute
            params: Dictionary of parameters

        Returns:
            Any: The result of the tool execution
        """
        pass