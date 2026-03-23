<script lang="ts">
	import { dev } from '$app/environment';
	import Button from './Button.svelte';
	import { firebaseUser, firebaseAuthAvailable, signInWithGoogle, signOutFirebase } from '$lib/models/firebaseAuth';

	export let closePopup: () => void;

	let busy = false;
	let errorMessage: string | null = null;

	async function onGoogle() {
		errorMessage = null;
		busy = true;
		try {
			await signInWithGoogle();
			closePopup();
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : 'Sign-in failed';
		} finally {
			busy = false;
		}
	}

	async function onSignOut() {
		busy = true;
		try {
			await signOutFirebase();
			closePopup();
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : 'Sign-out failed';
		} finally {
			busy = false;
		}
	}
</script>

<div class="firebase-account palette-plain">
	{#if !firebaseAuthAvailable()}
		<p class="muted">
			Firebase env vars are missing or the app was started without loading <code>.env</code>. Put your
			web app keys in a <code>.env</code> file at the project root (same folder as
			<code>package.json</code>), matching <code>.env.example</code>, then run
			<code>npm run dev</code> again from that folder.
		</p>
		{#if dev}
			<p class="muted small">
				Tip: after editing <code>.env</code>, stop the dev server and start it again. For production,
				set the same <code>PUBLIC_FIREBASE_*</code> variables on your host (e.g. Vercel) and redeploy.
			</p>
		{/if}
	{:else if $firebaseUser == null}
		<p>
			Sign in to sync saved flows to your Google account. Data stays in your browser as a cache and
			is copied to Firestore while you are signed in.
		</p>
		<Button
			text={busy ? 'signing in…' : 'sign in with Google'}
			icon="addPerson"
			palette="accent"
			disabled={busy}
			onclick={onGoogle}
		/>
	{:else}
		<p class="signed-in-line">
			Signed in as <span class="email">{$firebaseUser.email ?? $firebaseUser.uid}</span>
		</p>
		<p class="muted">
			Saved flows sync to the cloud automatically. This device keeps a local copy for speed and
			offline use.
		</p>
		<div class="actions">
			<Button text={busy ? 'signing out…' : 'sign out'} icon="delete" disabled={busy} onclick={onSignOut} />
		</div>
	{/if}
	{#if errorMessage != null}
		<p class="error">{errorMessage}</p>
	{/if}
</div>

<style>
	.firebase-account {
		width: min(calc(100vw - var(--padding) * 4), 420px);
		padding: var(--padding);
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: var(--padding);
		align-items: flex-start;
	}
	.signed-in-line {
		width: 100%;
	}
	.actions {
		margin-top: var(--padding-small);
	}
	p {
		margin: 0;
		line-height: 1.45;
	}
	.muted {
		color: var(--text-weak);
		font-size: 0.9rem;
	}
	.small {
		font-size: 0.82rem;
	}
	.email {
		color: var(--text-accent);
		word-break: break-all;
	}
	.error {
		color: var(--text-accent-secondary);
	}
	code {
		font-size: 0.85em;
	}
</style>
