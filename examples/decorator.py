"""
Decorator Pattern
-----------------
Attaches additional responsibilities to an object dynamically.
Provides a flexible alternative to subclassing for extending functionality.

Interview use case: logging, caching, auth middleware, stream compression.
"""

from abc import ABC, abstractmethod


class DataSource(ABC):
    @abstractmethod
    def write_data(self, data: str) -> None:
        pass

    @abstractmethod
    def read_data(self) -> str:
        pass


class FileDataSource(DataSource):
    def __init__(self, filename: str):
        self._filename: str = filename

    def write_data(self, data: str) -> None:
        pass

    def read_data(self) -> str:
        return ""


class DataSourceDecorator(DataSource):
    def __init__(self, wrappee: DataSource):
        self._wrappee: DataSource = wrappee

    def write_data(self, data: str) -> None:
        self._wrappee.write_data(data)

    def read_data(self) -> str:
        return self._wrappee.read_data()


class EncryptionDecorator(DataSourceDecorator):
    def __init__(self, wrappee: DataSource, key: str):
        super().__init__(wrappee)
        self._key: str = key

    def write_data(self, data: str) -> None:
        encrypted = self._encrypt(data)
        super().write_data(encrypted)

    def read_data(self) -> str:
        return self._decrypt(super().read_data())

    def _encrypt(self, data: str) -> str:
        return data

    def _decrypt(self, data: str) -> str:
        return data


class CompressionDecorator(DataSourceDecorator):
    def __init__(self, wrappee: DataSource):
        super().__init__(wrappee)
        self._compression_level: int = 9

    def write_data(self, data: str) -> None:
        compressed = self._compress(data)
        super().write_data(compressed)

    def read_data(self) -> str:
        return self._decompress(super().read_data())

    def _compress(self, data: str) -> str:
        return data

    def _decompress(self, data: str) -> str:
        return data


class LoggingDecorator(DataSourceDecorator):
    def __init__(self, wrappee: DataSource):
        super().__init__(wrappee)
        self._log: list = []

    def write_data(self, data: str) -> None:
        self._log.append(f"write:{len(data)}")
        super().write_data(data)

    def read_data(self) -> str:
        result = super().read_data()
        self._log.append(f"read:{len(result)}")
        return result

    def get_log(self) -> list:
        return self._log
