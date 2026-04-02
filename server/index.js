import { WebSocketServer, WebSocket } from 'ws';

const PORT = process.env.PORT || 8080;

// roomId -> { clients: Set<WebSocket>, nodes: object | null, roundName: string }
const rooms = new Map();

const wss = new WebSocketServer({ port: Number(PORT) });

wss.on('connection', (ws) => {
	let roomId = null;

	ws.on('message', (data) => {
		let msg;
		try {
			msg = JSON.parse(data.toString());
		} catch {
			return;
		}

		switch (msg.tag) {
			case 'join': {
				roomId = msg.roomId;
				if (!rooms.has(roomId)) {
					rooms.set(roomId, { clients: new Set(), nodes: null, roundName: '' });
				}
				const room = rooms.get(roomId);
				const isFirst = room.clients.size === 0;
				room.clients.add(ws);

				console.log(`[${new Date().toISOString()}] JOIN room=${roomId} peers=${room.clients.size} isFirst=${isFirst}`);

				ws.send(JSON.stringify({ tag: 'joined', isFirst }));

				if (!isFirst && room.nodes !== null) {
					ws.send(JSON.stringify({ tag: 'sync', nodes: room.nodes, roundName: room.roundName }));
				}

				broadcastToRoom(room, { tag: 'peer_count', count: room.clients.size });
				break;
			}

			case 'sync': {
				if (!roomId) return;
				const room = rooms.get(roomId);
				if (!room) return;
				room.nodes = msg.nodes;
				if (msg.roundName != null) room.roundName = msg.roundName;
				break;
			}

			case 'round_name': {
				if (!roomId) return;
				const room = rooms.get(roomId);
				if (!room) return;
				room.roundName = msg.roundName ?? '';
				// Broadcast to everyone else
				const broadcast = JSON.stringify({ tag: 'round_name', roundName: room.roundName });
				for (const client of room.clients) {
					if (client !== ws && client.readyState === WebSocket.OPEN) {
						client.send(broadcast);
					}
				}
				break;
			}

			case 'ping': {
				ws.send(JSON.stringify({ tag: 'pong' }));
				break;
			}

			case 'action': {
				if (!roomId) return;
				const room = rooms.get(roomId);
				if (!room) return;

				// Store updated nodes snapshot for late joiners
				if (msg.nodes != null) room.nodes = msg.nodes;

				// Confirm receipt to sender
				ws.send(JSON.stringify({ tag: 'action_received', actionId: msg.actionId }));

				// Broadcast action to everyone else in the room
				const broadcast = JSON.stringify({
					tag: 'action',
					actionId: msg.actionId,
					actionBundle: msg.actionBundle
				});
				for (const client of room.clients) {
					if (client !== ws && client.readyState === WebSocket.OPEN) {
						client.send(broadcast);
					}
				}
				break;
			}
		}
	});

	ws.on('close', () => {
		if (!roomId) return;
		const room = rooms.get(roomId);
		if (!room) return;
		room.clients.delete(ws);
		if (room.clients.size === 0) {
			console.log(`[${new Date().toISOString()}] LEAVE room=${roomId} peers=0 (room deleted)`);
			rooms.delete(roomId);
		} else {
			console.log(`[${new Date().toISOString()}] LEAVE room=${roomId} peers=${room.clients.size}`);
			broadcastToRoom(room, { tag: 'peer_count', count: room.clients.size });
		}
	});
});

function broadcastToRoom(room, message) {
	const data = JSON.stringify(message);
	for (const client of room.clients) {
		if (client.readyState === WebSocket.OPEN) {
			client.send(data);
		}
	}
}

console.log(`WebSocket server listening on port ${PORT}`);
