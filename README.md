# LLD Viz

A live, browser-based UML class diagram visualizer for practicing **Low-Level Design (LLD)** in Python — built for interview prep.

Type Python code on the left, watch the class diagram update on the right in real time.

**[Try it live → bythebug.github.io/lld-viz](https://bythebug.github.io/lld-viz)**

---

## Features

- **Live rendering** — diagram updates ~400ms after you stop typing, no button needed
- **UML class diagrams** — classes, inheritance, composition, and dependency arrows
- **Color-coded at a glance**
  - Periwinkle = Abstract classes / Interfaces
  - Banana Cream = Pattern-tagged classes
  - Light Yellow = Concrete classes
  - Method text in Glaucous blue, attribute text in Tomato red
- **Design pattern detection** — automatically detects and badges Singleton, Observer, Subject, Strategy, Factory, Decorator, Command, Builder, Facade
- **Access modifiers** — `+` public, `#` protected (`_prefix`), `-` private (`__prefix`), `*` abstract, `$` static
- **7 preloaded examples** — Singleton, Observer, Strategy, Factory Method, Decorator, Builder, Command
- **Download** — export diagram as SVG or download Python + SVG together as a ZIP
- **Zoom** — `+` / `−` buttons, fit, or `Ctrl+scroll` on the diagram
- **Keyboard shortcut** — `Cmd/Ctrl + Enter` to force a refresh
- **Draggable split** — resize editor vs diagram panes

## What it detects

```python
from abc import ABC, abstractmethod
from typing import List

class Animal(ABC):
    def __init__(self, name: str, age: int):
        self.name: str = name   # → attribute (typed)
        self.age: int = age

    @abstractmethod
    def make_sound(self) -> str:  # → abstract method
        pass

class Dog(Animal):              # → inheritance arrow
    def __init__(self, name: str, age: int, breed: str):
        super().__init__(name, age)
        self.breed: str = breed

    def make_sound(self) -> str:
        return "Woof!"

class Shelter:
    def __init__(self):
        self.animals: List[Animal] = []  # → composition arrow

    def add_animal(self, animal: Animal) -> None:
        self.animals.append(animal)
```

## Supported patterns

| Pattern | Detection signals |
|---|---|
| Singleton | `_instance` class attr + `get_instance` / `__new__` method |
| Observer | list of observers attr + `notify` + `attach`/`detach` |
| Subject | same as Observer (the publisher side) |
| Strategy | abstract class with single abstract `execute`/`run`/`sort`/etc. method |
| Factory | abstract class with abstract `create_*` / `make_*` method |
| Decorator | inherits from X AND stores a reference of type X |
| Command | has both `execute` and `undo` methods |
| Builder | multiple `set_*`/`with_*` methods + `build` method |
| Facade | composes 3+ classes, few public methods |

## Usage

No install needed. Open `index.html` in your browser — or visit the live site.

To run locally:
```bash
git clone https://github.com/bythebug/lld-viz
cd lld-viz
python3 -m http.server 8080
# open http://localhost:8080
```

## Tech stack

- [CodeMirror 5](https://codemirror.net/) — Python editor with syntax highlighting
- [Mermaid.js](https://mermaid.js.org/) — UML class diagram rendering
- [JSZip](https://stuk.github.io/jszip/) — ZIP download
- Pure HTML / CSS / JS — no build step, no framework

## Built by

[bythebug](https://bythebug.github.io) (Suraj Verma)
