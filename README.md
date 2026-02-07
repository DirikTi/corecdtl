<p align="center">
  <img src="docs/assets/logo.png" alt="<Project Name> Logo" width="180"/>
</p>

<h1 align="center"><CoreCDTL></h1>

<p align="center">
  <a href="<CI_LINK>">
    <img src="https://img.shields.io/badge/build-passing-brightgreen" />
  </a>
  <a href="<TEST_LINK>">
    <img src="https://img.shields.io/badge/tests-rfc-blue" />
  </a>
  <a href="<LICENSE_LINK>">
    <img src="https://img.shields.io/badge/license-MIT-black" />
  </a>
  <img src="https://img.shields.io/badge/HTTP-1.1-orange" />
  <img src="https://img.shields.io/badge/SIMD-required-red" />
  <a href="<API_DOCS_LINK>">
    <img src="https://img.shields.io/badge/docs-API-informational" />
  </a>
</p>

<p align="center">
  High-performance • Low-level • Fully customizable HTTP engine
</p>

# CoreCDTL

**A high-performance, fully customizable HTTP engine for building web and API servers.**

Designed for teams that need maximum control over their HTTP stack without sacrificing performance.
Suitable for large-scale, high-traffic production systems and internal infrastructure.

---

# Overview

`CoreCDTL` is a low-level HTTP engine distributed as a **library**, not a framework.

It operates above the socket layer and provides more than just parsing.
Beyond request parsing, it includes a full processing pipeline that enables building complete HTTP servers with deep customization.

The engine allows developers to intervene and replace core behaviors such as:

* request accumulation
* response models
* content parsers
* pipeline stages

This makes it ideal for teams that want to design and control their own architecture instead of adapting to opinionated frameworks.

---

# Design Goals

* High performance
* Minimal overhead parsing
* Deterministic state machines
* Fully customizable request/response pipeline
* Pluggable internal components
* Production-grade reliability
* Designed for large-scale and high-traffic systems
* Suitable for web and API servers

---

# Architecture

## High-Level Architecture

```
Socket → Parser → State Machines → Pipeline → Handlers → Response
```

The engine processes data in a single pass and drives the request lifecycle through explicit states and a customizable execution pipeline.

---

## State Machines

The HTTP protocol is handled using deterministic state machines:

* Request line
* Headers
* Body
* Chunked transfer encoding

This approach ensures:

* predictable behavior
* low branching overhead
* high cache efficiency
* safe incremental parsing

---

## Customization Points

The engine is designed to be extended or replaced at multiple levels:

* Accumulators
* Response models
* Content parsers
* Pipeline stages / middleware
* Server behavior customization

Users can build their own HTTP server behavior on top of the core engine without modifying internals.

---

# RFC Compliance

The engine follows the HTTP/1.1 specifications and validates protocol rules strictly.

* RFC-compliant parsing
* Strict header validation
* Deterministic behavior on malformed input
* Non-compliant or ambiguous inputs are intentionally rejected

---

# Security Considerations

Security is handled as a first-class concern.

The engine includes protections against:

* header injection
* CRLF attacks
* request smuggling vectors
* malformed or ambiguous requests
* unsafe parsing states

Invalid inputs fail fast and do not propagate undefined behavior.

---

# Performance Characteristics

The engine is built with performance as a core principle:

* single-pass parsing
* low/zero-copy design
* minimal allocations
* cache-friendly structures
* branch-predictable state machines
* SIMD optimizations

Designed for high-throughput, low-latency workloads.

---

# Public API

Full API documentation is available here:

👉 **[API Documentation](https://corecdtl.com/docs/intro)**

---

# Testing

The project includes:

* Unit tests
* RFC compliance tests

---

# Platform Support

Requires modern CPUs with **SIMD support**.

---

# Limitations

See:

👉 **[Limitations](https://corecdtl.com/docs/limitations)**


Current known limitations include:

* HTTP/2 not supported
* TLS not included

---

# Roadmap

Planned features and future work:

👉 **[Roadmap](https://corecdtl.com/docs/roadmap)**

---

# License

Open-source.
See **[LICENSE](LICENSE)** for details.
