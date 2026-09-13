# Implementation Plan: Checkout

## Data model

`Payment.method` — the payment method ∈ {wallet | card | transfer}.

Same three members as the specification, written in a different order and with a
different separator. This fixture exists to prove the check does not fire on
formatting variance.
