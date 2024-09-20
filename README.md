# Temperature and Humidity Charts
<img width="1680" alt="Screenshot 2024-09-20 at 21 30 03" src="https://github.com/user-attachments/assets/9c1e88c6-ed1d-4128-927f-3bc9e1a29067">
<img width="1675" alt="Screenshot 2024-09-20 at 21 29 58" src="https://github.com/user-attachments/assets/d5cb9349-3d1a-48fd-85a8-10da778b51e7">


This project provides a web interface to visualize temperature and humidity data using charts. It features interactive charts for temperature and humidity, and dynamically displays icons based on the current weather conditions and time of day.


## Features

- **Interactive Charts**: Displays temperature and humidity data over time using Chart.js.
- **Dynamic Icons**: Shows icons representing the current weather (sun/moon) and temperature (hot/cold).
- **Responsive Design**: Optimized for various screen sizes.

<img width="1680" alt="Screenshot 2024-09-20 at 21 30 10" src="https://github.com/user-attachments/assets/6757fbcf-9e97-489f-a08d-951fe0200b58">


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
