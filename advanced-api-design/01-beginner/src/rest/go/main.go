// Richardson Maturity Model Level 2–3 REST API (Go)
// Filtering, sorting, pagination + HATEOAS links
package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

type OrderStatus string

const (
	StatusPending   OrderStatus = "pending"
	StatusPaid      OrderStatus = "paid"
	StatusShipped   OrderStatus = "shipped"
	StatusCancelled OrderStatus = "cancelled"
)

type Order struct {
	ID         string      `json:"id"`
	CustomerID string      `json:"customerId"`
	Status     OrderStatus `json:"status"`
	Total      float64     `json:"total"`
	CreatedAt  string      `json:"createdAt"`
}

type Link struct {
	Href   string `json:"href"`
	Method string `json:"method,omitempty"`
}

type OrderResponse struct {
	Order
	Links map[string]Link `json:"_links"`
}

type Problem struct {
	Type   string `json:"type"`
	Title  string `json:"title"`
	Status int    `json:"status"`
	Detail string `json:"detail"`
}

var (
	mu     sync.RWMutex
	seq    = 4
	orders = map[string]Order{
		"ord_1": {ID: "ord_1", CustomerID: "cus_a", Status: StatusPending, Total: 1200, CreatedAt: "2026-07-01T10:00:00Z"},
		"ord_2": {ID: "ord_2", CustomerID: "cus_b", Status: StatusPaid, Total: 450, CreatedAt: "2026-07-02T11:00:00Z"},
		"ord_3": {ID: "ord_3", CustomerID: "cus_a", Status: StatusShipped, Total: 890, CreatedAt: "2026-07-03T09:30:00Z"},
	}
)

func writeProblem(w http.ResponseWriter, status int, title, detail string) {
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(Problem{
		Type:   "https://api.example.com/errors/" + strings.ToLower(strings.ReplaceAll(title, " ", "-")),
		Title:  title,
		Status: status,
		Detail: detail,
	})
}

func baseURL(r *http.Request) string {
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	return fmt.Sprintf("%s://%s", scheme, r.Host)
}

func orderLinks(r *http.Request, o Order) map[string]Link {
	root := fmt.Sprintf("%s/orders/%s", baseURL(r), o.ID)
	links := map[string]Link{
		"self":       {Href: root},
		"collection": {Href: baseURL(r) + "/orders"},
	}
	if o.Status == StatusPending {
		links["pay"] = Link{Href: root + "/payments", Method: "POST"}
		links["cancel"] = Link{Href: root, Method: "DELETE"}
	}
	if o.Status == StatusPaid {
		links["ship"] = Link{Href: root, Method: "PATCH"}
	}
	return links
}

func withHateoas(r *http.Request, o Order) OrderResponse {
	return OrderResponse{Order: o, Links: orderLinks(r, o)}
}

func listOrders(w http.ResponseWriter, r *http.Request) {
	mu.RLock()
	list := make([]Order, 0, len(orders))
	for _, o := range orders {
		list = append(list, o)
	}
	mu.RUnlock()

	q := r.URL.Query()
	if s := q.Get("status"); s != "" {
		filtered := list[:0]
		for _, o := range list {
			if string(o.Status) == s {
				filtered = append(filtered, o)
			}
		}
		list = filtered
	}
	if c := q.Get("customerId"); c != "" {
		filtered := list[:0]
		for _, o := range list {
			if o.CustomerID == c {
				filtered = append(filtered, o)
			}
		}
		list = filtered
	}

	sortParam := q.Get("sort")
	if sortParam == "" {
		sortParam = "-createdAt"
	}
	fields := strings.Split(sortParam, ",")
	sort.SliceStable(list, func(i, j int) bool {
		for _, f := range fields {
			desc := strings.HasPrefix(f, "-")
			key := strings.TrimPrefix(f, "-")
			var less, equal bool
			switch key {
			case "total":
				less = list[i].Total < list[j].Total
				equal = list[i].Total == list[j].Total
			case "createdAt":
				less = list[i].CreatedAt < list[j].CreatedAt
				equal = list[i].CreatedAt == list[j].CreatedAt
			case "status":
				less = list[i].Status < list[j].Status
				equal = list[i].Status == list[j].Status
			default:
				less = list[i].ID < list[j].ID
				equal = list[i].ID == list[j].ID
			}
			if equal {
				continue
			}
			if desc {
				return !less
			}
			return less
		}
		return false
	})

	page, _ := strconv.Atoi(q.Get("page"))
	if page < 1 {
		page = 1
	}
	limit, _ := strconv.Atoi(q.Get("limit"))
	if limit < 1 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	total := len(list)
	totalPages := total / limit
	if total%limit != 0 || totalPages == 0 {
		totalPages++
	}
	if total == 0 {
		totalPages = 1
	}
	start := (page - 1) * limit
	if start > total {
		start = total
	}
	end := start + limit
	if end > total {
		end = total
	}

	data := make([]OrderResponse, 0, end-start)
	for _, o := range list[start:end] {
		data = append(data, withHateoas(r, o))
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"data": data,
		"meta": map[string]any{"page": page, "limit": limit, "total": total, "totalPages": totalPages},
	})
}

