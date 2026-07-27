"""
Richardson Maturity Model Level 2–3 REST API (Python / Flask)
Filtering, sorting, pagination + HATEOAS links
"""
from __future__ import annotations

from datetime import datetime, timezone
from flask import Flask, jsonify, request, url_for

app = Flask(__name__)

orders: dict[str, dict] = {
    "ord_1": {
        "id": "ord_1",
        "customerId": "cus_a",
        "status": "pending",
        "total": 1200,
        "createdAt": "2026-07-01T10:00:00Z",
    },
    "ord_2": {
        "id": "ord_2",
        "customerId": "cus_b",
        "status": "paid",
        "total": 450,
        "createdAt": "2026-07-02T11:00:00Z",
    },
    "ord_3": {
        "id": "ord_3",
        "customerId": "cus_a",
        "status": "shipped",
        "total": 890,
        "createdAt": "2026-07-03T09:30:00Z",
    },
}
_seq = 4


def problem(status: int, title: str, detail: str, **extra):
    body = {
        "type": f"https://api.example.com/errors/{title.lower().replace(' ', '-')}",
        "title": title,
        "status": status,
        "detail": detail,
        **extra,
    }
    return jsonify(body), status


def order_links(order: dict) -> dict:
    root = url_for("get_order", order_id=order["id"], _external=True)
    links = {
        "self": {"href": root},
        "collection": {"href": url_for("list_orders", _external=True)},
    }
    if order["status"] == "pending":
        links["pay"] = {"href": f"{root}/payments", "method": "POST"}
        links["cancel"] = {"href": root, "method": "DELETE"}
    if order["status"] == "paid":
        links["ship"] = {"href": root, "method": "PATCH"}
    return links


def with_hateoas(order: dict) -> dict:
    return {**order, "_links": order_links(order)}


@app.get("/orders")
def list_orders():
    items = list(orders.values())

    status = request.args.get("status")
    if status:
        items = [o for o in items if o["status"] == status]
    customer_id = request.args.get("customerId")
    if customer_id:
        items = [o for o in items if o["customerId"] == customer_id]

    sort_param = request.args.get("sort", "-createdAt")
    fields = [f for f in sort_param.split(",") if f]

    def sort_key(o: dict):
        keys = []
        for f in fields:
            desc = f.startswith("-")
            key = f[1:] if desc else f
            val = o.get(key)
            # for descending, negate numbers / invert strings via wrapper
            if isinstance(val, (int, float)):
                keys.append(-val if desc else val)
            else:
                keys.append((0 if desc else 1, val if not desc else "".join(chr(255 - ord(c)) for c in str(val))))
        return tuple(keys)

    items.sort(key=sort_key)

    page = max(1, int(request.args.get("page", 1)))
    limit = min(100, max(1, int(request.args.get("limit", 20))))
    total = len(items)
    total_pages = max(1, (total + limit - 1) // limit)
    start = (page - 1) * limit
    data = [with_hateoas(o) for o in items[start: start + limit]]

    return jsonify(
        {
            "data": data,
            "meta": {"page": page, "limit": limit, "total": total, "totalPages": total_pages},
        }
    )


@app.get("/orders/<order_id>")
def get_order(order_id: str):
    order = orders.get(order_id)
    if not order:
        return problem(404, "Not Found", f"Order {order_id} not found")
    return jsonify(with_hateoas(order))


@app.post("/orders")
def create_order():
    global _seq
    body = request.get_json(silent=True) or {}
    customer_id = body.get("customerId")
    total = body.get("total")
    if not customer_id or not isinstance(total, (int, float)) or total < 0:
        return problem(
            422,
            "Validation Failed",
            "customerId and non-negative total are required",
            errors=[
                {"field": "customerId", "code": "REQUIRED"},
                {"field": "total", "code": "NON_NEGATIVE"},
            ],
        )

    order_id = f"ord_{_seq}"
    _seq += 1
    order = {
        "id": order_id,
        "customerId": customer_id,
        "status": "pending",
        "total": float(total),
        "createdAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    orders[order_id] = order
    resp = jsonify(with_hateoas(order))
    resp.status_code = 201
    resp.headers["Location"] = f"/orders/{order_id}"
    return resp


@app.put("/orders/<order_id>")
def replace_order(order_id: str):
    existing = orders.get(order_id)
    if not existing:
        return problem(404, "Not Found", f"Order {order_id} not found")
    body = request.get_json(silent=True) or {}
    allowed = {"pending", "paid", "shipped", "cancelled"}
    if (
        not body.get("customerId")
        or body.get("status") not in allowed
        or not isinstance(body.get("total"), (int, float))
    ):
        return problem(422, "Validation Failed", "customerId, status, total required for PUT")
    existing.update(
        {
            "customerId": body["customerId"],
            "status": body["status"],
            "total": float(body["total"]),
        }
    )
    return jsonify(with_hateoas(existing))


@app.patch("/orders/<order_id>")
def patch_order(order_id: str):
    existing = orders.get(order_id)
    if not existing:
        return problem(404, "Not Found", f"Order {order_id} not found")
    body = request.get_json(silent=True) or {}
    if "status" in body:
        if body["status"] == "shipped" and existing["status"] not in ("paid", "shipped"):
            return problem(409, "Conflict", "order must be paid before shipping")
        existing["status"] = body["status"]
    if "total" in body:
        if not isinstance(body["total"], (int, float)) or body["total"] < 0:
            return problem(422, "Validation Failed", "total must be non-negative number")
        existing["total"] = float(body["total"])
    return jsonify(with_hateoas(existing))


@app.delete("/orders/<order_id>")
def delete_order(order_id: str):
    existing = orders.get(order_id)
    if not existing:
        return problem(404, "Not Found", f"Order {order_id} not found")
    if existing["status"] != "pending":
        return problem(409, "Conflict", "only pending orders can be cancelled")
    existing["status"] = "cancelled"
    return "", 204


if __name__ == "__main__":
    print("REST Orders API (Python) on :3000")
    app.run(port=3000, debug=True)
