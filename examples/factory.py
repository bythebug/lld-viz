"""
Factory Method Pattern
----------------------
Defines an interface for creating objects, but lets subclasses decide which
class to instantiate.

Interview use case: cross-platform UI, notification senders, database drivers.
"""

from abc import ABC, abstractmethod


class Notification(ABC):
    @abstractmethod
    def send(self, recipient: str, message: str) -> bool:
        pass

    @abstractmethod
    def get_type(self) -> str:
        pass


class EmailNotification(Notification):
    def __init__(self, smtp_host: str):
        self._smtp_host: str = smtp_host

    def send(self, recipient: str, message: str) -> bool:
        return True

    def get_type(self) -> str:
        return "email"


class SMSNotification(Notification):
    def __init__(self, api_key: str):
        self._api_key: str = api_key

    def send(self, recipient: str, message: str) -> bool:
        return True

    def get_type(self) -> str:
        return "sms"


class PushNotification(Notification):
    def __init__(self, device_token: str):
        self._device_token: str = device_token

    def send(self, recipient: str, message: str) -> bool:
        return True

    def get_type(self) -> str:
        return "push"


class NotificationFactory(ABC):
    @abstractmethod
    def create_notification(self) -> Notification:
        pass

    def send(self, recipient: str, message: str) -> bool:
        notification = self.create_notification()
        return notification.send(recipient, message)


class EmailFactory(NotificationFactory):
    def __init__(self, smtp_host: str):
        self._smtp_host: str = smtp_host

    def create_notification(self) -> EmailNotification:
        return EmailNotification(self._smtp_host)


class SMSFactory(NotificationFactory):
    def __init__(self, api_key: str):
        self._api_key: str = api_key

    def create_notification(self) -> SMSNotification:
        return SMSNotification(self._api_key)


class PushFactory(NotificationFactory):
    def __init__(self, device_token: str):
        self._device_token: str = device_token

    def create_notification(self) -> PushNotification:
        return PushNotification(self._device_token)


class NotificationService:
    def __init__(self, factory: NotificationFactory):
        self._factory: NotificationFactory = factory

    def set_factory(self, factory: NotificationFactory) -> None:
        self._factory = factory

    def notify(self, recipient: str, message: str) -> bool:
        return self._factory.send(recipient, message)