func getOrder(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/orders/")
	if strings.Contains(id, "/") {
		http.NotFound(w, r)
		return
	}
	mu.RLock()
	o, ok := orders[id]
	mu.RUnlock()
	if !ok {
		writeProblem(w, http.StatusNotFound, "Not Found", "Order "+id+" not found")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(withHateoas(r, o))
}

func createOrder(w http.ResponseWriter, r *http.Request) {
	var body struct {
		CustomerID string  `json:"customerId"`
		Total      float64 `json:"total"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.CustomerID == "" || body.Total < 0 {
		writeProblem(w, http.StatusUnprocessableEntity, "Validation Failed", "customerId and non-negative total required")
		return
	}
	mu.Lock()
	id := fmt.Sprintf("ord_%d", seq)
	seq++
	o := Order{
		ID: id, CustomerID: body.CustomerID, Status: StatusPending,
		Total: body.Total, CreatedAt: time.Now().UTC().Format(time.RFC3339),
	}
	orders[id] = o
	mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Location", "/orders/"+id)
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(withHateoas(r, o))
}

func patchOrder(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/orders/")
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeProblem(w, http.StatusBadRequest, "Bad Request", "invalid JSON")
		return
	}
	mu.Lock()
	defer mu.Unlock()
	o, ok := orders[id]
	if !ok {
		writeProblem(w, http.StatusNotFound, "Not Found", "Order "+id+" not found")
		return
	}
	if s, ok := body["status"].(string); ok {
		if s == "shipped" && o.Status != StatusPaid && o.Status != StatusShipped {
			writeProblem(w, http.StatusConflict, "Conflict", "order must be paid before shipping")
			return
		}
		o.Status = OrderStatus(s)
	}
	if t, ok := body["total"].(float64); ok {
		if t < 0 {
			writeProblem(w, http.StatusUnprocessableEntity, "Validation Failed", "total must be >= 0")
			return
		}
		o.Total = t
	}
	orders[id] = o
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(withHateoas(r, o))
}

func deleteOrder(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/orders/")
	mu.Lock()
	defer mu.Unlock()
	o, ok := orders[id]
	if !ok {
		writeProblem(w, http.StatusNotFound, "Not Found", "Order "+id+" not found")
		return
	}
	if o.Status != StatusPending {
		writeProblem(w, http.StatusConflict, "Conflict", "only pending orders can be cancelled")
		return
	}
	o.Status = StatusCancelled
	orders[id] = o
	w.WriteHeader(http.StatusNoContent)
}

func ordersHandler(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	switch {
	case path == "/orders" && r.Method == http.MethodGet:
		listOrders(w, r)
	case path == "/orders" && r.Method == http.MethodPost:
		createOrder(w, r)
	case strings.HasPrefix(path, "/orders/") && r.Method == http.MethodGet:
		getOrder(w, r)
	case strings.HasPrefix(path, "/orders/") && r.Method == http.MethodPatch:
		patchOrder(w, r)
	case strings.HasPrefix(path, "/orders/") && r.Method == http.MethodDelete:
		deleteOrder(w, r)
	default:
		writeProblem(w, http.StatusMethodNotAllowed, "Method Not Allowed", r.Method+" not allowed")
	}
}

func main() {
	http.HandleFunc("/orders", ordersHandler)
	http.HandleFunc("/orders/", ordersHandler)
	fmt.Println("REST Orders API (Go) on :3000")
	_ = http.ListenAndServe(":3000", nil)
}
