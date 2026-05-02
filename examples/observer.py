"""
Observer Pattern
----------------
Defines a one-to-many dependency so that when one object changes state,
all its dependents are notified automatically.

Interview use case: event systems, notification services, stock tickers, UI updates.
"""

from abc import ABC, abstractmethod
from typing import List


class Observer(ABC):
    @abstractmethod
    def update(self, event: str, data: object) -> None:
        pass


class Subject(ABC):
    @abstractmethod
    def attach(self, observer: Observer) -> None:
        pass

    @abstractmethod
    def detach(self, observer: Observer) -> None:
        pass

    @abstractmethod
    def notify(self, event: str, data: object) -> None:
        pass


class EventBus(Subject):
    def __init__(self):
        self._observers: List[Observer] = []

    def attach(self, observer: Observer) -> None:
        self._observers.append(observer)

    def detach(self, observer: Observer) -> None:
        self._observers.remove(observer)

    def notify(self, event: str, data: object) -> None:
        for observer in self._observers:
            observer.update(event, data)


class StockTicker(Subject):
    def __init__(self, symbol: str):
        self.symbol: str = symbol
        self._price: float = 0.0
        self._observers: List[Observer] = []

    def set_price(self, price: float) -> None:
        self._price = price
        self.notify("price_change", price)

    def attach(self, observer: Observer) -> None:
        self._observers.append(observer)

    def detach(self, observer: Observer) -> None:
        self._observers.remove(observer)

    def notify(self, event: str, data: object) -> None:
        for observer in self._observers:
            observer.update(event, data)


class EmailNotifier(Observer):
    def __init__(self, email: str):
        self.email: str = email

    def update(self, event: str, data: object) -> None:
        pass


class SMSNotifier(Observer):
    def __init__(self, phone: str):
        self.phone: str = phone

    def update(self, event: str, data: object) -> None:
        pass


class Dashboard(Observer):
    def __init__(self):
        self._latest_data: dict = {}

    def update(self, event: str, data: object) -> None:
        self._latest_data[event] = data

    def render(self) -> None:
        pass
