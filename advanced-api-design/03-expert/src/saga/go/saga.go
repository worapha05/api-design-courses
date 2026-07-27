// Saga orchestration (Go) — Place Order with compensations
package main

import (
	"fmt"
	"log"

	"github.com/google/uuid"
)

type Result struct {
	OK    bool
	Error string
	Data  map[string]string
}

type Context struct {
	SagaID        string
	OrderID       string
	Amount        float64
	SKU           string
	Qty           int
	PaymentID     string
	ReservationID string
}

type Step struct {
	Name       string
	Execute    func(*Context) Result
	Compensate func(*Context)
}

var stock = map[string]int{"sku_widget": 5}

func main() {
	steps := []Step{
		{
			Name: "ReservePayment",
			Execute: func(ctx *Context) Result {
				if ctx.Amount > 10000 {
					return Result{OK: false, Error: "limit exceeded"}
				}
				ctx.PaymentID = "pay_" + uuid.NewString()[:8]
				return Result{OK: true}
			},
			Compensate: func(ctx *Context) {
				log.Println("  [compensate] CancelPayment", ctx.PaymentID)
			},
		},
		{
			Name: "ReserveStock",
			Execute: func(ctx *Context) Result {
				if stock[ctx.SKU] < ctx.Qty {
					return Result{OK: false, Error: "insufficient stock"}
				}
				stock[ctx.SKU] -= ctx.Qty
				ctx.ReservationID = "res_" + uuid.NewString()[:8]
				return Result{OK: true}
			},
			Compensate: func(ctx *Context) {
				stock[ctx.SKU] += ctx.Qty
				log.Println("  [compensate] ReleaseStock", ctx.ReservationID)
			},
		},
		{
			Name: "CapturePayment",
			Execute: func(ctx *Context) Result {
				if ctx.PaymentID == "" {
					return Result{OK: false, Error: "missing payment"}
				}
				return Result{OK: true}
			},
		},
		{
			Name: "Notify",
			Execute: func(ctx *Context) Result {
				log.Println("  [notify] order", ctx.OrderID, "confirmed")
				return Result{OK: true}
			},
		},
	}

	run := func(ctx Context) {
		fmt.Printf("\n=== Saga %s order=%s ===\n", ctx.SagaID, ctx.OrderID)
		var done []Step
		for _, step := range steps {
			log.Println("→", step.Name)
			r := step.Execute(&ctx)
			if !r.OK {
				log.Println("✗", step.Name, "failed:", r.Error)
				for i := len(done) - 1; i >= 0; i-- {
					if done[i].Compensate != nil {
						done[i].Compensate(&ctx)
					}
				}
				log.Println("status: compensated")
				return
			}
			done = append(done, step)
		}
		log.Println("✓ Saga completed")
	}

	run(Context{SagaID: uuid.NewString(), OrderID: "ord_ok", Amount: 500, SKU: "sku_widget", Qty: 1})
	run(Context{SagaID: uuid.NewString(), OrderID: "ord_fail", Amount: 200, SKU: "sku_widget", Qty: 100})
}
