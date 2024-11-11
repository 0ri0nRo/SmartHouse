# Usa un'immagine base di Python
FROM python:3.9

# Imposta la directory di lavoro all'interno del contenitore
WORKDIR /app

# Installa nmap
RUN apt-get update && apt-get install -y nmap

# Copia il file requirements.txt nella directory di lavoro
COPY requirements.txt requirements.txt

# Installa le dipendenze
RUN pip install -r requirements.txt

# Copia tutto il contenuto della directory corrente nella directory di lavoro del contenitore
COPY . .

# Comando per eseguire l'app quando il contenitore parte
CMD ["python", "app.py"]