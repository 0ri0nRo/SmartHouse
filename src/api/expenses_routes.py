from flask import Blueprint, jsonify, request, render_template
import os
from models.database import handle_db_error
from services.expenses_gsheet import GoogleSheetExpenseManager, SheetValueFetcher
from config.settings import get_config

# Blueprint for expense-related endpoints
expense_bp = Blueprint('expense', __name__)
config = get_config()

# Google Sheets expense manager
manager = GoogleSheetExpenseManager(config['CREDENTIALS_PATH'], config['SHEET_NAME'])


@expense_bp.route('/api/expenses', methods=['POST', 'GET'])
@handle_db_error
def api_expenses():
    """
    API endpoint to manage expenses.

    POST:
        - Adds a new expense to the Google Sheet.
        - Requires JSON body with:
            - description (str)
            - date (str)
            - amount (float or str)
            - category (str)
        - Returns a success message if inserted.

    GET:
        - Returns a summary of expenses from the Google Sheet.
    """
    if request.method == 'POST':
        try:
            data = request.get_json()
            description = data.get('description')
            date = data.get('date')
            amount = data.get('amount')
            category = data.get('category')
            
            # Validate required fields
            if not all([description, date, amount, category]):
                return jsonify({"error": "Missing fields"}), 400
            
            manager.add_expense(description, date, amount, category)
            return jsonify({"message": "Expense added"}), 201
        except ValueError as e:
            return jsonify({"error": str(e)}), 404
    
    else:  # GET request
        try:
            summary = manager.get_summary_expenses()
            return jsonify(summary), 200
        except ValueError as e:
            return jsonify({"error": str(e)}), 404


@expense_bp.route('/api/p48', methods=['GET'])
@handle_db_error
def api_p48():
    """
    API endpoint to fetch the value of cell P48 from a Google Sheet.

    - Returns both the cached value (from Redis) and the live value (directly from Google Sheets).
    - Live value retrieval may fail if Google API is unavailable, in which case only cached data is returned.
    """
    try:
        fetcher = SheetValueFetcher(
            credentials_path=config['CREDENTIALS_PATH'],
            sheet_name="My NW",
            redis_host=config['REDIS_HOST'],
            redis_port=config['REDIS_PORT']
        )
        
        # Get cached value from Redis
        cached = fetcher.get_cached_value()
        
        # Try to get live value from Google Sheets
        try:
            live_value = fetcher.get_cell_value_p48()
            live_value = float(live_value.replace(",", "."))
        except Exception:
            live_value = None
        
        response = {
            "cached_value": float(cached.replace(",", ".")) if cached else None,
            "P48_value": live_value
        }
        
        return jsonify(response), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@expense_bp.route('/expenses')
def page_expenses():
    """Renders the expenses management HTML page."""
    return render_template('expenses.html')
