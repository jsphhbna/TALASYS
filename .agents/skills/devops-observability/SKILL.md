---
name: devops-observability
description: >-
  Structured logging and application performance monitoring.
---

# Observability and Logging

> **Category**: DevOps & Deployment
> **Tags**: Logging, Monitoring, DevOps

## Policy

```
Rule: Instrument the Application
Description: If it breaks, logs should identify exactly why in seconds.
1. Structured logs: Use JSON formatted logging (Pino, Winston) instead of console.log. Ensure each row has timestamp, level, trace_id, and message fields so they fit nicely into Datadog or ELK.
2. Trace ID: Generate a unique Request ID at the Edge/Gateway, pass it into the request context, and attach it to every subsequent database query and log row.
3. Metric Dashboards: Expose Prometheus metrics covering the RED triad: Rate (requests per sec), Errors (failed reqs), and Duration (latency ms).
4. Alerting: Alert blindly on symptom, not cause. Send a pager alert if the 500 error rate spikes over 1%, or p99 latency crosses 2 seconds.
5. Log scrubbing: Redact passwords, tokens, auth headers, and credit card numbers at the logging boundary before they are written to disk or sent to aggregated services.
```
