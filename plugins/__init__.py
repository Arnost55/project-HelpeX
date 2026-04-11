"""HelpeX Plugin System"""

import os
import importlib
import yaml
from pathlib import Path

PLUGINS_DIR = Path(__file__).parent


class PluginLoader:
    """Load and manage HelpeX plugins."""

    def __init__(self):
        self.plugins = {}

    def discover_plugins(self):
        """Find all plugins in the plugins directory."""
        for item in PLUGINS_DIR.iterdir():
            if item.is_dir() and not item.name.startswith('_'):
                plugin_yaml = item / 'plugin.yaml'
                if plugin_yaml.exists():
                    with open(plugin_yaml) as f:
                        config = yaml.safe_load(f)
                    self.plugins[item.name] = config
        return self.plugins

    def load_plugin(self, name):
        """Load a plugin by name."""
        if name not in self.plugins:
            self.discover_plugins()
        return self.plugins.get(name)


loader = PluginLoader()