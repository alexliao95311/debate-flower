import { getFirebaseApp } from '$lib/firebase/config';
import {
	getFirestore,
	doc,
	getDoc,
	setDoc,
	deleteDoc,
	serverTimestamp,
	type Firestore
} from 'firebase/firestore';
import type { SavedNodesDatas } from './autoSave';

const LIBRARY_DOC = 'library';

function db(): Firestore {
	const app = getFirebaseApp();
	if (!app) {
		throw new Error('Firebase is not configured');
	}
	return getFirestore(app);
}

export function libraryDocRef(uid: string) {
	return doc(db(), 'users', uid, 'meta', LIBRARY_DOC);
}

export function flowDocRef(uid: string, flowKey: string) {
	return doc(db(), 'users', uid, 'savedFlows', flowKey);
}

export type CloudLibrary = {
	index: SavedNodesDatas;
	bodies: Record<string, string>;
};

export async function loadCloudLibrary(uid: string): Promise<CloudLibrary> {
	const libSnap = await getDoc(libraryDocRef(uid));
	if (!libSnap.exists()) {
		return { index: {}, bodies: {} };
	}
	const raw = libSnap.data()?.indexJson as string | undefined;
	if (raw == null || raw === '') {
		return { index: {}, bodies: {} };
	}
	let index: SavedNodesDatas;
	try {
		index = JSON.parse(raw) as SavedNodesDatas;
	} catch {
		return { index: {}, bodies: {} };
	}
	const bodies: Record<string, string> = {};
	for (const flowKey of Object.keys(index)) {
		const flowSnap = await getDoc(flowDocRef(uid, flowKey));
		if (flowSnap.exists()) {
			const json = flowSnap.data()?.json as string | undefined;
			if (json != null) {
				bodies[flowKey] = json;
			}
		}
	}
	return { index, bodies };
}

export async function writeLibraryIndexJson(uid: string, indexJson: string): Promise<void> {
	await setDoc(
		libraryDocRef(uid),
		{
			indexJson,
			updatedAt: serverTimestamp()
		},
		{ merge: true }
	);
}

export async function writeFlowJson(uid: string, flowKey: string, json: string): Promise<void> {
	await setDoc(flowDocRef(uid, flowKey), {
		json,
		updatedAt: serverTimestamp()
	});
}

export async function deleteFlowRemote(uid: string, flowKey: string): Promise<void> {
	await deleteDoc(flowDocRef(uid, flowKey));
}
