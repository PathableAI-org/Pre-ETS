# Implementation Plan: Order Tracking

## Data model

`Order.status` — the order status ∈ {pending, paid, shipped, delivered, refunded}.
Stored as an enum column. Any other value is rejected at write time.

## Transitions

Transitions are validated against a table keyed by the pair of statuses.
