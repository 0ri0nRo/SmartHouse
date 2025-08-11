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


    def delete_document(self, query):
        try:
            result = self.collection.delete_one(query)
            if result.deleted_count > 0:
                print("Documento cancellato con successo!")
            else:
                print("Nessun documento trovato con la query fornita.")
        except Exception as e:
            print(f"Errore durante la cancellazione del documento: {e}")

    def update_document(self, query, update_values):
        try:
            result = self.collection.update_one(query, {'$set': update_values})
            if result.modified_count > 0:
                print("Documento aggiornato con successo!")
            else:
                print("Nessun documento trovato con la query fornita.")
        except Exception as e:
            print(f"Errore durante l'aggiornamento del documento: {e}")

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
            # Esegui la cancellazione
            result = self.collection.delete_one({"_id": ObjectId(item_id)})

            # Se il numero di cancellazioni è maggiore di 0, significa che è stato trovato e cancellato
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
