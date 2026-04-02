<script lang="ts">
	import { goto } from '$app/navigation';
	import Button from '$lib/components/Button.svelte';
	import FirebaseAccount from '$lib/components/FirebaseAccount.svelte';
	import { openPopup } from '$lib/models/popup';
	import {
		savedNodesDatas,
		loadSavedNodes,
		deleteNodes,
		renameRound,
		initNewRound,
		type SavedNodesData,
		type NodeKey
	} from '$lib/models/autoSave';
	import { firebaseUser } from '$lib/models/firebaseAuth';
	import { replaceNodes } from '$lib/models/nodeDecorateAction';
	import { newNodes } from '$lib/models/store';
	import { settings } from '$lib/models/settings';
	import { onMount, onDestroy } from 'svelte';

	// Create round form
	let showCreateForm = false;
	let newRoundName = '';

	function handleCreateRound() {
		const name = newRoundName.trim();
		if (!name) return;
		// Reset workspace
		replaceNodes(newNodes());
		initNewRound(name);
		newRoundName = '';
		showCreateForm = false;
		goto('/app');
	}

	function handleCreateKey(e: KeyboardEvent) {
		if (e.key === 'Enter') handleCreateRound();
		if (e.key === 'Escape') {
			showCreateForm = false;
			newRoundName = '';
		}
	}

	function openRound(key: NodeKey) {
		loadSavedNodes(key, true);
		goto('/app');
	}

	function getRoundDisplayName(data: SavedNodesData): string {
		if (data.name) return data.name;
		if (data.flowInfos.length > 0) {
			return data.flowInfos.map((f) => f.content).join(', ');
		}
		return 'Untitled Round';
	}

	function prettyDate(date: string) {
		const today = new Date();
		const dateObj = new Date(date);
		if (
			today.getDate() === dateObj.getDate() &&
			today.getMonth() === dateObj.getMonth() &&
			today.getFullYear() === dateObj.getFullYear()
		) {
			return dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true });
		}
		return dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
	}

	$: sortedRounds = Object.entries($savedNodesDatas).sort(
		(a, b) => new Date(b[1].modified).getTime() - new Date(a[1].modified).getTime()
	);

	let expandedKey: string | null = null;
	let renamingKey: string | null = null;
	let renameValue = '';

	function startRename(key: string, currentName: string) {
		renamingKey = key;
		renameValue = currentName;
	}

	function commitRename(key: string) {
		const name = renameValue.trim();
		if (name) renameRound(key, name);
		renamingKey = null;
	}

	function handleRenameKey(e: KeyboardEvent, key: string) {
		if (e.key === 'Enter') commitRename(key);
		if (e.key === 'Escape') renamingKey = null;
	}

	onMount(() => {
		document.body.classList.remove('app');
	});
</script>

