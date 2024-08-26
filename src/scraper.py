import requests
from bs4 import BeautifulSoup
import json
import os

class TrainScraper:
    def __init__(self, url):
        self.url = url

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
            raise Exception(f"Errore nella richiesta: {response.status_code}")

    def parse_trains(self, station_name):
        """
        Estrae i treni che fermano in una determinata stazione.

        Args:
        station_name (str): Il nome della stazione di interesse.

        Returns:
        dict: Un dizionario contenente i numeri dei treni come chiavi e le informazioni sui treni come valori.
        """
        html_content = self.fetch_data()
        soup = BeautifulSoup(html_content, 'html.parser')

        trains = {}

        # Selezioniamo tutte le righe che contengono i treni
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

    def save_to_json(self, data, filename):
        """
        Salva i dati in un file JSON, aggiornando i dati esistenti.

        Args:
        data (dict): I dati da salvare nel file JSON.
        filename (str): Il percorso del file JSON.
        """
        if os.path.exists(filename):
            # Leggi il contenuto esistente del file
            with open(filename, 'r', encoding='utf-8') as file:
                existing_data = json.load(file)
                # Aggiorna i dati esistenti con i nuovi dati
                existing_data.update(data)
        else:
            # Se il file non esiste, inizializza un dizionario vuoto
            existing_data = data

        # Scrivi i dati aggiornati nel file
        with open(filename, 'w', encoding='utf-8') as file:
            json.dump(existing_data, file, ensure_ascii=False, indent=4)

