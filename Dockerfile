# Usa un'immagine di base Python
FROM python:3.9-slim

# Imposta la directory di lavoro
WORKDIR /app

# Copia i file dei requisiti e installa le dipendenze
COPY src/requirements.txt requirements.txt
RUN pip install -r requirements.txt

# Copia il resto del codice
COPY src/ .

# Esponi la porta su cui l'app è in ascolto
EXPOSE 5000

# Comando per avviare l'app
CMD ["python", "app.py"]