<main class="palette-plain">
	<div class="page">
		<!-- Top nav -->
		<header class="topbar">
			<a href="/" class="logo">Flower</a>
			<div class="nav-right">
				<Button
					icon="addPerson"
					onclick={() => openPopup(FirebaseAccount, 'Account')}
					tooltip="account & cloud sync"
				/>
			</div>
		</header>

		<section class="content">
			<div class="section-header">
				<h1>Your Rounds</h1>
				<Button
					palette="accent"
					icon="add"
					text="new round"
					onclick={() => {
						showCreateForm = true;
						setTimeout(() => {
							const el = document.getElementById('new-round-input');
							if (el) el.focus();
						}, 50);
					}}
				/>
			</div>

			{#if showCreateForm}
				<div class="create-form palette-plain">
					<input
						id="new-round-input"
						class="round-input"
						type="text"
						placeholder="Round name (e.g. Semifinals – Team A vs Team B)"
						bind:value={newRoundName}
						on:keydown={handleCreateKey}
					/>
					<div class="form-buttons">
						<Button
							palette="accent"
							icon="add"
							text="create"
							onclick={handleCreateRound}
							disabled={newRoundName.trim() === ''}
						/>
						<Button
							icon="delete"
							text="cancel"
							onclick={() => {
								showCreateForm = false;
								newRoundName = '';
							}}
						/>
					</div>
				</div>
			{/if}

			{#if sortedRounds.length === 0 && !showCreateForm}
				<div class="empty-state">
					<p>No rounds yet. Create one to get started!</p>
					<Button
						palette="accent"
						icon="add"
						text="create your first round"
						onclick={() => {
							showCreateForm = true;
							setTimeout(() => {
								const el = document.getElementById('new-round-input');
								if (el) el.focus();
							}, 50);
						}}
					/>
				</div>
			{/if}

			<div class="rounds" class:customScrollbar={settings.data.customScrollbar.value}>
				{#each sortedRounds as [key, data] (key)}
					<div class="round-card palette-plain">
						<div class="round-main">
							<div class="round-info">
								<div class="round-name">{getRoundDisplayName(data)}</div>
								<div class="round-meta">
									<span class="meta-tag">edited {prettyDate(data.modified)}</span>
									{#each data.flowInfos as info}
										<span
											class="flow-chip"
											class:palette-accent={!info.invert}
											class:palette-accent-secondary={info.invert}
										>{info.content}</span>
									{/each}
								</div>
							</div>
							<div class="round-actions">
								<Button
									icon="open"
									text="open"
									onclick={() => openRound(key)}
								/>
								<Button
									icon="ellipses"
									onclick={() => {
										expandedKey = expandedKey === key ? null : key;
									}}
									tooltip="more options"
								/>
							</div>
						</div>
						{#if expandedKey === key}
							<div class="round-expanded">
								{#if renamingKey === key}
									<input
										class="rename-input"
										type="text"
										bind:value={renameValue}
										on:keydown={(e) => handleRenameKey(e, key)}
										on:blur={() => commitRename(key)}
										autofocus
									/>
								{:else}
									<div class="expanded-left">
										<span class="meta-tag">created {prettyDate(data.created)}</span>
										<Button
											icon="redo"
											text="rename"
											onclick={() => startRename(key, getRoundDisplayName(data))}
										/>
									</div>
								{/if}
								<Button
									icon="trash"
									text="delete"
									onclick={() => {
										deleteNodes(key);
										if (expandedKey === key) expandedKey = null;
									}}
								/>
							</div>
						{/if}
					</div>
				{/each}
			</div>

			{#if !$firebaseUser}
				<p class="signin-hint">
					<a href="#account" on:click|preventDefault={() => openPopup(FirebaseAccount, 'Account')}>
						Sign in
					</a>
					to sync rounds across devices.
				</p>
			{/if}
		</section>
	</div>
</main>

<style>
	main {
		min-height: 100vh;
		background: var(--background-back);
	}

	.page {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
		max-width: 800px;
		margin: 0 auto;
		padding: 0 var(--padding);
		box-sizing: border-box;
	}

	.topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--padding) 0;
		border-bottom: 1px solid var(--background-indent);
	}

	.logo {
		font-size: 1.4em;
		font-weight: var(--font-weight-bold);
		color: var(--text);
		text-decoration: none;
	}

	.logo:hover {
		color: var(--color-accent);
	}

	.nav-right {
		display: flex;
		gap: var(--padding);
		align-items: center;
	}

	.content {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: calc(var(--padding) * 2);
		padding: calc(var(--padding) * 2) 0 calc(var(--padding) * 4);
	}

	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.section-header h1 {
		margin: 0;
		font-size: 1.6em;
	}

	.create-form {
		display: flex;
		flex-direction: column;
		gap: var(--padding);
		padding: var(--padding);
		border-radius: var(--border-radius);
		background: var(--background);
	}

	.round-input {
		background: var(--background-indent);
		border: none;
		border-radius: var(--border-radius);
		padding: var(--padding-small) var(--padding);
		font-family: inherit;
		font-size: 1em;
		color: var(--text);
		width: 100%;
		box-sizing: border-box;
	}

	.round-input:focus {
		outline: 2px solid var(--color-accent);
	}

	.form-buttons {
		display: flex;
		gap: var(--padding);
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--padding);
		padding: calc(var(--padding) * 4);
		color: var(--text-weak);
		text-align: center;
	}

	.empty-state p {
		margin: 0;
	}

	.rounds {
		display: flex;
		flex-direction: column;
		gap: var(--padding);
	}

	.round-card {
		border-radius: var(--border-radius);
		background: var(--background);
		padding: var(--padding);
		display: flex;
		flex-direction: column;
		gap: var(--padding);
	}

	.round-main {
		display: flex;
		align-items: center;
		gap: var(--padding);
	}

	.round-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: var(--padding-small);
	}

	.round-name {
		font-weight: var(--font-weight-bold);
		font-size: 1em;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.round-meta {
		display: flex;
		align-items: center;
		gap: var(--padding-small);
		flex-wrap: wrap;
	}

	.meta-tag {
		font-size: 0.8em;
		color: var(--text-weak);
	}

	.flow-chip {
		font-size: 0.8em;
		padding: 2px var(--padding-small);
		border-radius: calc(var(--border-radius) / 2);
		background: var(--this-background-indent);
		color: var(--this-text);
		white-space: nowrap;
	}

	.round-actions {
		display: flex;
		gap: var(--padding-small);
		flex-shrink: 0;
	}

	.round-expanded {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--padding);
		padding-top: var(--padding-small);
		border-top: 1px solid var(--background-indent);
	}

	.expanded-left {
		display: flex;
		align-items: center;
		gap: var(--padding);
	}

	.rename-input {
		flex: 1;
		background: var(--background-indent);
		border: none;
		outline: 2px solid var(--color-accent);
		border-radius: var(--border-radius);
		padding: var(--padding-small) var(--padding);
		font-family: inherit;
		font-size: 0.9em;
		color: var(--text);
	}

	.signin-hint {
		text-align: center;
		color: var(--text-weak);
		font-size: 0.85em;
	}

	.signin-hint a {
		color: var(--color-accent);
		text-decoration: none;
	}

	.signin-hint a:hover {
		text-decoration: underline;
	}
</style>
