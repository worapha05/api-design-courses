// Illustrative mTLS HTTP client dial (requires local cert files to run)
package main

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"net/http"
	"os"
)

func main() {
	certFile := getenv("CLIENT_CERT", "client.crt")
	keyFile := getenv("CLIENT_KEY", "client.key")
	caFile := getenv("CA_CERT", "ca.crt")
	url := getenv("URL", "https://127.0.0.1:8443/health")

	cert, err := tls.LoadX509KeyPair(certFile, keyFile)
	if err != nil {
		fmt.Println("Load certs skipped (demo):", err)
		fmt.Println("Generate CA/client/server certs then re-run — see mtls-notes.md")
		return
	}
	ca, err := os.ReadFile(caFile)
	if err != nil {
		panic(err)
	}
	pool := x509.NewCertPool()
	pool.AppendCertsFromPEM(ca)

	client := &http.Client{Transport: &http.Transport{
		TLSClientConfig: &tls.Config{
			Certificates: []tls.Certificate{cert},
			RootCAs:      pool,
			MinVersion:   tls.VersionTLS13,
		},
	}}
	resp, err := client.Get(url)
	if err != nil {
		panic(err)
	}
	defer resp.Body.Close()
	fmt.Println("status", resp.Status)
}

func getenv(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}
