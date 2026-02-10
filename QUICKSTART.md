## 🚀 Corecdtl – Quick Start

Corecdtl is a lightweight, high-performance HTTP engine for building **Web (SPA/static)** and **API** servers with a simple and clean API.

Install and run your server in seconds.

---

## 📦 Install

```bash
npm i corecdtl
```

---

## ⚡ Web Server (SPA / Static)

Perfect for React, Vue, Svelte, or any SPA build output.

```js
import corecdtl from "corecdtl";

const webApp = corecdtl.createServer().Web({
  spaRootPath: "./example/dist/index.html",
  publicStaticPath: "./example/dist/assets",
  publicStaticRoute: "assets"
});

webApp.listen(8080, undefined, undefined, () => {
  console.log("Listening on http://localhost:8080");
});
```

### Options

| Option            | Description                   |
| ----------------- | ----------------------------- |
| spaRootPath       | Entry HTML file (index.html)  |
| publicStaticPath  | Static assets directory       |
| publicStaticRoute | Public route for static files |

---

## 🔌 API Server

Use the API context when building REST/JSON backends.

```js
import corecdtl from "corecdtl";

const api = corecdtl.createServer().API();

api.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

api.listen(3000, undefined, undefined, () => {
  console.log("API running on http://localhost:3000");
});
```

> API context is optimized for backend usage and does not include SPA/static handling.

---

## 🎧 listen()

All servers share the same `listen` method:

```ts
listen(
  port?: number,
  hostname?: string,
  backlog?: number,
  listeningListener?: () => void
): this;
```

### Parameters

| Param             | Description                        |
| ----------------- | ---------------------------------- |
| port              | Port number (default: 3000)        |
| hostname          | Host/IP to bind (default: 0.0.0.0) |
| backlog           | Max pending connections            |
| listeningListener | Callback when server starts        |

---

## ✨ Example Run

```bash
node server.js
```

Then open:

```
http://localhost:8080
```

---

## 💡 Why Corecdtl?

* ⚡ Very fast native HTTP core
* 🧠 Minimal API surface
* 🌐 Web + API separation
* 📦 Zero config
* 🔋 Lightweight
