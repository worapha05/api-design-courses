// WebSocket scale-oriented server (Go): bounded queue + backpressure kick + drain
package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/signal"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

const maxQueue = 32

var (
	upgrader  = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}
	accepting atomic.Bool
	conns     atomic.Int64
	dropped   atomic.Int64
)

type client struct {
	conn *websocket.Conn
	send chan []byte
	id   string
}

func main() {
	accepting.Store(true)

	http.HandleFunc("/metrics", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"connections": conns.Load(),
			"dropped":     dropped.Load(),
			"accepting":   accepting.Load(),
		})
	})

	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		if !accepting.Load() {
			http.Error(w, "draining", http.StatusServiceUnavailable)
			return
		}
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		c := &client{conn: conn, send: make(chan []byte, maxQueue), id: uuid.NewString()}
		conns.Add(1)
		go writer(c)
		go reader(c)
		welcome, _ := json.Marshal(map[string]any{"type": "welcome", "payload": map[string]string{"id": c.id}})
		enqueue(c, welcome)
	})

	go func() {
		ch := make(chan os.Signal, 1)
		signal.Notify(ch, syscall.SIGTERM, syscall.SIGINT)
		<-ch
		log.Println("draining...")
		accepting.Store(false)
		time.Sleep(2 * time.Second)
		os.Exit(0)
	}()

	log.Println("WS scale (Go) on :7001/ws — remember ulimit -n")
	log.Fatal(http.ListenAndServe(":7001", nil))
}

func enqueue(c *client, msg []byte) {
	select {
	case c.send <- msg:
	default:
		dropped.Add(1)
		_ = c.conn.Close()
	}
}

func writer(c *client) {
	defer func() {
		_ = c.conn.Close()
		conns.Add(-1)
	}()
	for msg := range c.send {
		_ = c.conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
		if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
			return
		}
	}
}

func reader(c *client) {
	defer close(c.send)
	for {
		_, raw, err := c.conn.ReadMessage()
		if err != nil {
			return
		}
		var msg struct {
			Type    string          `json:"type"`
			Payload json.RawMessage `json:"payload"`
		}
		if json.Unmarshal(raw, &msg) != nil {
			continue
		}
		if msg.Type == "echo" {
			out, _ := json.Marshal(map[string]any{"type": "echo", "payload": json.RawMessage(msg.Payload)})
			enqueue(c, out)
		}
	}
}
