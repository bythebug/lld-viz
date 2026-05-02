"""
Command Pattern
---------------
Encapsulates a request as an object, allowing parameterization, queuing,
logging, and undo/redo of operations.

Interview use case: undo/redo, task queues, macro recording, transaction logs.
"""

from abc import ABC, abstractmethod
from typing import List, Optional


class Command(ABC):
    @abstractmethod
    def execute(self) -> None:
        pass

    @abstractmethod
    def undo(self) -> None:
        pass


class TextEditor:
    def __init__(self):
        self._text: str = ""
        self._cursor: int = 0

    def get_text(self) -> str:
        return self._text

    def insert(self, position: int, text: str) -> None:
        self._text = self._text[:position] + text + self._text[position:]

    def delete(self, position: int, length: int) -> str:
        deleted = self._text[position:position + length]
        self._text = self._text[:position] + self._text[position + length:]
        return deleted


class InsertTextCommand(Command):
    def __init__(self, editor: TextEditor, position: int, text: str):
        self._editor: TextEditor = editor
        self._position: int = position
        self._text: str = text

    def execute(self) -> None:
        self._editor.insert(self._position, self._text)

    def undo(self) -> None:
        self._editor.delete(self._position, len(self._text))


class DeleteTextCommand(Command):
    def __init__(self, editor: TextEditor, position: int, length: int):
        self._editor: TextEditor = editor
        self._position: int = position
        self._length: int = length
        self._deleted_text: str = ""

    def execute(self) -> None:
        self._deleted_text = self._editor.delete(self._position, self._length)

    def undo(self) -> None:
        self._editor.insert(self._position, self._deleted_text)


class MacroCommand(Command):
    def __init__(self):
        self._commands: List[Command] = []

    def add(self, command: Command) -> None:
        self._commands.append(command)

    def execute(self) -> None:
        for command in self._commands:
            command.execute()

    def undo(self) -> None:
        for command in reversed(self._commands):
            command.undo()


class CommandHistory:
    def __init__(self):
        self._history: List[Command] = []
        self._redo_stack: List[Command] = []

    def execute(self, command: Command) -> None:
        command.execute()
        self._history.append(command)
        self._redo_stack.clear()

    def undo(self) -> None:
        if not self._history:
            return
        command = self._history.pop()
        command.undo()
        self._redo_stack.append(command)

    def redo(self) -> None:
        if not self._redo_stack:
            return
        command = self._redo_stack.pop()
        command.execute()
        self._history.append(command)

    def can_undo(self) -> bool:
        return len(self._history) > 0

    def can_redo(self) -> bool:
        return len(self._redo_stack) > 0
