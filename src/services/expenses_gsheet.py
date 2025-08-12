import os
import gspread
from oauth2client.service_account import ServiceAccountCredentials
from datetime import datetime
import calendar
import json
import redis

class GoogleSheetExpenseManager:
    def __init__(self, credentials_path, sheet_name):
        self.scope = [
            "https://spreadsheets.google.com/feeds",
            "https://www.googleapis.com/auth/drive"
        ]
        self.credentials_path = credentials_path
        self.sheet_name = sheet_name
        self.client = self._authenticate()
        self.sheet = self.client.open(self.sheet_name)

    def _authenticate(self):
        creds = ServiceAccountCredentials.from_json_keyfile_name(self.credentials_path, self.scope)
        return gspread.authorize(creds)

    def _get_month_worksheet(self, date_str):
        """
        Given a date in 'YYYY-MM-DD' format, returns the worksheet named with the month abbreviation (e.g., 'Jul').
        """
        date_obj = datetime.strptime(date_str, "%Y-%m-%d")
        month_abbr = calendar.month_abbr[date_obj.month]  # 'Jan', 'Feb', ..., 'Dec'
        try:
            return self.sheet.worksheet(month_abbr)
        except gspread.WorksheetNotFound:
            raise ValueError(f"Worksheet '{month_abbr}' not found in spreadsheet.")

    def add_expense(self, name, date, amount, category):
        """
        Add an expense to the correct month's worksheet.
        :param name: Description of the expense
        :param date: Date in 'YYYY-MM-DD' format
        :param amount: Numeric amount (float or string with decimal comma)
        :param category: Category like 'Groceries', 'Housing', etc.
        """
        ws = self._get_month_worksheet(date)
        day = datetime.strptime(date, "%Y-%m-%d").day

        eur = float(amount)

        new_row = [name, day, eur, '', eur, category]

        col_a_values = ws.col_values(1)
        first_empty_row = len(col_a_values) + 1

        cell_range = f"A{first_empty_row}:F{first_empty_row}"
        ws.update(cell_range, [new_row])
        print(f"Expense '{name}' added to sheet '{ws.title}' on row {first_empty_row}")

    def get_summary_expenses(self, summary_sheet_name="2025 Expenses"):
        """
        Extracts data from the summary worksheet (e.g., '2025 Expenses') and returns a dictionary
        with expenses per category and month, including total and average.
        Only predefined categories are considered.
        """
        valid_categories = {
            "Housing", "Leisure", "Health", "Transport", "University", "Bar", "Clothing",
            "Groceries", "Gifts", "Fees", "Bills", "Buoni pasto", "Other", "Restaurants", "Vacation"
        }

        try:
            ws = self.sheet.worksheet(summary_sheet_name)
        except gspread.WorksheetNotFound:
            raise ValueError(f"Worksheet '{summary_sheet_name}' not found in spreadsheet.")

        all_values = ws.get_all_values()
        if not all_values or len(all_values) < 2:
            raise ValueError("Worksheet is empty or lacks sufficient data.")

        headers = all_values[0]  # Month names and Total/Average
        data_rows = all_values[1:]

        summary = {}

        for row in data_rows:
            if len(row) < 15:
                continue  # Skip incomplete or malformed rows

            category = row[0]
            if category not in valid_categories:
                continue  # Skip invalid categories

            try:
                monthly_data = row[1:13]  # Jan to Dec
                total = row[13]
                average = row[14]

                summary[category] = {
                    "monthly": {
                        headers[i + 1]: float(monthly_data[i]) if monthly_data[i] else 0.0
                        for i in range(12)
                    },
                    "total": float(total) if total else 0.0,
                    "average": float(average) if average else 0.0
                }
            except (ValueError, IndexError) as e:
                print(f"⚠️ Skipped row '{row}' due to parsing error: {e}")
                continue

        return summary


class SheetValueFetcher:
    CACHE_KEY = "p48_value"  # chiave per Redis

    def __init__(self, credentials_path, sheet_name, redis_host='localhost', redis_port=6379):
        self.scope = [
            "https://spreadsheets.google.com/feeds",
            "https://www.googleapis.com/auth/drive"
        ]
        self.credentials_path = credentials_path
        self.sheet_name = sheet_name
        self.client = self._authenticate()
        self.sheet = self.client.open(self.sheet_name)

        # Connessione a Redis
        self.redis_client = redis.Redis(host=redis_host, port=redis_port, decode_responses=True)

    def _authenticate(self):
        """
        Authenticate the application with Google using the JSON credentials file.
        """
        creds = ServiceAccountCredentials.from_json_keyfile_name(
            self.credentials_path,
            self.scope
        )
        return gspread.authorize(creds)

    def get_cached_value(self):
        """
        Recupera il valore dalla cache Redis, oppure None se non esiste.
        """
        try:
            value = self.redis_client.get(self.CACHE_KEY)
            return value
        except redis.RedisError as e:
            print(f"Errore Redis get: {e}")
            return None

    def _update_cache(self, value):
        """
        Aggiorna il valore in Redis.
        """
        try:
            # Imposta il valore con TTL, ad esempio 10 minuti (600 secondi)
            self.redis_client.set(self.CACHE_KEY, value, ex=600)
            print(f"Cache Redis aggiornata con valore: {value}")
        except redis.RedisError as e:
            print(f"Errore Redis set: {e}")

    def get_cell_value_p48(self):
        current_year = datetime.now().year
        summary_sheet_name = f"{current_year}"

        try:
            worksheet = self.sheet.worksheet(summary_sheet_name)
        except gspread.WorksheetNotFound:
            raise ValueError(f"Worksheet '{summary_sheet_name}' non trovata.")

        try:
            value = worksheet.acell("P48").value
            self._update_cache(value)
            print(f"Valore aggiornato da P48 ({summary_sheet_name}): {value}")
            return value
        except gspread.exceptions.CellNotFound:
            raise ValueError("Cell P48 non trovata.")
