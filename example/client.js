import net from "net";

const client = net.createConnection({
  host: "127.0.0.1",
  port: 3000
});

client.on("connect", () => {
  console.log("connected");

  // 1. parça
  client.write("GET /api/v1/users HTTP/1.1\r\nHost: localhost\r\n");

  setTimeout(() => {
    // 2. parça
    client.write("X-Test-One: alpha\r\nX-Test-Two: beta\r\n");

    setTimeout(() => {
      // 3. parça
      client.write("X-Test-Three: gamma\r\n\r\n");
    }, 100);

  }, 100);
});

client.on("data", data => {
  console.log("response:\n" + data.toString());
});

client.on("end", () => {
  console.log("disconnected");
});