# Firebase (account + saved flows)

## 1. Create a project

In [Firebase Console](https://console.firebase.google.com/), create a project and add a **Web** app. Copy the config object values.

## 2. Environment variables

In the project root, create or extend `.env` (never commit real secrets to git):

```
PUBLIC_FIREBASE_API_KEY=...
PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
PUBLIC_FIREBASE_PROJECT_ID=your-project-id
PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
PUBLIC_FIREBASE_APP_ID=...
PUBLIC_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
```

`PUBLIC_FIREBASE_MEASUREMENT_ID` is optional; omit it if you do not use Firebase Analytics.

SvelteKit exposes only `PUBLIC_*` variables to the browser. Restart `npm run dev` after changes.

## 3. Authentication

1. Firebase Console → **Build → Authentication → Sign-in method**
2. Enable **Google** (and add support email).
3. Under **Settings → Authorized domains**, add `localhost` for local dev and your production domain.

## 4. Firestore

1. **Build → Firestore Database** → create database (production mode is fine once rules are deployed).
2. Deploy rules from this folder, or paste `firestore.rules` in the Rules tab:

```bash
firebase deploy --only firestore:rules
```

(Requires [Firebase CLI](https://firebase.google.com/docs/cli) and `firebase init` linking this project.)

Rules restrict each user to `users/{theirUid}/...` only.

## 5. Data layout

- `users/{uid}/meta/library` — document with `indexJson` (stringified saved-flow index).
- `users/{uid}/savedFlows/{flowKey}` — document with `json` (same payload as local `flow:*` entries).

The app still keeps a **local cache** in `localStorage` for speed; while signed in it syncs changes to Firestore with a short debounce.

## 6. First sign-in behavior

- If your cloud library is **empty**, current browser saves are **uploaded**.
- If the cloud already has flows, the cloud copy **replaces** the local saved-flow list (local `flow:*` keys are cleared first).
