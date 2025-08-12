from client.MongoClient import MongoDBHandler

class TodolistService:
    """Service to manage the todolist using MongoDB"""
    
    def __init__(self, mongo_uri, db_name='local', collection='lista_spesa'):
        self.mongo = MongoDBHandler(mongo_uri, db_name, collection)

    def insert_item(self, item_name, quantity, store, timestamp):
        """Inserts a new item into the todolist"""
        return self.mongo.add_shopping_item(item_name, quantity, store, timestamp)

    def read_today(self):
        """Reads today's items"""
        return self.mongo.read_today_items()

    def delete_item(self, item_id):
        """Deletes an item from the todolist"""
        return self.mongo.delete_item(item_id)

    def range_timestamp(self, start_ts, end_ts):
        """Searches items within a timestamp range"""
        return self.mongo.range_timestamp(start_ts, end_ts)
    
    def read_all(self):
        """Read all items in mongo collection"""
        return self.mongo.read_all_items()

