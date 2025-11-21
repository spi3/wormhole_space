class User:

    _instance = None

    @classmethod
    def _get_instance(cls):
        return cls._instance

    @classmethod
    def instance(cls, *args, **kargs):
        cls._instance = cls(*args, **kargs)
        cls.instance = cls._get_instance
        return cls._instance

    def __init__(self):

        self.user_count = 0
        # Map session_id to username
        self.users = {}

    def add_user(self, session_id=None, username=None):

        self.user_count = self.user_count + 1

        if session_id:
            self.users[session_id] = username or 'Anonymous'

    def remove_user(self, session_id=None):

        self.user_count = self.user_count - 1

        if session_id and session_id in self.users:
            del self.users[session_id]

    def get_user_count(self):

        return self.user_count

    def get_users(self):
        """Return list of connected usernames"""
        return list(self.users.values())

    def get_unique_users(self):
        """Return list of unique usernames"""
        return list(set(self.users.values()))
