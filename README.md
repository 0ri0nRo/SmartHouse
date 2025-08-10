# Smart House Project
<img width="1359" height="383" alt="image" src="https://github.com/user-attachments/assets/e6e1fb7b-50d1-43c9-9956-43c9b8c6990c" />
<img width="1201" height="396" alt="image" src="https://github.com/user-attachments/assets/d8531d3a-f611-41a7-90b5-4d08b6210411" />


This project provides a web interface to visualize temperature and humidity data using charts. It features interactive charts for temperature and humidity, and dynamically displays icons based on the current weather conditions and time of day.


## Features

- **Interactive Charts**: Displays temperature and humidity data over time using Chart.js.
- **Dynamic Icons**: Shows icons representing the current weather (sun/moon) and temperature (hot/cold).
- **Responsive Design**: Optimized for various screen sizes.

# Temperature and Humidity Charts
<img width="1127" height="918" alt="image" src="https://github.com/user-attachments/assets/87571d64-7566-4aca-b2f9-82df708ed544" />
<img width="1021" height="922" alt="image" src="https://github.com/user-attachments/assets/37352015-b840-41da-b9c6-b26efb12a769" />

# Raspberry Pi info with backup and SSH Connection 
<img width="1159" height="901" alt="image" src="https://github.com/user-attachments/assets/b55718af-606b-4474-a961-7b2764814f56" />


## Prerequisites

Before running this project, ensure you have the following installed:

