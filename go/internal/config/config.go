package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"time"
)

type Config struct {
	Host              string
	Port              int
	StaticDir         string
	SunMoonLat        float64
	SunMoonLon        float64
	RedisHost         string
	RedisPort         int
	PostgresDSN       string
	MongoURI          string
	ReceiptServiceURL string
	CalendarCredsPath string
	CalendarTokenPath string
	CalendarID        string
	ShellyIP          string
	ReadTimeout       time.Duration
	WriteTimeout      time.Duration
	IdleTimeout       time.Duration
	AllowedOrigin     string
	AllowedMethods    string
	AllowedHeaders    string
	MaxHeaderBytes    int
	EnableRequestLogs bool
}

func Load() (Config, error) {
	port, err := intEnv("PORT", 5000)
	if err != nil {
		return Config{}, err
	}

	staticDir := getenv("STATIC_DIR", filepath.Join("src", "static", "react"))

	return Config{
		Host:              getenv("HOST", "0.0.0.0"),
		Port:              port,
		StaticDir:         staticDir,
		SunMoonLat:        float64Env("HOME_LAT", 41.7276),
		SunMoonLon:        float64Env("HOME_LON", 13.3681),
		RedisHost:         getenv("REDIS_HOST", "redis"),
		RedisPort:         intEnvOrDefault("REDIS_PORT", 6379),
		PostgresDSN:       getenv("PG_DSN", ""),
		MongoURI:          getenv("MONGO_URI", ""),
		ReceiptServiceURL: getenv("RECEIPT_SERVICE_URL", ""),
		CalendarCredsPath: getenv("CREDENTIALS_PATH", filepath.Join("src", "credentials", "gcredentials.json")),
		CalendarTokenPath: getenv("CALENDAR_TOKEN_PATH", filepath.Join("uploads", "gcalendar_token.json")),
		CalendarID:        getenv("CALENDAR_ID", "alexandruandrei659.aa@gmail.com"),
		ShellyIP:          getenv("SHELLY_IP", "192.168.178.165"),
		ReadTimeout:       durationEnv("READ_TIMEOUT", 10*time.Second),
		WriteTimeout:      durationEnv("WRITE_TIMEOUT", 10*time.Second),
		IdleTimeout:       durationEnv("IDLE_TIMEOUT", 60*time.Second),
		AllowedOrigin:     getenv("CORS_ALLOWED_ORIGIN", "*"),
		AllowedMethods:    getenv("CORS_ALLOWED_METHODS", "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS"),
		AllowedHeaders:    getenv("CORS_ALLOWED_HEADERS", "Content-Type,Authorization"),
		MaxHeaderBytes:    1 << 20,
		EnableRequestLogs: getenv("REQUEST_LOGS", "false") == "true",
	}, nil
}

func Address(host string, port int) string {
	return fmt.Sprintf("%s:%d", host, port)
}

func (c Config) HomeLat() float64 {
	return c.SunMoonLat
}

func (c Config) HomeLon() float64 {
	return c.SunMoonLon
}

func getenv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func intEnv(key string, fallback int) (int, error) {
	value := os.Getenv(key)
	if value == "" {
		return fallback, nil
	}

	parsed, err := strconv.Atoi(value)
	if err != nil {
		return 0, fmt.Errorf("parse %s: %w", key, err)
	}

	return parsed, nil
}

func intEnvOrDefault(key string, fallback int) int {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}

	return parsed
}

func float64Env(key string, fallback float64) float64 {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return fallback
	}

	return parsed
}

func durationEnv(key string, fallback time.Duration) time.Duration {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	parsed, err := time.ParseDuration(value)
	if err != nil {
		return fallback
	}

	return parsed
}
