// Advanced WebSocket: heartbeat + rooms (Go)
// For multi-node, pair with Redis like the TypeScript example.
package main

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

const heartbeatEvery = 30 * time.Second

var upgrader = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}

type Client struct {
	id    string
	conn  *websocket.Conn
	rooms map[string]struct{}
	send  chan []byte
}

type Hub struct {
	mu      sync.RWMutex
	rooms   map[string]map[*Client]struct{}
	clients map[*Client]struct{}
}

func newHub() *Hub {
	return &Hub{
		rooms:   make(map[string]map[*Client]struct{}),
		clients: make(map[*Client]struct{}),
	}
}

func (h *Hub) join(c *Client, room string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.rooms[room] == nil {
		h.rooms[room] = make(map[*Client]struct{})
	}
	h.rooms[room][c] = struct{}{}
	c.rooms[room] = struct{}{}
}

func (h *Hub) leave(c *Client, room string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.rooms[room], c)
	delete(c.rooms, room)
}

func (h *Hub) leaveAll(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for room := range c.rooms {
		delete(h.rooms[room], c)
	}
	c.rooms = make(map[string]struct{})
	delete(h.clients, c)
}

func (h *Hub) broadcast(room string, payload []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.rooms[room] {
		select {
		case c.send <- payload:
		default:
			// slow consumer — drop / disconnect in production with backpressure policy
		}
	}
}

func writePump(c *Client) {
	ticker := time.NewTicker(heartbeatEvery)
	defer func() {
		ticker.Stop()
		_ = c.conn.Close()
	}()
	for {
		select {
		case msg, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func readPump(h *Hub, c *Client) {
	defer func() {
		h.leaveAll(c)
		close(c.send)
	}()
	c.conn.SetReadLimit(4096)
	_ = c.conn.SetReadDeadline(time.Now().Add(heartbeatEvery * 2))
	c.conn.SetPongHandler(func(string) error {
		return c.conn.SetReadDeadline(time.Now().Add(heartbeatEvery * 2))
	})

	for {
		_, raw, err := c.conn.ReadMessage()
		if err != nil {
			return
		}
		var msg struct {
			Type    string `json:"type"`
			Payload struct {
				Room string `json:"room"`
				Text string `json:"text"`
			} `json:"payload"`
		}
		if err := json.Unmarshal(raw, &msg); err != nil {
			continue
		}
		switch msg.Type {
		case "join":
			h.join(c, msg.Payload.Room)
			b, _ := json.Marshal(map[string]any{"type": "joined", "payload": map[string]string{"room": msg.Payload.Room}})
			c.send <- b
		case "leave":
			h.leave(c, msg.Payload.Room)
		case "chat":
			if _, ok := c.rooms[msg.Payload.Room]; !ok {
				continue
			}
			b, _ := json.Marshal(map[string]any{
				"type": "chat",
				"id":   uuid.NewString(),
				"payload": map[string]string{
					"room": msg.Payload.Room,
					"text": msg.Payload.Text,
					"from": c.id,
				},
			})
			h.broadcast(msg.Payload.Room, b)
		}
	}
}

func main() {
	hub := newHub()
	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		client := &Client{
			id:    uuid.NewString(),
			conn:  conn,
			rooms: make(map[string]struct{}),
			send:  make(chan []byte, 32),
		}
		hub.mu.Lock()
		hub.clients[client] = struct{}{}
		hub.mu.Unlock()

		go writePump(client)
		welcome, _ := json.Marshal(map[string]any{"type": "welcome", "payload": map[string]string{"clientId": client.id}})
		client.send <- welcome
		go readPump(hub, client)
	})

	log.Println("WS hub (Go) on :4001/ws — heartbeat every", heartbeatEvery)
	log.Fatal(http.ListenAndServe(":4001", nil))
}
