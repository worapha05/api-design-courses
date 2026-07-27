// API Gateway (Go): reverse proxy + token bucket + header transform
package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

type bucket struct {
	tokens    float64
	updatedAt time.Time
}

type limiter struct {
	mu       sync.Mutex
	buckets  map[string]*bucket
	capacity float64
	refill   float64
}

func newLimiter(cap, refill float64) *limiter {
	return &limiter{buckets: make(map[string]*bucket), capacity: cap, refill: refill}
}

func (l *limiter) allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	b, ok := l.buckets[key]
	if !ok {
		b = &bucket{tokens: l.capacity, updatedAt: now}
		l.buckets[key] = b
	}
	elapsed := now.Sub(b.updatedAt).Seconds()
	next := b.tokens + elapsed*l.refill
	if next > l.capacity {
		next = l.capacity
	}
	b.tokens = next
	b.updatedAt = now
	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

func parseDemoToken(auth string) (string, bool) {
	if !strings.HasPrefix(auth, "Bearer ") {
		return "", false
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(auth, "Bearer "))
	if err != nil {
		return "", false
	}
	parts := strings.SplitN(string(raw), ":", 2)
	if len(parts) != 2 || parts[0] != "user" || parts[1] == "" {
		return "", false
	}
	return parts[1], true
}

func problem(w http.ResponseWriter, status int, title, detail string) {
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"title": title, "status": status, "detail": detail,
	})
}

func main() {
	upstream, _ := url.Parse("http://127.0.0.1:5001")
	proxy := httputil.NewSingleHostReverseProxy(upstream)
	lim := newLimiter(10, 2)

	original := proxy.Director
	proxy.Director = func(req *http.Request) {
		original(req)
		// /v1/orders → /orders
		req.URL.Path = strings.TrimPrefix(req.URL.Path, "/v1")
		req.Host = upstream.Host
	}

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok", "role": "gateway"})
	})

	http.HandleFunc("/v1/orders", gateway(lim, proxy))
	http.HandleFunc("/v1/orders/", gateway(lim, proxy))

	demo := base64.StdEncoding.EncodeToString([]byte("user:alice"))
	fmt.Println("API Gateway (Go) on :8080")
	fmt.Println("Demo token: Bearer", demo)
	_ = http.ListenAndServe(":8080", nil)
}

func gateway(lim *limiter, proxy *httputil.ReverseProxy) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := parseDemoToken(r.Header.Get("Authorization"))
		if !ok {
			problem(w, http.StatusUnauthorized, "Unauthorized", "Bearer token required")
			return
		}
		if !lim.allow(userID) {
			w.Header().Set("Retry-After", "1")
			problem(w, http.StatusTooManyRequests, "Too Many Requests", "rate limit exceeded")
			return
		}
		r.Header.Del("Authorization")
		r.Header.Set("X-User-Id", userID)
		if r.Header.Get("X-Request-Id") == "" {
			r.Header.Set("X-Request-Id", uuid.NewString())
		}
		proxy.ServeHTTP(w, r)
	}
}
