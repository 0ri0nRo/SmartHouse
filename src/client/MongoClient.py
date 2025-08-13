from pymongo import MongoClient, errors
from datetime import datetime
from bson import ObjectId
import pytz

class MongoDBHandler:
    def __init__(self, uri, db_name, collection_name):
        try:
            self.client = MongoClient(uri)
            self.db = self.client[db_name]
            self.collection = self.db[collection_name]
        except errors.ServerSelectionTimeoutError as e:
           print(f"Errore di connessione al database MongoDB: {e}")
        except errors.ConfigurationError as e:
            print(f"Errore di configurazione: {e}")

    def insert_document(self, document):
        try:
            result = self.collection.insert_one(document)
            return result.inserted_id  # Aggiunto per verificare il risultato
        except Exception as e:
            print(f"Errore durante l'inserimento del documento: {e}")
            return None
    
    def read_first_10_documents(self):
        try:
            documents = self.collection.find().limit(10)
            return [{**doc, "_id": str(doc["_id"])} for doc in documents] 
        except Exception as e:
            print(f"Errore durante la lettura dei documenti: {e}")
            return []  # Assicuriamoci di restituire sempre una lista


    def add_shopping_item(self, item_name, quantity, store, timestamp_str):
        try:
            # Convertire la stringa timestamp in un oggetto datetime
            timestamp = datetime.strptime(timestamp_str, "%Y-%m-%d")
        except ValueError as e:
            print(f"Errore nel parsing del timestamp: {e}")
            return

        document = {
            "item_name": item_name,
            "quantity": quantity,
            "store": store,
            "timestamp": timestamp,
            "purchased": False  # campo aggiunto, default False
        }

        self.insert_document(document)

    def read_today_items(self):
        try:
            utc = pytz.UTC
            now = datetime.utcnow().replace(tzinfo=utc)
            start_of_day = datetime.combine(now.date(), time.min).replace(tzinfo=utc)
            end_of_day = datetime.combine(now.date(), time.max).replace(tzinfo=utc)

            query = {"timestamp": {"$gte": start_of_day, "$lt": end_of_day}}
            documents = self.collection.find(query)
            result = [{**doc, "_id": str(doc["_id"])} for doc in documents]
            print(result)
            return result
        except Exception as e:
            print(f"Errore durante la lettura degli item di oggi: {e}")
            return []
        
    def delete_item(self, item_id):
        """Elimina un item dalla collezione in base al suo ID."""
        try:
            # Verifica che l'ID sia un ObjectId valido
            if not ObjectId.is_valid(item_id):
                return {"message": "Invalid item ID format", "deleted_count": 0}

            oid = ObjectId(item_id)
            result = self.collection.delete_one({"_id": oid})

            if result.deleted_count > 0:
                return {"message": "Item deleted successfully", "deleted_count": result.deleted_count}
            else:
                return {"message": "Item not found", "deleted_count": result.deleted_count}
        except Exception as e:
            return {"message": f"Error deleting item: {e}", "deleted_count": 0}



    def range_timestamp(self, start_timestamp, end_timestamp):
        """Query the database for items with timestamp between start_timestamp and end_timestamp"""
        try:
            # Convertiamo le date in oggetti datetime
            start_date = datetime.strptime(start_timestamp, "%Y-%m-%d")
            end_date = datetime.strptime(end_timestamp, "%Y-%m-%d")
            
            # Modificato per includere end_timestamp
            query = {"timestamp": {"$gte": start_date, "$lte": end_date}}
            
            documents = self.collection.find(query)
            
            # Restituiamo una lista di documenti formattata correttamente
            result = [{
                "_id": str(doc["_id"]),  # Assicurati di convertire ObjectId in stringa
                "item_name": doc["item_name"],
                "quantity": doc["quantity"],
                "store": doc["store"],
                "timestamp": doc["timestamp"].strftime("%Y-%m-%d")
            } for doc in documents]
            
            return result

        except Exception as e:
            print(f"Error querying database: {e}")
            return []  # Restituiamo una lista vuota in caso di errore

    def read_all_items(self):
        try:
            documents = self.collection.find()
            return [{**doc, "_id": str(doc["_id"])} for doc in documents]
        except Exception as e:
            print(f"Errore durante la lettura di tutti gli item: {e}")
            return []

        # Aggiungi questi metodi alla tua classe MongoDBHandler esistente

    def add_document(self, document):
        """Insert a single document into the collection"""
        try:
            result = self.collection.insert_one(document)
            return result.inserted_id
        except Exception as e:
            print(f"Error inserting document: {e}")
            raise e

    def read_documents(self, filter_query=None, sort=None, limit=None):
        """Read multiple documents with optional filtering, sorting, and limiting"""
        try:
            if filter_query is None:
                filter_query = {}
                
            cursor = self.collection.find(filter_query)
            
            if sort:
                cursor = cursor.sort(sort)
                
            if limit:
                cursor = cursor.limit(limit)
                
            # Convert cursor to list and handle ObjectId conversion
            documents = []
            for doc in cursor:
                if '_id' in doc:
                    doc['_id'] = str(doc['_id'])
                documents.append(doc)
                
            return documents
            
        except Exception as e:
            print(f"Error reading documents: {e}")
            return []

    def read_all_documents(self):
        """Read all documents in the collection"""
        return self.read_documents()

    def update_document(self, filter_query, update_data):
        """Update a single document"""
        try:
            # Use $set to update fields
            update_query = {'$set': update_data}
            result = self.collection.update_one(filter_query, update_query)
            return result
        except Exception as e:
            print(f"Error updating document: {e}")
            return None

    def update_documents(self, filter_query, update_data):
        """Update multiple documents"""
        try:
            # Use $set to update fields
            update_query = {'$set': update_data}
            result = self.collection.update_many(filter_query, update_query)
            return result
        except Exception as e:
            print(f"Error updating documents: {e}")
            return None

    def delete_document(self, filter_query):
        """Delete a single document"""
        try:
            result = self.collection.delete_one(filter_query)
            return result
        except Exception as e:
            print(f"Error deleting document: {e}")
            return None

    def delete_documents(self, filter_query):
        """Delete multiple documents"""
        try:
            result = self.collection.delete_many(filter_query)
            return result
        except Exception as e:
            print(f"Error deleting documents: {e}")
            return None


    def read_today_items(self):
        """Legacy method - now reads current (unpurchased) items"""
        return self.read_documents({'purchased': {'$ne': True}})