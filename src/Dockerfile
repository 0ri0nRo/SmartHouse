FROM python:3.12-slim

WORKDIR /app

# system dependencies
RUN apt-get update && apt-get install -y \
    postgresql-client \
    gcc \
    libffi-dev \
    libpq-dev \
    nmap \
    arp-scan \
    iputils-ping \
    && rm -rf /var/lib/apt/lists/*

# upgrade pip
RUN pip install --upgrade pip

# requirements first (cache friendly)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

RUN mkdir -p /backup && chmod 777 /backup
COPY backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh
# app code
COPY . .

EXPOSE 5000

CMD ["python", "app.py"]