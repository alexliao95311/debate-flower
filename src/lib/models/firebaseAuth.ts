import { browser } from '$app/environment';
import { writable } from 'svelte/store';
import type { User } from 'firebase/auth';
import {
	getAuth,
	onAuthStateChanged,
	GoogleAuthProvider,
	signInWithPopup,
	signOut,
	setPersistence,
	browserLocalPersistence
} from 'firebase/auth';
import { getFirebaseApp, isFirebaseConfigured } from '$lib/firebase/config';

export const firebaseUser = writable<User | null>(null);

let initialized = false;

export function firebaseAuthAvailable(): boolean {
	return browser && isFirebaseConfigured();
}

export async function initFirebaseAuth(onSignedIn: (uid: string) => void | Promise<void>): Promise<void> {
	if (!firebaseAuthAvailable()) {
		return;
	}
	const app = getFirebaseApp();
	if (!app || initialized) {
		return;
	}
	initialized = true;
	const auth = getAuth(app);
	await setPersistence(auth, browserLocalPersistence);
	onAuthStateChanged(auth, async (user) => {
		firebaseUser.set(user);
		if (user) {
			await onSignedIn(user.uid);
		}
	});
}

export async function signInWithGoogle(): Promise<void> {
	const app = getFirebaseApp();
	if (!app) {
		throw new Error('Firebase is not configured');
	}
	const auth = getAuth(app);
	const provider = new GoogleAuthProvider();
	await signInWithPopup(auth, provider);
}

export async function signOutFirebase(): Promise<void> {
	const app = getFirebaseApp();
	if (!app) {
		return;
	}
	const auth = getAuth(app);
	await signOut(auth);
}
