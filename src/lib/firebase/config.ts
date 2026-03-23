import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';

/** Read a public env var (SvelteKit `$env/dynamic/public` — reliable vs raw `import.meta.env`). */
function publicEnv(name: string): string {
	const v = (env as Record<string, string | undefined>)[name];
	return typeof v === 'string' ? v : '';
}

function startFirebaseAnalytics(app: FirebaseApp): void {
	const mid = publicEnv('PUBLIC_FIREBASE_MEASUREMENT_ID');
	if (mid.length === 0) {
		return;
	}
	void import('firebase/analytics').then(({ getAnalytics, isSupported }) =>
		isSupported().then((yes) => {
			if (yes) {
				getAnalytics(app);
			}
		})
	);
}

export function isFirebaseConfigured(): boolean {
	return (
		publicEnv('PUBLIC_FIREBASE_API_KEY').length > 0 &&
		publicEnv('PUBLIC_FIREBASE_PROJECT_ID').length > 0
	);
}

export function getFirebaseApp(): FirebaseApp | null {
	if (!browser || !isFirebaseConfigured()) {
		return null;
	}
	if (getApps().length > 0) {
		return getApps()[0]!;
	}
	const pick = (v: string) => (v.length > 0 ? v : undefined);
	const app = initializeApp({
		apiKey: publicEnv('PUBLIC_FIREBASE_API_KEY'),
		authDomain: pick(publicEnv('PUBLIC_FIREBASE_AUTH_DOMAIN')),
		projectId: publicEnv('PUBLIC_FIREBASE_PROJECT_ID'),
		storageBucket: pick(publicEnv('PUBLIC_FIREBASE_STORAGE_BUCKET')),
		messagingSenderId: pick(publicEnv('PUBLIC_FIREBASE_MESSAGING_SENDER_ID')),
		appId: pick(publicEnv('PUBLIC_FIREBASE_APP_ID')),
		measurementId: pick(publicEnv('PUBLIC_FIREBASE_MEASUREMENT_ID'))
	});
	startFirebaseAnalytics(app);
	return app;
}
