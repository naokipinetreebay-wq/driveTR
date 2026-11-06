import { createServer, IncomingMessage, ServerResponse } from "http";
import { parse } from "url";
import next from "next";
import { WebSocketServer } from "ws";
import { ClientSocket, RoomManager } from "./src/server/room";
import type { ClientMessage } from "./src/lib/types";

const dev = process.env.NODE_ENV !== "production";
const listenHost = "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname: "localhost", port });
const handle = app.getRequestHandler();
const rooms = new RoomManager();

setInterval(() => rooms.sweep(), 60_000);

function sendJson(res: ServerResponse, status: number, body: unknown) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(data),
  });
  res.end(data);
}

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsed = parse(req.url || "", true);

      if (req.method === "POST" && parsed.pathname === "/api/rooms") {
        const room = rooms.createRoom();
        sendJson(res, 200, { code: room.code });
        return;
      }

      if (req.method === "GET" && parsed.pathname === "/api/rooms/exists") {
        const code = String(parsed.query.code || "").toUpperCase();
        const room = rooms.get(code);
        sendJson(res, 200, { exists: !!room });
        return;
      }

      await handle(req, res, parsed);
    } catch (err) {
      console.error(err);
      res.statusCode = 500;
      res.end("internal error");
    }
  });

  const wss = new WebSocketServer({ noServer: true });
  type AliveSocket = ClientSocket & { isAlive?: boolean };

  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      const ws = client as AliveSocket;
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      try {
        ws.ping();
      } catch {
        ws.terminate();
      }
    }
  }, 15_000);
  heartbeat.unref?.();

  server.on("upgrade", (req, socket, head) => {
    const { pathname, query } = parse(req.url || "", true);
    if (pathname !== "/ws") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req, query);
    });
  });

  wss.on(
    "connection",
    (ws: AliveSocket, _req: IncomingMessage, query: Record<string, string | string[] | undefined>) => {
      const code = String(query.room || "").toUpperCase();
      const role = String(query.role || "") as "controller" | "display";
      const deviceId = String(query.deviceId || "");

      const room = rooms.get(code);
      if (!room || (role !== "controller" && role !== "display") || !deviceId) {
        ws.send(JSON.stringify({ type: "error", message: "ルームが見つかりません" }));
        ws.close();
        return;
      }

      ws.roomCode = code;
      ws.role = role;
      ws.deviceId = deviceId;
      ws.isAlive = true;
      ws.on("pong", () => {
        ws.isAlive = true;
      });

      if (role === "controller") {
        room.addController(ws);
      } else {
        const result = room.addDisplay(ws, deviceId);
        if (!result.ok) {
          ws.send(JSON.stringify({ type: "error", message: result.error }));
          ws.close();
          return;
        }
      }

      ws.on("message", (raw) => {
        let msg: ClientMessage;
        try {
          msg = JSON.parse(String(raw)) as ClientMessage;
        } catch {
          return;
        }
        const r = rooms.get(code);
        if (!r) return;
        ws.isAlive = true;

        switch (msg.type) {
          case "updateConfig":
            if (role === "controller") r.updateConfig(msg.config);
            break;
          case "setLabel":
            if (role === "controller") r.setLabel(msg.deviceId, msg.label);
            break;
          case "start":
            if (role === "controller") r.start();
            break;
          case "stop":
            if (role === "controller") r.stop();
            break;
          case "ping":
            r.touch();
            ws.send(JSON.stringify({ type: "pong" }));
            break;
          default:
            break;
        }
      });

      ws.on("close", () => {
        const r = rooms.get(code);
        if (!r) return;
        if (role === "controller") r.removeController(ws);
        else r.removeDisplaySocket(ws);
      });
    }
  );

  server.listen(port, listenHost, () => {
    console.log(`> Drive ready on http://${listenHost}:${port}`);
  });
});
