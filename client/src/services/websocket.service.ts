export function createWebSocket() {
  return new WebSocket("ws://localhost:4000/ws");
}