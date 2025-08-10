# Temperature and Humidity Charts
<img width="1359" height="383" alt="image" src="https://github.com/user-attachments/assets/e6e1fb7b-50d1-43c9-9956-43c9b8c6990c" />
<img width="1201" height="396" alt="image" src="https://github.com/user-attachments/assets/d8531d3a-f611-41a7-90b5-4d08b6210411" />


This project provides a web interface to visualize temperature and humidity data using charts. It features interactive charts for temperature and humidity, and dynamically displays icons based on the current weather conditions and time of day.


## Features

- **Interactive Charts**: Displays temperature and humidity data over time using Chart.js.
- **Dynamic Icons**: Shows icons representing the current weather (sun/moon) and temperature (hot/cold).
- **Responsive Design**: Optimized for various screen sizes.

<img width="1127" height="918" alt="image" src="https://github.com/user-attachments/assets/87571d64-7566-4aca-b2f9-82df708ed544" />
<img width="1021" height="922" alt="image" src="https://github.com/user-attachments/assets/37352015-b840-41da-b9c6-b26efb12a769" />


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
