import unittest
from unittest.mock import MagicMock
from datetime import datetime
from bson import ObjectId
from MongoClient import MongoDBHandler  # Assicurati che il percorso sia corretto

class TestMongoDBHandler(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        """Setup iniziale: mock di MongoDBHandler"""
        cls.uri = "mongodb://localhost:27017"
        cls.db_name = "test_db"
        cls.collection_name = "test_collection"
        cls.db_handler = MongoDBHandler(cls.uri, cls.db_name, cls.collection_name)

        # Mock del client MongoDB e della collection
        cls.db_handler.client = MagicMock()
        cls.db_handler.db = MagicMock()
        cls.db_handler.collection = MagicMock()

    @classmethod
    def tearDownClass(cls):
        """Chiude la connessione MongoClient dopo i test"""
        cls.db_handler.client.close()

    
    def test_read_first_10_documents(self):
        """Testa la lettura dei primi 10 documenti"""
        mock_documents = [
            {"_id": ObjectId(), "item_name": f"item_{i}", "quantity": i, "location": "test_location", "timestamp": datetime.now()}
            for i in range(10)
        ]

        # Mock del cursor di MongoDB
        mock_cursor = MagicMock()
        mock_cursor.__iter__.return_value = mock_documents  # Simula il comportamento di find().limit(10)
        
        self.db_handler.collection.find.return_value.limit.return_value = mock_cursor

        # Eseguiamo il test
        result = self.db_handler.read_first_10_documents()

        # Assicuriamoci che restituisca una lista
        self.assertIsInstance(result, list)
        self.assertEqual(len(result), 10)
        self.assertEqual(result[0]["item_name"], "item_0")  # Verifichiamo il primo elemento



    def test_delete_document(self):
        """Testa la cancellazione di un documento"""
        query = {"item_name": "apple"}
        self.db_handler.collection.delete_one = MagicMock(return_value=MagicMock(deleted_count=1))

        self.db_handler.delete_document(query)

        self.db_handler.collection.delete_one.assert_called_once_with(query)

    def test_update_document(self):
        """Testa l'aggiornamento di un documento"""
        query = {"item_name": "apple"}
        update_values = {"quantity": 10}

        self.db_handler.collection.update_one = MagicMock(return_value=MagicMock(modified_count=1))

        self.db_handler.update_document(query, update_values)

        self.db_handler.collection.update_one.assert_called_once_with(query, {'$set': update_values})

    def test_add_shopping_item(self):
        """Testa l'aggiunta di un elemento alla collezione"""
        self.db_handler.insert_document = MagicMock()

        self.db_handler.add_shopping_item("banana", 3, "fruit aisle", "2024-02-20")

        expected_doc = {
            "item_name": "banana",
            "quantity": 3,
            "location": "fruit aisle",
            "timestamp": datetime(2024, 2, 20)
        }

        self.db_handler.insert_document.assert_called_once_with(expected_doc)

    def test_read_today_items(self):
        """Testa la lettura degli elementi di oggi"""
        mock_documents = [
            {"_id": ObjectId(), "item_name": "milk", "quantity": 2, "location": "dairy", "timestamp": datetime.now()}
        ]
        
        mock_cursor = MagicMock()
        mock_cursor.__iter__.return_value = mock_documents
        self.db_handler.collection.find.return_value = mock_cursor

        result = self.db_handler.read_today_items()

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["item_name"], "milk")

    def test_delete_item(self):
        """Testa l'eliminazione di un item per ID"""
        item_id = str(ObjectId())

        self.db_handler.collection.delete_one = MagicMock(return_value=MagicMock(deleted_count=1))

        response = self.db_handler.delete_item(item_id)

        self.db_handler.collection.delete_one.assert_called_once_with({"_id": ObjectId(item_id)})

        self.assertEqual(response["message"], "Item deleted successfully")
        self.assertEqual(response["deleted_count"], 1)

    def test_range_timestamp(self):
        """Testa la query tra due timestamp"""
        mock_documents = [
            {"_id": ObjectId(), "item_name": "cheese", "quantity": 1, "location": "dairy", "timestamp": datetime(2024, 2, 19)},
            {"_id": ObjectId(), "item_name": "butter", "quantity": 2, "location": "dairy", "timestamp": datetime(2024, 2, 20)}
        ]

        mock_cursor = MagicMock()
        mock_cursor.__iter__.return_value = mock_documents
        self.db_handler.collection.find.return_value = mock_cursor

        result = self.db_handler.range_timestamp("2024-02-19", "2024-02-20")

        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]["item_name"], "cheese")
        self.assertEqual(result[1]["item_name"], "butter")

if __name__ == "__main__":
    unittest.main()
