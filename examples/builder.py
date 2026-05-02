"""
Builder Pattern
---------------
Separates the construction of a complex object from its representation,
allowing the same construction process to create different representations.

Interview use case: query builders, config builders, complex report generation.
"""

from abc import ABC, abstractmethod
from typing import Optional, List


class Pizza:
    def __init__(self):
        self.size: str = ""
        self.crust: str = ""
        self.sauce: str = ""
        self.cheese: str = ""
        self.toppings: List[str] = []
        self.is_vegan: bool = False

    def __str__(self) -> str:
        return f"{self.size} pizza with {self.crust} crust"


class PizzaBuilder(ABC):
    @abstractmethod
    def set_size(self, size: str) -> "PizzaBuilder":
        pass

    @abstractmethod
    def set_crust(self, crust: str) -> "PizzaBuilder":
        pass

    @abstractmethod
    def set_sauce(self, sauce: str) -> "PizzaBuilder":
        pass

    @abstractmethod
    def add_topping(self, topping: str) -> "PizzaBuilder":
        pass

    @abstractmethod
    def build(self) -> Pizza:
        pass


class ConcretePizzaBuilder(PizzaBuilder):
    def __init__(self):
        self._pizza: Pizza = Pizza()

    def set_size(self, size: str) -> "ConcretePizzaBuilder":
        self._pizza.size = size
        return self

    def set_crust(self, crust: str) -> "ConcretePizzaBuilder":
        self._pizza.crust = crust
        return self

    def set_sauce(self, sauce: str) -> "ConcretePizzaBuilder":
        self._pizza.sauce = sauce
        return self

    def add_topping(self, topping: str) -> "ConcretePizzaBuilder":
        self._pizza.toppings.append(topping)
        return self

    def build(self) -> Pizza:
        return self._pizza


class VeganPizzaBuilder(PizzaBuilder):
    def __init__(self):
        self._pizza: Pizza = Pizza()
        self._pizza.is_vegan = True
        self._pizza.cheese = "vegan-cheese"

    def set_size(self, size: str) -> "VeganPizzaBuilder":
        self._pizza.size = size
        return self

    def set_crust(self, crust: str) -> "VeganPizzaBuilder":
        self._pizza.crust = crust
        return self

    def set_sauce(self, sauce: str) -> "VeganPizzaBuilder":
        self._pizza.sauce = sauce
        return self

    def add_topping(self, topping: str) -> "VeganPizzaBuilder":
        self._pizza.toppings.append(topping)
        return self

    def build(self) -> Pizza:
        return self._pizza


class PizzaDirector:
    def __init__(self, builder: PizzaBuilder):
        self._builder: PizzaBuilder = builder

    def set_builder(self, builder: PizzaBuilder) -> None:
        self._builder = builder

    def make_margherita(self) -> Pizza:
        return (self._builder
                .set_size("medium")
                .set_crust("thin")
                .set_sauce("tomato")
                .add_topping("mozzarella")
                .add_topping("basil")
                .build())

    def make_pepperoni(self) -> Pizza:
        return (self._builder
                .set_size("large")
                .set_crust("thick")
                .set_sauce("tomato")
                .add_topping("pepperoni")
                .add_topping("mozzarella")
                .build())
