import { derived, get, writable } from 'svelte/store';
import { _nodesMut, flowsChange, nodes } from './store';
import { applyActionBundleAndSyncUi } from './nodeAction';
import { resolvePendingAction } from './nodePendingAction';
import type { ActionBundle } from './nodeAction';
import { newNodeId } from './node';
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

// The current round name is kept here so it can be included in sync messages.
// It is updated by calling setLocalRoundName() from outside (app page or autoSave).
// We do NOT import autoSave here to avoid circular-initialization issues.
let $roundName = '';
// Callback invoked when a peer sends us a new round name (set from app page)
let onRemoteRoundName: ((name: string) => void) | null = null;

export function setLocalRoundName(name: string) {
	$roundName = name;
}

export function onRoundNameFromPeer(cb: (name: string) => void) {
	onRemoteRoundName = cb;
}

/** Broadcast a round-name change to peers. Call this whenever the local round name changes. */
export function sendRoundName(name: string) {
	$roundName = name;
	const state = get(wsRoom);
	if (state.tag !== 'connected' || !socket || socket.readyState !== WebSocket.OPEN) return;
	socket.send(JSON.stringify({ tag: 'round_name', roundName: name }));
}

// Track reconnect state
let userDisconnected = false;
let currentRoomId: string | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
const HEARTBEAT_MS = 25000;
const RECONNECT_MS = 2000;

function generateRoomId(): string {
	return Math.random().toString(36).slice(2, 8);
}

function startHeartbeat(ws: WebSocket) {
	stopHeartbeat();
	heartbeatInterval = setInterval(() => {
		if (ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify({ tag: 'ping' }));
		}
	}, HEARTBEAT_MS);
}

function stopHeartbeat() {
	if (heartbeatInterval != null) {
		clearInterval(heartbeatInterval);
		heartbeatInterval = null;
	}
}

function scheduleReconnect(roomId: string) {
	if (reconnectTimer != null) clearTimeout(reconnectTimer);
	reconnectTimer = setTimeout(() => {
		reconnectTimer = null;
		if (!userDisconnected && currentRoomId === roomId) {
			connect(roomId);
		}
	}, RECONNECT_MS);
}

export function createRoom(roomId?: string): string {
	const id = roomId ?? generateRoomId();
	connect(id);
	return id;
}

export function joinRoom(roomId: string): void {
	connect(roomId);
}

function connect(roomId: string): void {
	userDisconnected = false;
	currentRoomId = roomId;

	if (socket) {
		socket.onclose = null;
		socket.onerror = null;
		socket.close();
		socket = null;
	}
	stopHeartbeat();

	wsRoom.set({ tag: 'connecting', roomId });

	const ws = new WebSocket(WS_URL);
	socket = ws;

	ws.onopen = () => {
		ws.send(JSON.stringify({ tag: 'join', roomId }));
		startHeartbeat(ws);
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
					// We are first — send our nodes + round name as the room's initial state
					wsRoom.set({ tag: 'connected', roomId, peerCount: 1, awaitingSync: false });
					ws.send(JSON.stringify({ tag: 'sync', nodes: $nodes, roundName: $roundName }));
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
				if (msg.roundName != null) {
					$roundName = msg.roundName;
					onRemoteRoundName?.(msg.roundName);
				}
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

			case 'round_name': {
				const name = msg.roundName ?? '';
				$roundName = name;
				onRemoteRoundName?.(name);
				break;
			}

			case 'peer_count': {
				wsRoom.update((s) => (s.tag === 'connected' ? { ...s, peerCount: msg.count } : s));
				break;
			}

			case 'pong': {
				break;
			}
		}
	};

	ws.onclose = () => {
		stopHeartbeat();
		resolvePendingAction($nodes);
		socket = null;

		if (!userDisconnected && currentRoomId === roomId) {
			wsRoom.set({ tag: 'connecting', roomId });
			scheduleReconnect(roomId);
		} else {
			wsRoom.set({ tag: 'disconnected' });
		}
	};

	ws.onerror = () => {
		// onclose fires after onerror
	};
}

export function disconnect(): void {
	userDisconnected = true;
	currentRoomId = null;
	if (reconnectTimer != null) {
		clearTimeout(reconnectTimer);
		reconnectTimer = null;
	}
	stopHeartbeat();
	resolvePendingAction($nodes);
	if (socket) {
		socket.onclose = null;
		socket.onerror = null;
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
			actionId: newNodeId(),
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
