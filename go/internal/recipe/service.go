package recipe

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"
)

type Service struct {
	client     *http.Client
	mu         sync.Mutex
	cachedDate string
	cachedMeal map[string]any
}

func New() *Service {
	return &Service{client: &http.Client{Timeout: 10 * time.Second}}
}

func (s *Service) GetDailyRecipe() (map[string]any, error) {
	today := time.Now().Format("2006-01-02")
	s.mu.Lock()
	if s.cachedMeal != nil && s.cachedDate == today {
		cached := s.cachedMeal
		s.mu.Unlock()
		return cached, nil
	}
	s.mu.Unlock()

	url := "https://www.themealdb.com/api/json/v1/1/random.php"
	resp, err := s.client.Get(url)
	if err != nil {
		return nil, fmt.Errorf("fetch recipe: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("recipe api: status %d", resp.StatusCode)
	}
	var parsed map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return nil, fmt.Errorf("decode recipe: %w", err)
	}
	if meals, ok := parsed["meals"].([]any); ok && len(meals) > 0 {
		if m, ok := meals[0].(map[string]any); ok {
			s.mu.Lock()
			s.cachedMeal = m
			s.cachedDate = today
			s.mu.Unlock()
			return m, nil
		}
	}
	return nil, fmt.Errorf("recipe not found in response")
}
