import requests
from bs4 import BeautifulSoup
import psycopg2
from psycopg2 import Error
from datetime import datetime

class TrainScraper:
    def __init__(self, url, db_config):
        self.url = url
        self.db_config = db_config

    def fetch_data(self):
        """
        Effettua la richiesta HTTP all'URL fornito e restituisce il contenuto HTML.

        Returns:
        str: Il contenuto HTML della pagina.
        """
        response = requests.get(self.url)
        if response.status_code == 200:
            return response.text
        else:
            raise Exception(f"Request error: {response.status_code}")

    def parse_trains(self, station_name):
        """
        Extracts the trains that stop at a given station.

        Args:
        station_name (str): Il nome della stazione di interesse.

        Returns:
        dict: A dictionary containing train numbers as keys and train information as values.
        """
        html_content = self.fetch_data()
        soup = BeautifulSoup(html_content, 'html.parser')

        trains = {}

        # Select all rows containing trains
        rows = soup.select('tbody tr')

        for row in rows:
            try:
                # Estraiamo le informazioni dalla tabella
                train_number = row.find(id="RTreno").text.strip()
                destination = row.find(id="RStazione").text.strip()
                time = row.find(id="ROrario").text.strip()
                delay = row.find(id="RRitardo").text.strip()
                platform = row.find(id="RBinario").text.strip()

                # Estraiamo le fermate successive per verificare se c'è una fermata nella stazione specificata
                fermate_info = row.find("div", class_="testoinfoaggiuntive")
                fermate = fermate_info.text if fermate_info else ""

                # Controlliamo se la stazione di interesse è nelle fermate
                if station_name.upper() in fermate.upper():
                    # Creiamo un dizionario per il treno con le informazioni
                    train_info = {
                        "destinazione": destination,
                        "orario": time,
                        "ritardo": delay,
                        "binario": platform,
                        "fermate": fermate.strip()
                    }
                    # Aggiungiamo o aggiorniamo le informazioni del treno
                    trains[train_number] = train_info

            except AttributeError:
                # Ignora righe che non contengono informazioni complete
                continue

        return trains

    def save_trains_to_db(self, trains):
        """Save trains to the database."""
        try:
            # Database connection
            connection = psycopg2.connect(**self.db_config)
            cursor = connection.cursor()

            now = datetime.now()
            today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

            # Delete the previous day's trains
            cursor.execute("DELETE FROM trains WHERE timestamp < %s", (today_start,))
            connection.commit()

            # Query to insert trains
            query = """
            INSERT INTO trains (train_number, destination, time, delay, platform, stops, timestamp)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """
            for train_number, info in trains.items():
                values = (
                    train_number,
                    info['destinazione'],
                    info['orario'],
                    info['ritardo'],
                    info['binario'],
                    info['fermate'],
                    now
                )
                cursor.execute(query, values)

            connection.commit()
            print("Trains inserted into the database.")
            cursor.close()
            connection.close()
        
        except Error as e:
            print(f"Error inserting train data: {e}")
