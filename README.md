# Temperature and Humidity Charts

This project provides a web interface to visualize temperature and humidity data using charts. It features interactive charts for temperature and humidity, and dynamically displays icons based on the current weather conditions and time of day.


## Features

- **Interactive Charts**: Displays temperature and humidity data over time using Chart.js.
- **Dynamic Icons**: Shows icons representing the current weather (sun/moon) and temperature (hot/cold).
- **Responsive Design**: Optimized for various screen sizes.

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

