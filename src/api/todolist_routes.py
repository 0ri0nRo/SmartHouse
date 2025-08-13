from flask import Blueprint, jsonify, request, render_template
from services.todolist_service import TodolistService
from config.settings import get_config
from bson import ObjectId
from datetime import datetime

todolist_bp = Blueprint('todolist', __name__)
config = get_config()
todolist_service = TodolistService(config['MONGO_URI'])

@todolist_bp.route('/todolist/insert', methods=['POST'])
def todolist_insert():
    """API to insert a new item into the todolist."""
    try:
        documents = request.json
        
        # Validazione dei dati richiesti
        required_fields = ['item_name', 'quantity', 'store']
        for field in required_fields:
            if field not in documents:
                return jsonify({"message": f"Missing required field: {field}"}), 400
        
        # Aggiungi timestamp se non presente
        if 'timestamp' not in documents:
            documents['timestamp'] = datetime.now().isoformat()
            
        # Aggiungi priority se non presente
        if 'priority' not in documents:
            documents['priority'] = 'medium'
            
        result = todolist_service.insert_item(
            documents['item_name'], 
            documents['quantity'], 
            documents['store'], 
            documents['timestamp'],
            documents.get('priority', 'medium')
        )
        
        return jsonify({"message": "Item inserted successfully", "id": str(result)}), 201
        
    except Exception as e:
        return jsonify({"message": f"Error inserting item: {str(e)}"}), 500

@todolist_bp.route('/todolist/today', methods=['GET'])
def todolist_today():
    """API to get current active (not purchased) items from the todolist."""
    try:
        docs = todolist_service.read_current_items()
        return jsonify(docs), 200
    except Exception as e:
        return jsonify({"message": f"Error retrieving items: {str(e)}"}), 500

@todolist_bp.route('/todolist/delete/<item_id>', methods=['DELETE'])
def todolist_delete(item_id):
    """API to delete an item from the todolist."""
    if not ObjectId.is_valid(item_id):
        return jsonify({"message": "Invalid item ID"}), 400
        
    try:
        res = todolist_service.delete_item(item_id)
        if res.get("deleted_count", 0) > 0:
            return jsonify({"message": "Item deleted successfully"}), 200
        return jsonify({"message": "Item not found"}), 404
    except Exception as e:
        return jsonify({"message": f"Error deleting item: {str(e)}"}), 500

@todolist_bp.route('/todolist/update/<start_timestamp>/<end_timestamp>', methods=['GET'])
def todolist_search_by_timestamp(start_timestamp, end_timestamp):
    """API to search purchased items within a timestamp range for history."""
    try:
        docs = todolist_service.get_purchase_history(start_timestamp, end_timestamp)
        return jsonify(docs), 200
    except Exception as e:
        return jsonify({"message": f"Error retrieving history: {str(e)}"}), 500

@todolist_bp.route('/shopping-list', methods=['GET'])
def shopping_list_page():
    """Page to display the shopping list."""
    return render_template("shopping-list.html"), 200

@todolist_bp.route('/api/shopping-list/complete/<item_id>', methods=['POST'])
def mark_item_complete(item_id):
    """API to mark an item as purchased and move it to history."""
    if not ObjectId.is_valid(item_id):
        return jsonify({"message": "Invalid item ID"}), 400
    
    try:
        # Prendi i dati dal body della richiesta se presenti
        data = request.get_json() or {}
        
        result = todolist_service.mark_as_purchased(item_id, data)
        
        if result:
            return jsonify({"message": "Item marked as purchased successfully"}), 200
        else:
            return jsonify({"message": "Item not found"}), 404
            
    except Exception as e:
        return jsonify({"message": f"Error marking item as complete: {str(e)}"}), 500

@todolist_bp.route('/api/shopping-list/uncomplete/<item_id>', methods=['POST'])
def mark_item_uncomplete(item_id):
    """API to mark an item as not purchased (move back to current list)."""
    if not ObjectId.is_valid(item_id):
        return jsonify({"message": "Invalid item ID"}), 400
    
    try:
        result = todolist_service.mark_as_unpurchased(item_id)
        
        if result:
            return jsonify({"message": "Item marked as not purchased successfully"}), 200
        else:
            return jsonify({"message": "Item not found"}), 404
            
    except Exception as e:
        return jsonify({"message": f"Error unmarking item: {str(e)}"}), 500

@todolist_bp.route('/api/shopping-list/current', methods=['GET'])
def shopping_list_current():
    """API to get all current (not purchased) items."""
    try:
        docs = todolist_service.read_current_items()
        return jsonify(docs), 200
    except Exception as e:
        return jsonify({"message": f"Error retrieving current items: {str(e)}"}), 500

@todolist_bp.route('/api/shopping-list/history', methods=['GET'])
def shopping_list_history():
    """API to get purchased items history with optional date filtering."""
    start_timestamp = request.args.get('start')
    end_timestamp = request.args.get('end')
    
    try:
        if start_timestamp and end_timestamp:
            docs = todolist_service.get_purchase_history(start_timestamp, end_timestamp)
        else:
            # Se non ci sono date, prendi gli ultimi 30 giorni
            docs = todolist_service.get_recent_purchase_history(days=30)
            
        return jsonify(docs), 200
    except Exception as e:
        return jsonify({"message": f"Error retrieving history: {str(e)}"}), 500

@todolist_bp.route('/api/shopping-list/stats', methods=['GET'])
def shopping_list_stats():
    """API to get shopping list statistics."""
    try:
        stats = todolist_service.get_shopping_stats()
        return jsonify(stats), 200
    except Exception as e:
        return jsonify({"message": f"Error retrieving stats: {str(e)}"}), 500

@todolist_bp.route('/api/shopping-list/clear-completed', methods=['POST'])
def clear_completed_items():
    """API to permanently delete all purchased items."""
    try:
        result = todolist_service.clear_purchased_items()
        return jsonify({
            "message": f"Cleared {result} completed items successfully",
            "cleared_count": result
        }), 200
    except Exception as e:
        return jsonify({"message": f"Error clearing completed items: {str(e)}"}), 500

@todolist_bp.route('/api/shopping-list/bulk-complete', methods=['POST'])
def bulk_complete_items():
    """API to mark multiple items as purchased."""
    try:
        data = request.get_json()
        item_ids = data.get('item_ids', [])
        
        if not item_ids:
            return jsonify({"message": "No item IDs provided"}), 400
            
        # Valida tutti gli ID
        for item_id in item_ids:
            if not ObjectId.is_valid(item_id):
                return jsonify({"message": f"Invalid item ID: {item_id}"}), 400
        
        result = todolist_service.bulk_mark_purchased(item_ids)
        
        return jsonify({
            "message": f"Marked {result} items as purchased",
            "updated_count": result
        }), 200
        
    except Exception as e:
        return jsonify({"message": f"Error bulk completing items: {str(e)}"}), 500