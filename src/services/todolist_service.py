from client.MongoClient import MongoDBHandler

class TodolistService:
    """Servizio per gestire la todolist usando MongoDB"""
    
    def __init__(self, mongo_uri, db_name='local', collection='lista_spesa'):
        self.mongo = MongoDBHandler(mongo_uri, db_name, collection)

    def insert_item(self, item_name, quantity, store, timestamp):
        """Inserisce un nuovo elemento nella todolist"""
        return self.mongo.add_shopping_item(item_name, quantity, store, timestamp)

    def read_today(self):
        """Legge gli elementi di oggi"""
        return self.mongo.read_today_items()

    def delete_item(self, item_id):
        """Elimina un elemento dalla todolist"""
        return self.mongo.delete_item(item_id)

    def range_timestamp(self, start_ts, end_ts):
        """Cerca elementi in un range di timestamp"""
        return self.mongo.range_timestamp(start_ts, end_ts)