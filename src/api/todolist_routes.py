from flask import Blueprint, jsonify, request, render_template
from services.todolist_service import TodolistService
from config.settings import get_config
from bson import ObjectId

todolist_bp = Blueprint('todolist', __name__)
config = get_config()
todolist_service = TodolistService(config['MONGO_URI'])

@todolist_bp.route('/todolist/insert', methods=['POST'])
def todolist_insert():
    """API per inserire un nuovo elemento nella todolist"""
    documents = request.json
    todolist_service.insert_item(
        documents['item_name'], 
        documents['quantity'], 
        documents['store'], 
        documents['timestamp']
    )
    return jsonify({"message": "Inserted"}), 201

@todolist_bp.route('/todolist/today', methods=['GET'])
def todolist_today():
    """API per ottenere gli elementi di oggi dalla todolist"""
    docs = todolist_service.read_today()
    return jsonify(docs), 200

@todolist_bp.route('/todolist/delete/<item_id>', methods=['DELETE'])
def todolist_delete(item_id):
    """API per eliminare un elemento dalla todolist"""
    if not ObjectId.is_valid(item_id):
        return jsonify({"message": "Invalid item ID"}), 400
    
    res = todolist_service.delete_item(item_id)
    if res.get("deleted_count", 0) > 0:
        return jsonify(res), 200
    return jsonify(res), 404

@todolist_bp.route('/todolist/update/<start_timestamp>/<end_timestamp>', methods=['GET'])
def todolist_search_by_timestamp(start_timestamp, end_timestamp):
    """API per cercare elementi per range di timestamp"""
    try:
        docs = todolist_service.range_timestamp(start_timestamp, end_timestamp)
        if not docs:
            return jsonify({"message": "Nessun elemento trovato."}), 404
        return jsonify(docs), 200
    except Exception as e:
        return jsonify({"message": f"Error: {e}"}), 500

@todolist_bp.route('/lista-spesa', methods=['GET'])
def lista_spesa_page():
    """Pagina per visualizzare la lista spesa"""
    return render_template("index-lista.html"), 200