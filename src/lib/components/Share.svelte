<script lang="ts">
	import Button from './Button.svelte';
	import { createRoom, disconnect, getRoomLink, wsRoom } from '$lib/models/wsRoom';
	import { ensureSavedAndGetFlowKey } from '$lib/models/autoSave';

	export let closePopup = () => {};

	let copied = false;

	function copyText(text: string) {
		if (navigator.clipboard?.writeText) {
			navigator.clipboard.writeText(text);
		} else {
			const el = document.createElement('textarea');
			el.value = text;
			el.style.position = 'fixed';
			el.style.opacity = '0';
			document.body.appendChild(el);
			el.select();
			document.execCommand('copy');
			document.body.removeChild(el);
		}
	}

	function copyLink() {
		const state = $wsRoom;
		if (state.tag !== 'connected') return;
		copyText(getRoomLink(state.roomId));
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	function handleShare() {
		const roundKey = ensureSavedAndGetFlowKey();
		createRoom(roundKey);
	}
</script>

<div class="top palette-plain">
	{#if $wsRoom.tag === 'disconnected'}
		<div class="explain">
			<p>Share this round — anyone with the link can join and edit live.</p>
		</div>
		<Button palette="accent" icon="add" text="share round" on:click={handleShare} />
	{:else if $wsRoom.tag === 'connecting'}
		<div class="status">
			<p>Connecting…</p>
		</div>
	{:else if $wsRoom.tag === 'connected'}
		<div class="info">
			<div class="peers">
				<span class="dot" />
				<span>{$wsRoom.peerCount} {$wsRoom.peerCount === 1 ? 'person' : 'people'} in this round</span>
			</div>
			<div class="linkrow">
				<input class="linkinput" readonly value={getRoomLink($wsRoom.roomId)} />
				<Button
					palette="accent"
					icon={copied ? 'check' : 'copy'}
					text={copied ? 'copied!' : 'copy link'}
					on:click={copyLink}
				/>
			</div>
			<p class="hint">Share this link with anyone to collaborate live.</p>
		</div>
	{/if}

	<div class="controls">
		{#if $wsRoom.tag === 'connected'}
			<Button icon="delete" text="stop sharing" on:click={disconnect} />
		{/if}
	</div>
</div>

<style>
	.top {
		width: min(calc(100vw - var(--padding) * 2), 520px);
		padding: var(--padding);
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--padding);
	}

	.explain {
		text-align: center;
	}

	p {
		line-height: 1.5em;
		margin: 0;
	}

	.status {
		padding: var(--padding);
		color: var(--text-weak);
	}

	.info {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: var(--padding);
	}

	.peers {
		display: flex;
		align-items: center;
		gap: var(--padding-small);
		font-size: 0.9em;
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--color-accent);
		display: inline-block;
		flex-shrink: 0;
	}

	.linkrow {
		display: flex;
		gap: var(--padding-small);
		align-items: center;
		width: 100%;
	}

	.linkinput {
		flex: 1;
		min-width: 0;
		background: var(--background-indent);
		border: none;
		border-radius: var(--border-radius);
		padding: var(--padding-small) var(--padding);
		font-family: inherit;
		font-size: 0.85em;
		color: var(--text);
		cursor: text;
	}

	.hint {
		font-size: 0.85em;
		color: var(--text-weak);
	}

	.controls {
		width: 100%;
		display: flex;
		justify-content: flex-end;
		padding-top: var(--padding-small);
	}
</style>
