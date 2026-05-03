package news

import (
	"encoding/xml"
	"fmt"
	"net/http"
	"sync"
	"time"
)

const defaultFeedURL = "https://feeds.bbci.co.uk/news/world/rss.xml"

type Service struct {
	client   *http.Client
	feedURL  string
	ttl      time.Duration
	mu       sync.Mutex
	cachedAt time.Time
	cache    Response
}

type Response struct {
	Items   []Item `json:"items"`
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}

type Item struct {
	Title string `json:"title"`
	Link  string `json:"link"`
	Date  string `json:"date"`
}

type rssFeed struct {
	Channel struct {
		Items []struct {
			Title   string `xml:"title"`
			Link    string `xml:"link"`
			PubDate string `xml:"pubDate"`
		} `xml:"item"`
	} `xml:"channel"`
}

func New() *Service {
	return &Service{
		client:  &http.Client{Timeout: 8 * time.Second},
		feedURL: defaultFeedURL,
		ttl:     10 * time.Minute,
	}
}

func (s *Service) GetNews() (Response, error) {
	now := time.Now()

	s.mu.Lock()
	if !s.cachedAt.IsZero() && now.Sub(s.cachedAt) < s.ttl && len(s.cache.Items) > 0 {
		cached := s.cache
		s.mu.Unlock()
		return cached, nil
	}
	s.mu.Unlock()

	items, err := s.fetch()
	if err != nil {
		return Response{Items: []Item{}, Success: false, Error: err.Error()}, err
	}

	resp := Response{Items: items, Success: true}
	s.mu.Lock()
	s.cache = resp
	s.cachedAt = now
	s.mu.Unlock()

	return resp, nil
}

func (s *Service) fetch() ([]Item, error) {
	resp, err := s.client.Get(s.feedURL)
	if err != nil {
		return nil, fmt.Errorf("fetch rss: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("fetch rss: unexpected status %s", resp.Status)
	}

	var parsed rssFeed
	if err := xml.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return nil, fmt.Errorf("parse rss: %w", err)
	}

	limit := 5
	if len(parsed.Channel.Items) < limit {
		limit = len(parsed.Channel.Items)
	}

	items := make([]Item, 0, limit)
	for i := 0; i < limit; i++ {
		entry := parsed.Channel.Items[i]
		items = append(items, Item{
			Title: entry.Title,
			Link:  entry.Link,
			Date:  entry.PubDate,
		})
	}

	return items, nil
}
