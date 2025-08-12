from flask import Blueprint, jsonify, request, render_template
from services.todolist_service import TodolistService
from config.settings import get_config
from bson import ObjectId

todolist_bp = Blueprint('todolist', __name__)
config = get_config()
todolist_service = TodolistService(config['MONGO_URI'])


@todolist_bp.route('/todolist/insert', methods=['POST'])
def todolist_insert():
    """API to insert a new item into the todolist."""
    documents = request.json
    todolist_service.insert_item(
        documents['item_name'], 
        documents['quantity'], 
        documents['store'], 
        documents['timestamp']
    )
    return jsonify({"message": "Item inserted"}), 201


@todolist_bp.route('/todolist/today', methods=['GET'])
def todolist_today():
    """API to get today’s items from the todolist."""
    docs = todolist_service.read_today()
    return jsonify(docs), 200


@todolist_bp.route('/todolist/delete/<item_id>', methods=['DELETE'])
def todolist_delete(item_id):
    """API to delete an item from the todolist."""
    if not ObjectId.is_valid(item_id):
        return jsonify({"message": "Invalid item ID"}), 400
    
    res = todolist_service.delete_item(item_id)
    if res.get("deleted_count", 0) > 0:
        return jsonify(res), 200
    return jsonify(res), 404


@todolist_bp.route('/todolist/update/<start_timestamp>/<end_timestamp>', methods=['GET'])
def todolist_search_by_timestamp(start_timestamp, end_timestamp):
    """API to search items within a timestamp range."""
    try:
        docs = todolist_service.range_timestamp(start_timestamp, end_timestamp)
        # Se docs è vuoto, ritorna comunque 200 con lista vuota
        return jsonify(docs), 200
    except Exception as e:
        return jsonify({"message": f"Error: {e}"}), 500


@todolist_bp.route('/shopping-list', methods=['GET'])
def shopping_list_page():
    """Page to display the shopping list."""
    return render_template("shopping-list.html"), 200


@todolist_bp.route('/api/shopping-list/history', methods=['GET'])
def shopping_list_history():
    """API per ottenere gli item storici in un intervallo di date."""
    start_timestamp = request.args.get('start')
    end_timestamp = request.args.get('end')

    if not start_timestamp or not end_timestamp:
        return jsonify({"message": "Missing start or end timestamp"}), 400

    try:
        docs = todolist_service.range_timestamp(start_timestamp, end_timestamp)
        if not docs:
            return jsonify({"message": "No items found."}), 404
        return jsonify(docs), 200
    except Exception as e:
        print(f"Error in /api/shopping-list/history: {e}")
        return jsonify({"message": f"Error: {e}"}), 500


@todolist_bp.route('/api/shopping-list/current', methods=['GET'])
def shopping_list_current():
    """API per ottenere tutti gli item attuali."""
    try:
        docs = todolist_service.read_all()
        if not docs:
            return jsonify({"message": "No current items found."}), 404
        return jsonify(docs), 200
    except Exception as e:
        print(f"Error in /api/shopping-list/current: {e}")
        return jsonify({"message": f"Error: {e}"}), 500


@todolist_bp.route('/shopping-list/complete/<item_id>', methods=['POST'])
def mark_item_complete(item_id):
    if not ObjectId.is_valid(item_id):
        return jsonify({"message": "Invalid item ID"}), 400
    try:
        result = todolist_service.mongo.update_document(
            {"_id": ObjectId(item_id)},
            {"purchased": True}
        )
        if result:
            return jsonify({"message": "Item marked as purchased"}), 200
        else:
            return jsonify({"message": "Item not found"}), 404
    except Exception as e:
        return jsonify({"message": f"Error: {e}"}), 500
