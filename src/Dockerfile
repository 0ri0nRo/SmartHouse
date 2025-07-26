# Use a base Python image
FROM python:3.12-alpine

# Set the working directory inside the container
WORKDIR /app

# Install system packages required for building native libraries like psycopg2
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    nmap \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

# Upgrade pip to the latest version
RUN pip install --upgrade pip

# Copy requirements.txt and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy all contents of the current directory into the working directory
COPY . .

# Expose the app port if necessary (useful for Flask server)
EXPOSE 5000

# Command to run the application
CMD ["python", "app.py"]
