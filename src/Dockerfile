FROM python:3.12-alpine

# Set the working directory
WORKDIR /app

# Install system dependencies for building Python packages
RUN apk add --no-cache \
    gcc \
    musl-dev \
    python3-dev \
    linux-headers \
    libffi-dev \
    postgresql-dev \
    postgresql-client \
    nmap

# Upgrade pip
RUN pip install --upgrade pip
RUN mkdir -p /backup && chmod 777 /backup

# Copy and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backup script
COPY backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh

# Copy the rest of the code
COPY . .

# Expose port if needed (e.g., for Flask)
EXPOSE 5000

# Command to run the app
CMD ["python", "app.py"]