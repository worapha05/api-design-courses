// Go client for beginner WebSocket
package main

import (
	"encoding/json"
	"log"
	"os"
	"time"

	"github.com/gorilla/websocket"
)

func main() {
	url := os.Getenv("WS_URL")
	if url == "" {
		url = "ws://localhost:3001/ws"
	}
	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		log.Fatal(err)
	}
	defer conn.Close()

	go func() {
		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				return
			}
			log.Printf("[client] recv: %s", msg)
		}
	}()

	send := func(typ string, payload any) {
		b, _ := json.Marshal(map[string]any{"type": typ, "payload": payload})
		_ = conn.WriteMessage(websocket.TextMessage, b)
	}

	send("ping", map[string]any{"t": time.Now().UnixMilli()})
	send("chat", map[string]string{"text": "hello from go client"})
	send("echo", map[string]bool{"demo": true})

	time.Sleep(2 * time.Second)
	_ = conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, "demo done"))
}
