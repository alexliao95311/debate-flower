import { nodes, subscribeFlowsChange } from '$lib/models/store';
import type { Writable } from 'svelte/store';
import { writable, derived, get } from 'svelte/store';
import { getJson, loadNodes, downloadString } from './file';
import { getNode, isNodesWorthSaving, newNodeId, type Nodes } from './node';
import { replaceNodes } from './nodeDecorateAction';
import { firebaseUser } from './firebaseAuth';
import {
	deleteFlowRemote,
	loadCloudLibrary,
	writeFlowJson,
	writeLibraryIndexJson
} from './firebaseFirestore';

let flowKey: NodeKey | null = null;
const savedNodesDatasMut: Writable<SavedNodesDatas> = writable(getSavedNodesDatas());
// export read-only version
export const savedNodesDatas = derived(savedNodesDatasMut, (value) => value);

export const MAX_SAVED_FLOWS = 20;

export type NodeKey = string;

export type SavedNodesData = {
	created: string;
	modified: string;
	flowInfos: { content: string; invert: boolean }[];
};

export type SavedNodesDatas = {
	[key: NodeKey]: SavedNodesData;
};

function newNodeKey(): NodeKey {
	return `flow:${newNodeId()}`;
}

let $nodes: Nodes;
nodes.subscribe((nodes) => {
	$nodes = nodes;
});

let $savedNodesDatasMut: SavedNodesDatas;

let cloudHydrating = false;
let cloudIndexTimer: ReturnType<typeof setTimeout> | null = null;
const cloudFlowTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleCloudIndexSync(index: SavedNodesDatas) {
	const uid = get(firebaseUser)?.uid;
	if (!uid || cloudHydrating) return;
	if (cloudIndexTimer != null) {
		clearTimeout(cloudIndexTimer);
	}
	cloudIndexTimer = setTimeout(() => {
		cloudIndexTimer = null;
		void writeLibraryIndexJson(uid, JSON.stringify(index)).catch((err) =>
			console.error('Firebase index sync failed', err)
		);
	}, 1500);
}

function scheduleCloudFlowSync(flowKey: NodeKey, json: string) {
	const uid = get(firebaseUser)?.uid;
	if (!uid || cloudHydrating) return;
	const prev = cloudFlowTimers.get(flowKey);
	if (prev != null) {
		clearTimeout(prev);
	}
	cloudFlowTimers.set(
		flowKey,
		setTimeout(() => {
			cloudFlowTimers.delete(flowKey);
			void writeFlowJson(uid, flowKey, json).catch((err) =>
				console.error('Firebase flow sync failed', err)
			);
		}, 2000)
	);
}

async function uploadLocalLibraryToCloud(uid: string) {
	const datas = getSavedNodesDatas();
	for (const key of Object.keys(datas)) {
		const raw = localStorage.getItem(key);
		if (raw != null) {
			await writeFlowJson(uid, key, raw);
		}
	}
	await writeLibraryIndexJson(uid, JSON.stringify(datas));
}

/** Call after Firebase sign-in: merge cloud into local, or push local to empty cloud. */
export async function applyCloudLibraryOnSignIn(uid: string): Promise<void> {
	const { index, bodies } = await loadCloudLibrary(uid);
	cloudHydrating = true;
	try {
		if (Object.keys(index).length === 0) {
			await uploadLocalLibraryToCloud(uid);
		} else {
			for (let i = localStorage.length - 1; i >= 0; i--) {
				const k = localStorage.key(i);
				if (k != null && k.startsWith('flow:')) {
					localStorage.removeItem(k);
				}
			}
			for (const [key, body] of Object.entries(bodies)) {
				localStorage.setItem(key, body);
			}
			localStorage.setItem('savedFlows', JSON.stringify(index));
			savedNodesDatasMut.set(index);
		}
	} finally {
		cloudHydrating = false;
	}
	unsetFlowKey();
}

savedNodesDatasMut.subscribe((value) => {
	$savedNodesDatasMut = value;
	localStorage.setItem('savedFlows', JSON.stringify(value));
	scheduleCloudIndexSync(value);
});

let lastSaveTime: number = Date.now();
export function maybeSaveNodes() {
	if (!isNodesWorthSaving($nodes)) return;
	const now = Date.now();
	if (now - lastSaveTime < 5000) return;
	lastSaveTime = now;
	saveNodes($nodes);
}

// used to indicate that a new flow was created, it's should be put in different save
export function unsetFlowKey() {
	flowKey = null;
}

subscribeFlowsChange(maybeSaveNodes);

export function getSavedNodesDatas(): SavedNodesDatas {
	const raw = localStorage.getItem('savedFlows');
	if (raw === null) {
		localStorage.setItem('savedFlows', JSON.stringify({}));
		return {};
	}
	return JSON.parse(raw);
}

export function loadSavedNodes(key: NodeKey, modifyOriginal = false) {
	const raw = localStorage.getItem(key);
	if (!raw) return;
	const nodesObj = JSON.parse(raw);
	if (raw === null) return [];
	const newNodes: Nodes = loadNodes(nodesObj);
	replaceNodes(newNodes);
	if (modifyOriginal) {
		flowKey = key;
	}
}

export function deleteNodes(key: NodeKey) {
	// update in case different tab
	savedNodesDatasMut.set(getSavedNodesDatas());

	const uid = get(firebaseUser)?.uid;
	if (uid != null && !cloudHydrating) {
		void deleteFlowRemote(uid, key).catch((err) => console.error('Firebase delete flow failed', err));
	}

	localStorage.removeItem(key);
	if (Object.hasOwn($savedNodesDatasMut, key)) {
		delete $savedNodesDatasMut[key];
		savedNodesDatasMut.set($savedNodesDatasMut);
	}
}
export function saveNodes(nodes: Nodes) {
	// update in case different tab
	savedNodesDatasMut.set(getSavedNodesDatas());
	const data: string = getJson(nodes);
	if (flowKey === null) {
		const newKey = newNodeKey();
		flowKey = newKey;
	}
	localStorage.setItem(flowKey, data);
	// update saved nodes
	$savedNodesDatasMut[flowKey] = {
		created: $savedNodesDatasMut[flowKey]?.created ?? new Date().toISOString(),
		modified: new Date().toISOString(),
		flowInfos: nodes.root.children.map((flowId) => {
			return {
				content: getNode(nodes, flowId).unwrap().value.content,
				invert: getNode(nodes, flowId).unwrap().value.invert
			};
		})
	};
	// delete old nodes
	const keys = Object.keys($savedNodesDatasMut);
	if (keys.length > MAX_SAVED_FLOWS) {
		const oldestKey = keys.reduce((a, b) => {
			if ($savedNodesDatasMut[a].modified < $savedNodesDatasMut[b].modified) {
				return a;
			} else {
				return b;
			}
		});
		const uidDrop = get(firebaseUser)?.uid;
		if (uidDrop != null && !cloudHydrating) {
			void deleteFlowRemote(uidDrop, oldestKey).catch((err) =>
				console.error('Firebase delete oldest flow failed', err)
			);
		}
		delete $savedNodesDatasMut[oldestKey];
		localStorage.removeItem(oldestKey);
	}
	savedNodesDatasMut.set($savedNodesDatasMut);
	scheduleCloudFlowSync(flowKey, data);
}

export function downloadSavedNodes(key: NodeKey) {
	const raw = localStorage.getItem(key);
	if (raw === null) return;
	const data = JSON.parse(raw);
	downloadString(JSON.stringify(data), 'flow.json');
}