- [Docker](https://www.docker.com/get-started)
- [Docker Compose](https://docs.docker.com/compose/install/)

## Project Structure

- **`Dockerfile`**: Defines the Docker image for the project.
- **`docker-compose.yml`**: Configures the Docker services and networking.
- **`app/`**: Contains the HTML and JavaScript files for the web interface.
- **`index.html`**: The main HTML file for the web application.

## Running the Project with Docker

1. **Clone the Repository**

   ```bash
   git clone https://github.com/0ri0nRo/SmartHouse.git
   ```
## Build and Run the Docker Container

Use Docker Compose to build and start the container. This command will also start any dependencies defined in the `docker-compose.yml` file.

```bash
docker-compose up -d --build

# To backup your data in postgres docker
sudo src/backup.sh 
```
This command will:

- Build the Docker image as defined in the Dockerfile.
- Create and start a container based on the built image.
- Expose the application on port 5000.

## Restoring the SQL Backup

If you need to restore your PostgreSQL database from a `.sql` backup file, follow these steps:

### 1. Copy the Backup File into the Docker Container

First, ensure the backup file (e.g., `backup.sql`) is located in the `src` directory. Then, use the following `docker cp` command to copy it into the PostgreSQL container:

```bash
docker cp ./src/backup.sql <container_id>:/backup.sql
```

### 2. Restore the Backup in PostgreSQL
After copying the backup file into the container, you can restore it using the following command:

```bash
docker exec -i <container_id> psql -U postgres -d <YOUR_DATABASE> -f /backup.sql
```


<## Directory Structure

```
smart_home_dashboard/
├── app.py                          # Main Flask application
├── config.py                       # Configuration settings
├── requirements.txt                # Python dependencies
├── .env.example                    # Environment variables example
├── README.md                       # Project documentation
│
├── database/                       # Database handlers
│   ├── __init__.py
│   ├── postgres_handler.py         # PostgreSQL operations
│   └── mongo_handler.py            # MongoDB operations
│
├── services/                       # Business logic services
│   ├── __init__.py
│   ├── email_service.py            # Email functionality
│   ├── network_service.py          # Network scanning
│   ├── google_sheets_service.py    # Google Sheets integration
│   └── train_service.py            # Train information
│
├── routes/                         # API route blueprints
│   ├── __init__.py
│   ├── sensors.py                  # Temperature/Humidity routes
│   ├── devices.py                  # Network device routes
│   ├── air_quality.py              # Air quality routes
│   ├── trains.py                   # Train information routes
│   ├── security.py                 # Security system routes
│   ├── todo.py                     # Todo list routes
│   ├── system.py                   # System management routes
│   ├── expenses.py                 # Expense tracking routes
│   └── pages.py                    # Web page routes
│
├── utils/                          # Utility modules
│   ├── __init__.py
│   ├── json_encoder.py             # Custom JSON encoder
│   └── decorators.py               # Common decorators
│
├── templates/                      # HTML templates
│   ├── index.html
│   ├── expenses.html
│   ├── temperature.html
│   ├── umid.html
│   ├── train.html
│   ├── air_quality.html
│   ├── raspi.html
│   ├── security.html
│   └── index-lista.html
│
├── static/                         # Static files
│   ├── css/
│   ├── js/
│   ├── images/
│   └── favicon.ico
│
├── migrations/                     # Database migrations
│   └── init_tables.sql
│
└── tests/                          # Unit tests
    ├── __init__.py
    ├── test_app.py
    ├── test_services.py
    └── test_routes.py
```

## Key Improvements Made

### 1. **Modular Architecture**
- Separated concerns into distinct modules
- Each route group has its own blueprint
- Services contain business logic
- Database operations are centralized

### 2. **Configuration Management**
- All environment variables centralized in `config.py`
- Multiple environment support (dev, prod, test)
- Type conversion and validation

### 3. **Error Handling**
- Consistent error handling with decorators
- Proper logging throughout the application
- Database connection error handling
- Input validation

### 4. **Code Organization**
- Following Flask best practices
- Application factory pattern
- Blueprint registration
- Service layer pattern

### 5. **Maintainability**
- Clear separation of concerns
- Consistent naming conventions
- Comprehensive logging
- Easy to test and extend

## Setup Instructions

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Environment Configuration
```bash
cp .env.example .env
# Edit .env with your configuration
```

### 3. Database Setup
```bash
# Run database migrations
python -c "from app import create_app; app = create_app(); app.postgres_handler.create_all_tables()"
```

### 4. Run Application
```bash
# Development
python app.py

# Production
gunicorn -w 4 -b 0.0.0.0:5000 "app:create_app()"
```

## Benefits of Refactoring

1. **Scalability**: Easy to add new features and routes
2. **Maintainability**: Clear code structure and separation of concerns
3. **Testability**: Each component can be tested independently
4. **Reusability**: Services can be reused across different routes
5. **Error Handling**: Consistent error handling and logging
6. **Configuration**: Centralized configuration management
7. **Performance**: Better resource management and connection pooling

## Requirements.txt

```text
Flask==2.3.3
Flask-CORS==4.0.0
psycopg2-binary==2.9.7
pymongo==4.5.0
python-nmap==0.7.1
psutil==5.9.5
paramiko==3.3.1
python-dotenv==1.0.0
redis==4.6.0
requests==2.31.0
google-api-python-client==2.100.0
google-auth==2.23.0
google-auth-oauthlib==1.1.0
google-auth-httplib2==0.1.1
```

## Environment Variables (.env.example)

```bash
# Flask Configuration
FLASK_DEBUG=False
SECRET_KEY=your-secret-key-here

# Database Configuration
DB_HOST=localhost
DB_DATABASE=smart_home
DB_USER=postgres
DB_PASSWORD=your-db-password

# MongoDB Configuration
MONGO_URI=mongodb://localhost:27017/

# Email Configuration
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
EMAIL_USERNAME=your-email@gmail.com
EMAIL_PASSWORD=your-app-password

# Google Sheets Configuration
GOOGLE_CREDENTIALS_PATH=./gcredentials.json
GOOGLE_SHEET_NAME=My NW

# Raspberry Pi SSH Configuration
HOST_PI=192.168.1.100
PORT_PI=22
USERNAME_PI=pi

# Redis Configuration
REDIS_HOST=redis
REDIS_PORT=6379

# Network Configuration
NETWORK_RANGE=192.168.178.0/24

# System Configuration
BACKUP_SCRIPT_PATH=/usr/local/bin/backup.sh

# Train API Configuration
TRAIN_API_URL=https://iechub.rfi.it/ArriviPartenze/ArrivalsDepartures/Monitor?placeId=2416&arrivals=False
```

## Migration Script (migrations/init_tables.sql)

```sql
-- Create sensor readings table
CREATE TABLE IF NOT EXISTS sensor_readings (
    id SERIAL PRIMARY KEY,
    temperature_c DECIMAL(5,2) NOT NULL,
    humidity DECIMAL(5,2) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create network devices table
CREATE TABLE IF NOT EXISTS network_devices (
    id SERIAL PRIMARY KEY,
    ip_address VARCHAR(45) NOT NULL,
    hostname VARCHAR(255),
    status VARCHAR(50),
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create trains table
CREATE TABLE IF NOT EXISTS trains (
    id SERIAL PRIMARY KEY,
    train_number VARCHAR(50),
    destination TEXT,
    time TIME,
    delay INTEGER,
    platform VARCHAR(10),
    stops TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create air quality table
CREATE TABLE IF NOT EXISTS air_quality (
    id SERIAL PRIMARY KEY,
    smoke DECIMAL(10,2) NOT NULL,
    lpg DECIMAL(10,2) NOT NULL,
    methane DECIMAL(10,2) NOT NULL,
    hydrogen DECIMAL(10,2) NOT NULL,
    air_quality_index DECIMAL(10,2) NOT NULL,
    air_quality_description VARCHAR(100) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create alarms status table
CREATE TABLE IF NOT EXISTS alarms_status (
    id SERIAL PRIMARY KEY,
    status BOOLEAN NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_sensor_readings_timestamp ON sensor_readings(timestamp);
CREATE INDEX IF NOT EXISTS idx_network_devices_timestamp ON network_devices(timestamp);
CREATE INDEX IF NOT EXISTS idx_trains_time ON trains(time);
CREATE INDEX IF NOT EXISTS idx_trains_destination ON trains(destination);
CREATE INDEX IF NOT EXISTS idx_air_quality_timestamp ON air_quality(timestamp);
CREATE INDEX IF NOT EXISTS idx_alarms_status_timestamp ON alarms_status(timestamp);
```

## Docker Configuration (docker-compose.yml)

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "5000:5000"
    environment:
      - FLASK_ENV=production
    env_file:
      - .env
    depends_on:
      - postgres
      - redis
      - mongo
    volumes:
      - ./gcredentials.json:/app/gcredentials.json:ro
      - ./backup.sh:/usr/local/bin/backup.sh:ro

  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: ${DB_DATABASE}
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./migrations/init_tables.sql:/docker-entrypoint-initdb.d/init_tables.sql
    ports:
      - "5432:5432"

  mongo:
    image: mongo:6
    volumes:
      - mongo_data:/data/db
    ports:
      - "27017:27017"

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"

volumes:
  postgres_data:
  mongo_data:
  redis_data:
```

## Dockerfile

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    nmap \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create non-root user
RUN useradd -m -u 1000 app && chown -R app:app /app
USER app

# Expose port
EXPOSE 5000

# Run application
CMD ["python", "app.py"]
```

## Testing Setup (tests/test_app.py)

```python
import unittest
from app import create_app
from config import TestingConfig

class FlaskAppTestCase(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.app.config.from_object(TestingConfig)
        self.client = self.app.test_client()
        self.app_context = self.app.app_context()
        self.app_context.push()

    def tearDown(self):
        self.app_context.pop()

    def test_index_route(self):
        response = self.client.get('/')
        self.assertEqual(response.status_code, 200)

    def test_api_sensors_no_data(self):
        response = self.client.get('/api/sensors')
        self.assertIn(response.status_code, [200, 404])

if __name__ == '__main__':
    unittest.main()
```

## Usage Examples

### Starting the Application
```python
from app import create_app

# Create and run the application
app = create_app()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
```

### Adding New Routes
```python
# Create new blueprint in routes/new_feature.py
from flask import Blueprint

new_feature_bp = Blueprint('new_feature', __name__)

@new_feature_bp.route('/new_endpoint')
def new_endpoint():
    return jsonify({'message': 'New feature'})

# Register in app.py
from routes.new_feature import new_feature_bp
app.register_blueprint(new_feature_bp, url_prefix='/api')
```

### Adding New Services
```python
# Create service in services/new_service.py
class NewService:
    def __init__(self, db_handler):
        self.db = db_handler
    
    def do_something(self):
        # Business logic here
        pass

# Initialize in app.py
app.new_service = NewService(app.postgres_handler)
```

This refactored structure provides a much more maintainable, scalable, and professional codebase while preserving all the original functionality.>