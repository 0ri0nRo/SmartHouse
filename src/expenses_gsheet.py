import os
import gspread
from oauth2client.service_account import ServiceAccountCredentials
from datetime import datetime
import calendar
import json

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
    """
    SheetValueFetcher is a helper class to safely access and cache
    the value of cell P48 in a Google Sheet.

    Features:
    - Authenticates via Google credentials
    - Accesses the worksheet of the current year
    - Reads and writes a local cache (JSON file)
    """

    CACHE_FILE = "p48_cache.json"

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
        Returns the cached value from the JSON file, or None if not available.
        If the file doesn't exist, it creates an empty one with null value.
        """
        if not os.path.exists(self.CACHE_FILE):
            print("Cache file not found, creating a new one.")
            self._update_cache(None)
            return None

        try:
            with open(self.CACHE_FILE, "r") as f:
                data = json.load(f)
                return data.get("value")
        except (json.JSONDecodeError, IOError) as e:
            print(f"Error reading cache file: {e}")
            return None

    def _update_cache(self, value):
        """
        Update the cache file with a new value.
        """
        try:
            with open(self.CACHE_FILE, "w") as f:
                json.dump({"value": value}, f)
            print(f"Cache updated with value: {value}")
        except Exception as e:
            print(f"Error saving cache: {e}")

    def get_cell_value_p48(self):
        """
        Fetch the value from cell P48 of the current year's worksheet
        and update the local cache.
        """
        current_year = datetime.now().year
        summary_sheet_name = f"{current_year}"

        try:
            worksheet = self.sheet.worksheet(summary_sheet_name)
        except gspread.WorksheetNotFound:
            raise ValueError(f"Worksheet '{summary_sheet_name}' not found in spreadsheet.")

        try:
            value = worksheet.acell("P48").value
            self._update_cache(value)
            print(f"Value updated from P48 ({summary_sheet_name}): {value}")
            return value
        except gspread.exceptions.CellNotFound:
            raise ValueError("Cell P48 not found.")