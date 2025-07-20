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
        print(f"✅ Expense '{name}' added to sheet '{ws.title}' on row {first_empty_row}")


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
