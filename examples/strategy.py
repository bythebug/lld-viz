"""
Strategy Pattern
----------------
Defines a family of algorithms, encapsulates each one, and makes them interchangeable.

Interview use case: sorting, payment processing, routing, compression.
"""

from abc import ABC, abstractmethod
from typing import List


class SortStrategy(ABC):
    @abstractmethod
    def sort(self, data: List[int]) -> List[int]:
        pass


class BubbleSort(SortStrategy):
    def sort(self, data: List[int]) -> List[int]:
        result = data[:]
        n = len(result)
        for i in range(n):
            for j in range(n - i - 1):
                if result[j] > result[j + 1]:
                    result[j], result[j + 1] = result[j + 1], result[j]
        return result


class QuickSort(SortStrategy):
    def sort(self, data: List[int]) -> List[int]:
        if len(data) <= 1:
            return data
        pivot = data[len(data) // 2]
        left  = [x for x in data if x < pivot]
        mid   = [x for x in data if x == pivot]
        right = [x for x in data if x > pivot]
        return self.sort(left) + mid + self.sort(right)


class MergeSort(SortStrategy):
    def sort(self, data: List[int]) -> List[int]:
        if len(data) <= 1:
            return data
        mid   = len(data) // 2
        left  = self.sort(data[:mid])
        right = self.sort(data[mid:])
        return self._merge(left, right)

    def _merge(self, left: List[int], right: List[int]) -> List[int]:
        result = []
        i = j = 0
        while i < len(left) and j < len(right):
            if left[i] <= right[j]:
                result.append(left[i]); i += 1
            else:
                result.append(right[j]); j += 1
        return result + left[i:] + right[j:]


class Sorter:
    def __init__(self, strategy: SortStrategy):
        self._strategy: SortStrategy = strategy

    def set_strategy(self, strategy: SortStrategy) -> None:
        self._strategy = strategy

    def sort(self, data: List[int]) -> List[int]:
        return self._strategy.sort(data)


# ── Payment strategy example ─────────────────────────────────────────

class PaymentStrategy(ABC):
    @abstractmethod
    def process(self, amount: float) -> bool:
        pass


class CreditCardPayment(PaymentStrategy):
    def __init__(self, card_number: str, cvv: str):
        self._card_number: str = card_number
        self._cvv: str = cvv

    def process(self, amount: float) -> bool:
        return True


class PayPalPayment(PaymentStrategy):
    def __init__(self, email: str):
        self._email: str = email

    def process(self, amount: float) -> bool:
        return True


class CryptoPayment(PaymentStrategy):
    def __init__(self, wallet_address: str):
        self._wallet_address: str = wallet_address

    def process(self, amount: float) -> bool:
        return True


class ShoppingCart:
    def __init__(self):
        self._items: list = []
        self._payment_strategy: PaymentStrategy = None

    def set_payment(self, strategy: PaymentStrategy) -> None:
        self._payment_strategy = strategy

    def checkout(self) -> bool:
        total = sum(item["price"] for item in self._items)
        return self._payment_strategy.process(total)
