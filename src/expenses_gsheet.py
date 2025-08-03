import os
import gspread
from oauth2client.service_account import ServiceAccountCredentials
from datetime import datetime
import calendar

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
        Given a date in format 'YYYY-MM-DD', returns the worksheet named with month abbreviation (e.g., 'Jul')
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
        Estrae i dati dal foglio riepilogativo (es. '2025 expenses') e restituisce un dizionario
        con le spese per categoria e mese, inclusi totale e media.
        Restituisce solo le categorie specificate.
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
            raise ValueError("Worksheet is empty or has insufficient data.")

        headers = all_values[0]  # Month names and Total/Average
        data_rows = all_values[1:]

        summary = {}

        for row in data_rows:
            if len(row) < 15:
                continue  # Skip incomplete or malformed rows

            category = row[0]
            if category not in valid_categories:
                continue  # Skip categories non valide

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

    def get_cell_value_p48(self):
        """
        Recupera il valore dalla cella P48 del foglio '<current_year> Expenses'.
        """
        current_year = datetime.now().year
        summary_sheet_name = f"{current_year}"

        try:
            worksheet = self.sheet.worksheet(summary_sheet_name)
        except gspread.WorksheetNotFound:
            raise ValueError(f"Worksheet '{summary_sheet_name}' not found in spreadsheet.")

        try:
            value = worksheet.acell("P48").value
            print(f"Valore in P48 ({summary_sheet_name}): {value}")
            return value
        except gspread.exceptions.CellNotFound:
            raise ValueError("Cella P48 non trovata.")

# --- Script execution ---
if __name__ == "__main__":
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    credentials_path = os.path.join(BASE_DIR, "gcredentials.json")

    manager = GoogleSheetExpenseManager(
        credentials_path=credentials_path,
        sheet_name="My NW"  # Cambia con il nome reale del tuo Google Sheet
    )

    # Esempio di aggiunta spesa
    manager.add_expense(
        name="ProvaPython",
        date="2025-07-22",
        amount="5",
        category="Fees"
    )
