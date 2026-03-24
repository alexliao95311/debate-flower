import { derived, get, writable } from 'svelte/store';
import { _nodesMut, flowsChange, nodes } from './store';
import { applyActionBundleAndSyncUi } from './nodeAction';
import { resolvePendingAction } from './nodePendingAction';
import type { ActionBundle } from './nodeAction';
import { isNodesWorthSaving, type Nodes } from './node';

export type WsRoomState =
	| { tag: 'disconnected' }
	| { tag: 'connecting'; roomId: string }
	| { tag: 'connected'; roomId: string; peerCount: number; awaitingSync: boolean };

export const wsRoom = writable<WsRoomState>({ tag: 'disconnected' });

export const frozen = derived(wsRoom, ($ws) => $ws.tag === 'connected' && $ws.awaitingSync);

// Set in .env: VITE_WS_URL=wss://your-server.com
const WS_URL = (import.meta as Record<string, any>).env?.VITE_WS_URL ?? 'ws://localhost:8080';

let socket: WebSocket | null = null;
let $nodes: Nodes;
nodes.subscribe((n) => {
	$nodes = n;
});

function generateRoomId(): string {
	return Math.random().toString(36).slice(2, 8);
}

export function createRoom(): string {
	const roomId = generateRoomId();
	connect(roomId);
	return roomId;
}

export function joinRoom(roomId: string): void {
	connect(roomId);
}

function connect(roomId: string): void {
	if (socket) socket.close();

	wsRoom.set({ tag: 'connecting', roomId });

	const ws = new WebSocket(WS_URL);
	socket = ws;

	ws.onopen = () => {
		ws.send(JSON.stringify({ tag: 'join', roomId }));
	};

	ws.onmessage = (event) => {
		let msg: any;
		try {
			msg = JSON.parse(event.data);
		} catch {
			return;
		}

		switch (msg.tag) {
			case 'joined': {
				if (msg.isFirst) {
					// We are first — send our nodes as the room's initial state
					wsRoom.set({ tag: 'connected', roomId, peerCount: 1, awaitingSync: false });
					ws.send(JSON.stringify({ tag: 'sync', nodes: $nodes }));
				} else {
					// Joining an existing room — wait for the server's sync
					wsRoom.set({ tag: 'connected', roomId, peerCount: 1, awaitingSync: true });
				}
				break;
			}

			case 'sync': {
				const state = get(wsRoom);
				if (state.tag !== 'connected') return;
				if (
					!state.awaitingSync &&
					isNodesWorthSaving($nodes) &&
					!confirm("Overwrite your current flow with the shared room's flow?")
				) {
					disconnect();
					return;
				}
				_nodesMut.set(msg.nodes);
				flowsChange();
				wsRoom.update((s) => (s.tag === 'connected' ? { ...s, awaitingSync: false } : s));
				break;
			}

			case 'action': {
				const state = get(wsRoom);
				if (state.tag !== 'connected' || state.awaitingSync) return;
				resolvePendingAction($nodes);
				applyActionBundleAndSyncUi(msg.actionBundle);
				break;
			}

			case 'peer_count': {
				wsRoom.update((s) => (s.tag === 'connected' ? { ...s, peerCount: msg.count } : s));
				break;
			}
		}
	};

	ws.onclose = () => {
		wsRoom.set({ tag: 'disconnected' });
		socket = null;
	};

	ws.onerror = () => {
		wsRoom.set({ tag: 'disconnected' });
		socket = null;
	};
}

export function disconnect(): void {
	if (socket) {
		socket.close();
		socket = null;
	}
	wsRoom.set({ tag: 'disconnected' });
}

export function sendWsAction(actionBundle: ActionBundle): void {
	const state = get(wsRoom);
	if (state.tag !== 'connected' || !socket || socket.readyState !== WebSocket.OPEN) return;

	socket.send(
		JSON.stringify({
			tag: 'action',
			actionId: crypto.randomUUID(),
			actionBundle,
			nodes: $nodes
		})
	);
}

export function getRoomLink(roomId: string): string {
	const url = new URL(location.pathname, location.href);
	url.searchParams.set('room', roomId);
	return url.href;
}

export function parseRoomParam(): string | null {
	return new URL(location.href).searchParams.get('room');
}
