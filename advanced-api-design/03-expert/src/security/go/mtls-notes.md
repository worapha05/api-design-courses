# Mutual TLS (mTLS) สำหรับ Internal Microservices

## แนวคิด

ใน mTLS ทั้ง **client และ server** ต้องมี certificate ที่ credible:

1. Client เชื่อมต่อ TLS ไปยัง server
2. Server ส่ง server cert → client ตรวจกับ CA
3. Server ขอ client cert → ตรวจว่าออกโดย CA เดียวกัน (หรือ mesh CA)
4. Identity มัก map จาก SPIFFE ID / SAN ของ certificate เช่น `spiffe://cluster/ns/orders/sa/orders`

## แยกชั้นความปลอดภัย

| ชั้น               | กลไก                                 |
| ------------------ | ------------------------------------ |
| Internet → Gateway | TLS + OAuth2/JWT                     |
| Gateway → Services | mTLS (mesh หรือ manually)            |
| Service → Service  | mTLS + optional JWT for user context |

**อย่า** ใช้ JWT อย่างเดียวภายในโดยไม่มี transport auth — token ถูก steal แล้ว replay ใน network
ได้ถ้าเป็น plaintext

## ตัวอย่างแนวคิดด้วย Go (`crypto/tls`)

```go
cert, _ := tls.LoadX509KeyPair("client.crt", "client.key")
caCert, _ := os.ReadFile("ca.crt")
pool := x509.NewCertPool()
pool.AppendCertsFromPEM(caCert)

tlsConfig := &tls.Config{
 Certificates: []tls.Certificate{cert},
 RootCAs: pool,
 MinVersion: tls.VersionTLS13,
}

client := &http.Client{Transport: &http.Transport{TLSClientConfig: tlsConfig}}
resp, err := client.Get("https://inventory.internal:8443/stock")
```

ฝั่ง server ตั้ง `ClientAuth: tls.RequireAndVerifyClientCert`

## ใน Kubernetes / Enterprise

ใช้ service mesh (Istio, Linkerd, Cilium) เพื่อ:

- หมุน certificate อัตโนมัติ
- บังคับ PeerAuthentication STRICT
- AuthorizationPolicy ตาม identity ไม่ใช่แค่ IP

## Checklist

- [ ] External JWT ไม่ถูก forward ดิบเข้า internal
- [ ] Internal รับเฉพาะจาก identities ที่ allow
- [ ] Certificate rotation < lifetime ของ cert
- [ ] แยก CA สำหรับ mesh กับ public edge
