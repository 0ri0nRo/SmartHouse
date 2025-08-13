from client.MongoClient import MongoDBHandler
from datetime import datetime, timedelta
from bson import ObjectId

class TodolistService:
    """Service to manage the todolist using MongoDB"""
    
    def __init__(self, mongo_uri, db_name='local', collection='lista_spesa'):
        self.mongo = MongoDBHandler(mongo_uri, db_name, collection)

    def insert_item(self, item_name, quantity, store, timestamp, priority='medium'):
        """Inserts a new item into the todolist"""
        try:
            # Crea il documento con tutti i campi necessari
            item_doc = {
                'item_name': item_name,
                'quantity': int(quantity),
                'store': store,
                'timestamp': timestamp,
                'priority': priority,
                'purchased': False,  # Inizialmente non acquistato
                'date_added': datetime.now().isoformat(),
                'purchase_date': None,  # Sarà impostato quando acquistato
                'inCart': False  # Compatibilità con il frontend
            }
            
            return self.mongo.add_document(item_doc)
            
        except Exception as e:
            print(f"Error in insert_item: {e}")
            raise e

    def read_current_items(self):
        """Reads current (not purchased) items"""
        try:
            # Filtra solo gli item non ancora acquistati
            filter_query = {'purchased': {'$ne': True}}
            items = self.mongo.read_documents(filter_query)
            
            # Converti ObjectId a stringa per il frontend
            for item in items:
                if '_id' in item:
                    item['id'] = str(item['_id'])
                    
            return items
            
        except Exception as e:
            print(f"Error in read_current_items: {e}")
            return []

    def get_purchase_history(self, start_ts, end_ts):
        """Get purchased items within a timestamp range"""
        try:
            # Converti le stringhe di data in oggetti datetime
            start_date = datetime.fromisoformat(start_ts.replace('Z', '+00:00'))
            end_date = datetime.fromisoformat(end_ts.replace('Z', '+00:00'))
            
            # Query per item acquistati nel range di date
            filter_query = {
                'purchased': True,
                'purchase_date': {
                    '$gte': start_date.isoformat(),
                    '$lte': end_date.isoformat()
                }
            }
            
            items = self.mongo.read_documents(filter_query)
            
            # Converti ObjectId a stringa per il frontend
            for item in items:
                if '_id' in item:
                    item['id'] = str(item['_id'])
                    
            return items
            
        except Exception as e:
            print(f"Error in get_purchase_history: {e}")
            return []

    def get_recent_purchase_history(self, days=30):
        """Get purchased items from the last N days"""
        try:
            end_date = datetime.now()
            start_date = end_date - timedelta(days=days)
            
            return self.get_purchase_history(
                start_date.isoformat(), 
                end_date.isoformat()
            )
            
        except Exception as e:
            print(f"Error in get_recent_purchase_history: {e}")
            return []

    def mark_as_purchased(self, item_id, additional_data=None):
        """Mark an item as purchased and move it to history"""
        try:
            # Prepara l'update
            update_data = {
                'purchased': True,
                'purchase_date': datetime.now().isoformat(),
                'inCart': True  # Compatibilità frontend
            }
            
            # Aggiungi dati aggiuntivi se presenti
            if additional_data:
                for key, value in additional_data.items():
                    if key not in ['_id', 'id']:  # Non sovrascrivere l'ID
                        update_data[key] = value
            
            # Esegui l'update
            result = self.mongo.update_document(
                {'_id': ObjectId(item_id)},
                update_data
            )
            
            return result.modified_count > 0 if result else False
            
        except Exception as e:
            print(f"Error in mark_as_purchased: {e}")
            return False

    def mark_as_unpurchased(self, item_id):
        """Mark an item as not purchased (move back to current list)"""
        try:
            # Rimuovi i campi di acquisto
            update_data = {
                'purchased': False,
                'purchase_date': None,
                'inCart': False  # Compatibilità frontend
            }
            
            result = self.mongo.update_document(
                {'_id': ObjectId(item_id)},
                update_data
            )
            
            return result.modified_count > 0 if result else False
            
        except Exception as e:
            print(f"Error in mark_as_unpurchased: {e}")
            return False

    def delete_item(self, item_id):
        """Deletes an item from the todolist"""
        try:
            result = self.mongo.delete_document({'_id': ObjectId(item_id)})
            return {"deleted_count": result.deleted_count if result else 0}
            
        except Exception as e:
            print(f"Error in delete_item: {e}")
            return {"deleted_count": 0, "error": str(e)}

    def get_shopping_stats(self):
        """Get shopping statistics"""
        try:
            # Conta item correnti
            current_count = len(self.read_current_items())
            
            # Conta item acquistati
            purchased_items = self.mongo.read_documents({'purchased': True})
            purchased_count = len(purchased_items)
            
            # Conta negozi unici negli item correnti
            current_items = self.read_current_items()
            unique_stores = len(set(item['store'] for item in current_items))
            
            # Conta item acquistati questa settimana
            week_ago = datetime.now() - timedelta(days=7)
            week_purchased = len([
                item for item in purchased_items 
                if item.get('purchase_date') and 
                datetime.fromisoformat(item['purchase_date']) > week_ago
            ])
            
            return {
                'total_current': current_count,
                'total_purchased': purchased_count,
                'unique_stores': unique_stores,
                'purchased_this_week': week_purchased,
                'completion_rate': round(
                    (purchased_count / (current_count + purchased_count) * 100) 
                    if (current_count + purchased_count) > 0 else 0, 1
                )
            }
            
        except Exception as e:
            print(f"Error in get_shopping_stats: {e}")
            return {
                'total_current': 0,
                'total_purchased': 0,
                'unique_stores': 0,
                'purchased_this_week': 0,
                'completion_rate': 0
            }

    def clear_purchased_items(self):
        """Permanently delete all purchased items"""
        try:
            result = self.mongo.delete_documents({'purchased': True})
            return result.deleted_count if result else 0
            
        except Exception as e:
            print(f"Error in clear_purchased_items: {e}")
            return 0

    def bulk_mark_purchased(self, item_ids):
        """Mark multiple items as purchased"""
        try:
            # Converti gli ID stringa in ObjectId
            object_ids = [ObjectId(item_id) for item_id in item_ids]
            
            update_data = {
                'purchased': True,
                'purchase_date': datetime.now().isoformat(),
                'inCart': True
            }
            
            result = self.mongo.update_documents(
                {'_id': {'$in': object_ids}},
                update_data
            )
            
            return result.modified_count if result else 0
            
        except Exception as e:
            print(f"Error in bulk_mark_purchased: {e}")
            return 0

    def range_timestamp(self, start_ts, end_ts):
        """Legacy method - now redirects to purchase history"""
        return self.get_purchase_history(start_ts, end_ts)

    def read_today(self):
        """Legacy method - now redirects to current items"""
        return self.read_current_items()
    
    def read_all(self):
        """Read all items in mongo collection"""
        try:
            items = self.mongo.read_all_documents()
            
            # Converti ObjectId a stringa per il frontend
            for item in items:
                if '_id' in item:
                    item['id'] = str(item['_id'])
                    
            return items
            
        except Exception as e:
            print(f"Error in read_all: {e}")
            return []

    def get_frequent_items(self, limit=10):
        """Get most frequently purchased items"""
        try:
            # Usa aggregation per contare gli item più frequenti
            pipeline = [
                {'$match': {'purchased': True}},
                {'$group': {
                    '_id': {
                        'item_name': '$item_name',
                        'store': '$store'
                    },
                    'count': {'$sum': 1},
                    'last_purchased': {'$max': '$purchase_date'}
                }},
                {'$sort': {'count': -1}},
                {'$limit': limit}
            ]
            
            results = list(self.mongo.collection.aggregate(pipeline))
            
            # Formatta i risultati
            frequent_items = []
            for result in results:
                frequent_items.append({
                    'item_name': result['_id']['item_name'],
                    'store': result['_id']['store'],
                    'frequency': result['count'],
                    'last_purchased': result['last_purchased']
                })
                
            return frequent_items
            
        except Exception as e:
            print(f"Error in get_frequent_items: {e}")
            return []

    def suggest_items_by_store(self, store):
        """Suggest items based on store history"""
        try:
            # Trova item acquistati frequentemente in questo negozio
            filter_query = {
                'purchased': True,
                'store': {'$regex': store, '$options': 'i'}  # Case insensitive
            }
            
            items = self.mongo.read_documents(filter_query)
            
            # Conta la frequenza
            item_counts = {}
            for item in items:
                name = item['item_name']
                item_counts[name] = item_counts.get(name, 0) + 1
            
            # Ordina per frequenza
            suggestions = sorted(
                item_counts.items(), 
                key=lambda x: x[1], 
                reverse=True
            )[:5]
            
            return [{'item_name': name, 'frequency': count} for name, count in suggestions]
            
        except Exception as e:
            print(f"Error in suggest_items_by_store: {e}")
            return []