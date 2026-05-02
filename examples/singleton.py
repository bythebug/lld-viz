"""
Singleton Pattern
-----------------
Ensures a class has only one instance and provides a global point of access.

Interview use case: logging, config managers, thread pools, DB connection pools.
"""

from typing import Optional


class Singleton:
    _instance: Optional["Singleton"] = None

    def __init__(self):
        self._data: dict = {}

    @classmethod
    def get_instance(cls) -> "Singleton":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def set(self, key: str, value: object) -> None:
        self._data[key] = value

    def get(self, key: str) -> object:
        return self._data.get(key)


class Logger(Singleton):
    def __init__(self):
        super().__init__()
        self._log_level: str = "INFO"

    def log(self, message: str) -> None:
        pass

    def set_level(self, level: str) -> None:
        self._log_level = level


class ConfigManager(Singleton):
    def __init__(self):
        super().__init__()
        self._config_file: str = ""

    def load(self, path: str) -> None:
        self._config_file = path

    def reload(self) -> None:
        pass
