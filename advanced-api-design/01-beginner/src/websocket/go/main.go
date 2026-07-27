// Basic WebSocket server (Go) — gorilla/websocket
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true }, // demo only — tighten in production
}

type Envelope struct {
	Type      string          `json:"type"`
	ID        string          `json:"id,omitempty"`
	Timestamp string          `json:"timestamp,omitempty"`
	Payload   json.RawMessage `json:"payload,omitempty"`
}

type Hub struct {
	mu      sync.Mutex
	clients map[*websocket.Conn]struct{}
}

func (h *Hub) add(c *websocket.Conn) {
	h.mu.Lock()
	h.clients[c] = struct{}{}
	h.mu.Unlock()
}

func (h *Hub) remove(c *websocket.Conn) {
	h.mu.Lock()
	delete(h.clients, c)
	h.mu.Unlock()
	_ = c.Close()
}

func (h *Hub) len() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.clients)
}

func (h *Hub) broadcast(msg Envelope, except *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	data, _ := json.Marshal(msg)
	for c := range h.clients {
		if c == except {
			continue
		}
		_ = c.WriteMessage(websocket.TextMessage, data)
	}
}

func send(c *websocket.Conn, msg Envelope) {
	if msg.ID == "" {
		msg.ID = uuid.NewString()
	}
	if msg.Timestamp == "" {
		msg.Timestamp = time.Now().UTC().Format(time.RFC3339)
	}
	_ = c.WriteJSON(msg)
}

func main() {
	hub := &Hub{clients: make(map[*websocket.Conn]struct{})}

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintln(w, "WebSocket endpoint: ws://localhost:3001/ws")
	})

	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil) // HTTP → WebSocket upgrade
		if err != nil {
			log.Println("upgrade:", err)
			return
		}
		hub.add(conn)
		log.Printf("[open] clients=%d", hub.len())

		payload, _ := json.Marshal(map[string]any{
			"message": "Connected. Send {\"type\":\"chat\",\"payload\":{\"text\":\"hi\"}}",
			"clients": hub.len(),
		})
		send(conn, Envelope{Type: "welcome", Payload: payload})

		presence, _ := json.Marshal(map[string]any{"event": "join", "clients": hub.len()})
		hub.broadcast(Envelope{Type: "presence", ID: uuid.NewString(), Timestamp: time.Now().UTC().Format(time.RFC3339), Payload: presence}, conn)

		defer func() {
			hub.remove(conn)
			leave, _ := json.Marshal(map[string]any{"event": "leave", "clients": hub.len()})
			hub.broadcast(Envelope{Type: "presence", ID: uuid.NewString(), Timestamp: time.Now().UTC().Format(time.RFC3339), Payload: leave}, nil)
			log.Printf("[close] clients=%d", hub.len())
		}()

		for {
			_, raw, err := conn.ReadMessage()
			if err != nil {
				return
			}
			var msg Envelope
			if err := json.Unmarshal(raw, &msg); err != nil || msg.Type == "" {
				errPayload, _ := json.Marshal(map[string]string{"message": "invalid message"})
				send(conn, Envelope{Type: "error", Payload: errPayload})
				continue
			}
			switch msg.Type {
			case "ping":
				send(conn, Envelope{Type: "pong", Payload: msg.Payload})
			case "echo":
				send(conn, Envelope{Type: "echo", Payload: msg.Payload})
			case "chat":
				hub.broadcast(Envelope{
					Type: "chat", ID: uuid.NewString(),
					Timestamp: time.Now().UTC().Format(time.RFC3339),
					Payload:   msg.Payload,
				}, nil)
			default:
				errPayload, _ := json.Marshal(map[string]string{"message": "unknown type: " + msg.Type})
				send(conn, Envelope{Type: "error", Payload: errPayload})
			}
		}
	})

	log.Println("WebSocket server on :3001 /ws")
	log.Fatal(http.ListenAndServe(":3001", nil))
}
