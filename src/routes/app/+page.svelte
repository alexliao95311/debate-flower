<script lang="ts">
	import Flow from '$lib/components/Flow.svelte';
	import Title from '$lib/components/Title.svelte';
	import BoxControl from '$lib/components/BoxControl.svelte';
	import Button from '$lib/components/Button.svelte';
	import DownloadUpload from '$lib/components/DownloadUpload.svelte';
	import Message from '$lib/components/Message.svelte';
	import Settings from '$lib/components/Settings.svelte';
	import SortableList from '$lib/components/SortableList.svelte';
	import AddTab from '$lib/components/AddTab.svelte';
	import Share from '$lib/components/Share.svelte';
	import FirebaseAccount from '$lib/components/FirebaseAccount.svelte';
	import Tab from '$lib/components/Tab.svelte';
	import { dev } from '$app/environment';
	import { openPopup } from '$lib/models/popup';
	import type { FlowId, Nodes } from '$lib/models/node';
	import { onDestroy, onMount } from 'svelte';
	import { activeMouse, flowsChange, nodes, pendingAction } from '$lib/models/store';
	import { createKeyDownHandler } from '$lib/models/key';
	import { loadNodes, importSettingsJson } from '$lib/models/file';
	import Help from '$lib/components/Help.svelte';
	import { settings } from '$lib/models/settings';
	import SideDoc from '$lib/components/SideDoc.svelte';
	import { history } from '$lib/models/history';
	import { focusId, lastFocusIds, selectedFlowId } from '$lib/models/focus';
	import { isChangelogVersionCurrent } from '$lib/models/version';
	import { addNewFlow, deleteFlow, moveFlow, replaceNodes } from '$lib/models/nodeDecorateAction';
	import { getDebateStyleFlow, type DebateStyleFlow } from '$lib/models/debateStyle';
	import { wsRoom, parseRoomParam, sendRoundName, onRoundNameFromPeer, setLocalRoundName } from '$lib/models/wsRoom';
	import { currentRoundName } from '$lib/models/autoSave';
	import { goto } from '$app/navigation';

	$: unsavedChanges = $nodes.root.children.length > 0;

	// If no round is active and no room link, send user to /home
	let redirecting = false;
	onMount(() => {
		const hasRoomParam = parseRoomParam() != null;
		if (!hasRoomParam && $currentRoundName === '' && $nodes.root.children.length === 0) {
			redirecting = true;
			goto('/home');
			return;
		}

		window.addEventListener('dragover', (e) => e.preventDefault(), false);
		window.addEventListener('drop', (e) => e.preventDefault(), false);
		window.addEventListener('beforeunload', function (e) {
			if (unsavedChanges && !dev) {
				let confirmationMessage = 'Are you sure you want to leave?';
				e.returnValue = confirmationMessage;
				return confirmationMessage;
			}
		});
	});

	let showSideDoc: boolean = settings.data['showSideDoc'].value as boolean;

	onDestroy(
		settings.subscribe(['showSideDoc'], (key: string) => {
			showSideDoc = settings.data[key].value as boolean;
		})
	);

	function clickTab(id: FlowId) {
		blurFlow();
		$selectedFlowId = id;
		focusFlow();
	}
	function focusFlow() {
		if ($selectedFlowId == null) return;
		let lastFocus = $lastFocusIds[$selectedFlowId];
		if (lastFocus == null) {
			lastFocus = $selectedFlowId;
		}
		$focusId = lastFocus;
	}
	function blurFlow() {
		$focusId = null;
	}

	function addFlow(style: DebateStyleFlow) {
		blurFlow();
		let id = addNewFlow($nodes.root.children.length, style, switchSpeakers);
		if (id != null) {
			$selectedFlowId = id;
			focusFlow();
		}
	}

	async function deleteFlowAndFocus() {
		if ($selectedFlowId == null) return;

		blurFlow();

		let oldIndex = $nodes.root.children.indexOf($selectedFlowId);
		deleteFlow($selectedFlowId);

		let nextIndex;
		if (oldIndex == 0) {
			nextIndex = 0;
		} else {
			nextIndex = oldIndex - 1;
		}
		if ($nodes.root.children.length > 0) {
			$selectedFlowId = $nodes.root.children[nextIndex];
			focusFlow();
		} else {
			$selectedFlowId = null;
		}
	}

	function handleSort(e: { detail: { from: number; to: number } }) {
		let { from, to } = e.detail;
		if (from > to) {
			to += 1;
		}
		moveFlow($nodes.root.children[from], to);
	}

	function handleMouseMove(e: MouseEvent) {
		$activeMouse = true;
	}
	const keyDownHandler = createKeyDownHandler({
		control: {
			n: {
				handle: () => {
					const style = getDebateStyleFlow("primary");
					if (style == null) return;
					addFlow(style);
				},
				require: () => getDebateStyleFlow("primary") != null && hasRound
			}
		},
		'control shift': {
			n: {
				handle: () => {
					const style = getDebateStyleFlow("secondary");
					if (style == null) return;
					addFlow(style);
				},
				require: () => getDebateStyleFlow("secondary") != null && hasRound
			}
		},
		'commandControl shift': {
			z: {
				handle: () => {
					if ($selectedFlowId == null) return;
					history.redo($selectedFlowId, $pendingAction);
				},
				require: () => {
					if ($selectedFlowId == null) return false;
					return history.canRedo($selectedFlowId, $pendingAction);
				},
				stopRepeat: false,
				preventDefault: 'always'
			}
		},
		commandControl: {
			z: {
				handle: () => {
					if ($selectedFlowId == null) return;
					history.undo($selectedFlowId, $pendingAction);
				},
				require: () => {
					if ($selectedFlowId == null) return false;
					return history.canUndo($selectedFlowId, $pendingAction);
				},
				stopRepeat: false,
				preventDefault: 'always'
			}
		},
		'commandControl alt': {
			ArrowUp: {
				handle: () => {
					if ($selectedFlowId == null) return;
					let index =
						($nodes.root.children.indexOf($selectedFlowId) - 1) % $nodes.root.children.length;
					if (index < 0) {
						index = $nodes.root.children.length - 1;
					}
					clickTab($nodes.root.children[index]);
				},
				require: () => $nodes.root.children.length > 0,
				stopRepeat: false
			},
			ArrowDown: {
				handle: () => {
					if ($selectedFlowId == null) return;
					let index =
						($nodes.root.children.indexOf($selectedFlowId) + 1) % $nodes.root.children.length;
					clickTab($nodes.root.children[index]);
				},
				require: () => $nodes.root.children.length > 0,
				stopRepeat: false
			}
		}
	});
	function handleKeydown(e: KeyboardEvent) {
		$activeMouse = false;
		keyDownHandler(e);
	}

	function readUploadDragged(e: DragEvent) {
		e.preventDefault();
		let file = e?.dataTransfer?.files[0];
		if (file == undefined) {
			return;
		}

		let reader: FileReader = new FileReader();
		reader.onload = function (fileLoadedEvent) {
			let uploadData = fileLoadedEvent.target?.result;
			if (uploadData == undefined) return;
			handleUpload(uploadData.toString());
		};
		// check if can readAsText
		if (file.type == 'text/plain') {
			reader.readAsText(file, 'UTF-8');
		} else if (file.type == 'application/json') {
			reader.readAsText(file, 'UTF-8');
		} else {
			openPopup(Message, 'File Message', {
				message: 'Invalid file',
				error: true
			});
		}
	}
	function readUpload() {
		const fileInput = document.getElementById('uploadId') as HTMLInputElement;
		if (!fileInput?.files?.length) return;
		const file = fileInput.files[0];

		let reader: FileReader = new FileReader();
		reader.onload = function (fileLoadedEvent) {
			let uploadData = fileLoadedEvent.target?.result;
			if (uploadData == undefined) return;
			handleUpload(uploadData.toString());

			fileInput.value = ''; // allow for the same file to be reuploaded
		};
		reader.readAsText(file, 'UTF-8');
	}

	function preventDefault(e: { preventDefault: () => void }) {
		e.preventDefault();
	}

	async function handleUpload(data: string) {
		let dataObj = JSON.parse(data);
		if (dataObj["isSettings"]) {
			importSettingsJson(dataObj);
			return;
		}

		let newNodes: Nodes | null = null;
		try {
			newNodes = loadNodes(dataObj);
		} catch (e) {
			openPopup(Message, 'File Message', {
				message: 'Invalid file',
				error: true
			});
		}
		if (newNodes != null) {
			if (!unsavedChanges || confirm('Are you sure you want to overwrite your current flows?')) {
				replaceNodes(newNodes);
				$selectedFlowId = null;
				flowsChange();
			}
		}
	}

	let switchSpeakers = false;

	// Keep wsRoom's internal round name in sync with the store (without circular imports)
	onMount(() => {
		// Push current value immediately
		setLocalRoundName($currentRoundName);
		// Register callback so incoming peer round_name updates the store
		onRoundNameFromPeer((name) => {
			currentRoundName.set(name);
		});
	});

	onDestroy(() => {
		onRoundNameFromPeer(null as any);
	});

	// Reactively broadcast outgoing round name changes to peers
	let prevRoundName = '';
	$: if ($currentRoundName !== prevRoundName) {
		prevRoundName = $currentRoundName;
		setLocalRoundName($currentRoundName);
		sendRoundName($currentRoundName);
	}

	// Custom scrollbar/overflow logic
	onMount(() => {
		document.body.classList.add("app");
	});

	onDestroy(() => {
		document.body.classList.remove("app");
		document.body.classList.remove("customScrollbar");
	});

	$: {
		if (settings.data.customScrollbar.value) {
			document.body.classList.add("customScrollbar");
		} else {
			document.body.classList.remove("customScrollbar");
		}
	}

	function fixScroll(event: Event) {
		const el = event.currentTarget as HTMLDivElement;
		if (el.scrollTop !== 0) {
			el.scrollTop = 0;
		}
	}

	$: hasRound = $currentRoundName !== '' || $nodes.root.children.length > 0;

	// Inline round name editing
	let editingRoundName = false;
	let roundNameEditValue = '';

	function startEditRoundName() {
		roundNameEditValue = $currentRoundName;
		editingRoundName = true;
	}

	function commitRoundName() {
		const name = roundNameEditValue.trim();
		if (name) $currentRoundName = name;
		editingRoundName = false;
	}

	function handleRoundNameEditKey(e: KeyboardEvent) {
		if (e.key === 'Enter') commitRoundName();
		if (e.key === 'Escape') editingRoundName = false;
	}

	// Connection indicator state
	$: wsConnected = $wsRoom.tag === 'connected';
	$: wsConnecting = $wsRoom.tag === 'connecting';
</script>

<svelte:body
	on:keydown={handleKeydown}
	on:mousemove={handleMouseMove}
	on:dragenter={preventDefault}
	on:drop={readUploadDragged}
/>
<main class:activeMouse class="palette-plain">
	<input id="uploadId" type="file" hidden on:change={readUpload} />
	<div class="grid">
		<div class="sidebar">
			<!-- Top header: home, account, share -->
			<div class="header">
				<div class="top-buttons">
					<Button
						icon="home"
						link="/home"
						tooltip="home"
					/>
					<Button
						icon="addPerson"
						onclick={() => openPopup(FirebaseAccount, 'Account')}
						tooltip="account & cloud sync"
					/>
					<div class="share-btn-wrapper">
						<Button
							icon="people"
							onclick={() => openPopup(Share, 'Share')}
							tooltip="share"
						/>
						<span
							class="share-indicator"
							class:connected={wsConnected}
							class:connecting={wsConnecting}
							class:disconnected={!wsConnected && !wsConnecting}
						>
							{#if wsConnected}
								<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" width="8" height="8"><path d="M88.7817 29.2843L39.2842 78.7817L11 50.4975" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/></svg>
							{:else}
								<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" width="8" height="8"><path d="M78.5685 22L22 78.5685" stroke-width="15" stroke-linecap="round"/><path d="M22 22L78.5685 78.5685" stroke-width="15" stroke-linecap="round"/></svg>
							{/if}
						</span>
					</div>
				</div>
			</div>

			<!-- Round name display / edit -->
			{#if hasRound}
				<div class="round-name-bar">
					{#if editingRoundName}
						<!-- svelte-ignore a11y-autofocus -->
						<input
							class="round-name-edit"
							type="text"
							bind:value={roundNameEditValue}
							on:keydown={handleRoundNameEditKey}
							on:blur={commitRoundName}
							autofocus
						/>
					{:else}
						<button class="round-name-label" on:click={startEditRoundName} title="click to rename">
							{$currentRoundName || 'Round'}
						</button>
					{/if}
				</div>
			{/if}

			<!-- Tabs area -->
			<div class="tabs" class:customScrollbar={settings.data.customScrollbar.value}>
				{#if hasRound}
					<div class="tabScroll">
						<SortableList list={$nodes.root.children} on:sort={handleSort} let:index>
							<Tab
								on:click={() => clickTab($nodes.root.children[index])}
								flowId={$nodes.root.children[index]}
								selected={$selectedFlowId == $nodes.root.children[index]}
							/>
						</SortableList>
						<AddTab {addFlow} bind:switchSpeakers />
					</div>
				{/if}
			</div>

			<!-- Bottom: file, help, gear -->
			<div class="footer">
				<Button
					icon="file"
					onclick={() => openPopup(DownloadUpload, 'File')}
					tooltip="file"
				/>
				<Button
					icon="link"
					onclick={() => openPopup(Help, 'Help')}
					tooltip={$isChangelogVersionCurrent ? 'help' : 'new updates'}
					notification={!$isChangelogVersionCurrent}
				/>
				<Button
					icon="gear"
					onclick={() => openPopup(Settings, 'Settings')}
					tooltip="settings"
				/>
			</div>
		</div>

		{#if $selectedFlowId != null && $nodes[$selectedFlowId]}
			{#key $selectedFlowId}
				<div class="title">
					<Title flowId={$selectedFlowId} deleteSelf={() => deleteFlowAndFocus()} />
				</div>
				<div class="box-control">
					<BoxControl flowId={$selectedFlowId} />
				</div>
				<div class="flow" class:customScrollbar={settings.data.customScrollbar.value} on:scroll={fixScroll}>
					<Flow on:focusFlow={focusFlow} flowId={$selectedFlowId} />
				</div>
			{/key}
			{#if showSideDoc}
				<div class="side-doc">
					<SideDoc />
				</div>
			{/if}
		{:else if $nodes.root.children.length > 0}
			<!-- Round exists but no tab selected yet -->
			<div class="no-flow-selected">
				<p>Select a flow from the sidebar or add one.</p>
			</div>
		{/if}
	</div>
</main>

<style>
	:global(body.app) {
		overflow-x: auto;
		overflow-y: clip;
	}
	.grid {
		display: grid;
		gap: var(--gap);
		grid-template-areas:
			'sidebar title box-control'
			'sidebar flow flow';
		grid-template-columns: var(--sidebar-width) 1fr auto;
		padding: var(--main-margin);
		width: 100%;
		height: 100%;
		box-sizing: border-box;
		position: relative;
	}
	.grid:has(.side-doc) {
		grid-template-areas:
			'sidebar title box-control side-doc'
			'sidebar flow flow side-doc';
	}

.sidebar {
		background: var(--background);
		width: 100%;
		height: var(--main-height);
		border-radius: var(--border-radius);
		padding: var(--padding);
		grid-area: sidebar;
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
		gap: var(--padding);
	}

	.header {
		flex-shrink: 0;
	}

	.top-buttons {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: var(--padding);
		flex-wrap: wrap;
	}

	.share-btn-wrapper {
		position: relative;
		display: inline-flex;
	}

	.share-indicator {
		position: absolute;
		bottom: 2px;
		right: 2px;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 8px;
		pointer-events: none;
	}

	.share-indicator.connected {
		background: hsl(140, 60%, 45%);
		color: white;
	}

	.share-indicator.connecting {
		background: hsl(40, 80%, 55%);
		color: white;
	}

	.share-indicator.disconnected {
		background: var(--background-indent);
		color: var(--text-weak);
	}

	.round-name-bar {
		flex-shrink: 0;
		border-radius: var(--border-radius);
		background: var(--background-indent);
		overflow: hidden;
	}

	.round-name-label {
		font-weight: var(--font-weight-bold);
		font-size: 0.9em;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		display: block;
		color: var(--text);
		width: 100%;
		text-align: left;
		background: none;
		border: none;
		padding: var(--padding-small) var(--padding);
		cursor: text;
		font-family: inherit;
	}

	.round-name-label:hover {
		background: var(--background-active);
	}

	.round-name-edit {
		width: 100%;
		box-sizing: border-box;
		background: none;
		border: none;
		outline: 2px solid var(--color-accent);
		border-radius: var(--border-radius);
		padding: var(--padding-small) var(--padding);
		font-family: inherit;
		font-size: 0.9em;
		font-weight: var(--font-weight-bold);
		color: var(--text);
	}

	.tabs {
		overflow-y: auto;
		flex: 1;
		box-sizing: border-box;
		position: relative;
	}
	.tabScroll {
		padding: 0;
		margin: 0;
		padding-bottom: calc(var(--view-height) * 0.6);
	}

	.footer {
		flex-shrink: 0;
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: var(--padding);
		padding-top: var(--padding);
		border-top: 1px solid var(--background-indent);
	}


.title {
		background: var(--background);
		border-radius: var(--border-radius);
		width: 100%;
		grid-area: title;
		height: var(--title-height);
	}
	.box-control {
		background: var(--background);
		border-radius: var(--border-radius);
		width: 100%;
		grid-area: box-control;
		height: var(--title-height);
	}
	.flow {
		width: 100%;
		overflow-x: auto;
		overflow-y: clip;
		background: var(--background);
		z-index: 0;
		border-radius: var(--border-radius);
		grid-area: flow;
		height: var(--view-height);
	}

	.no-flow-selected {
		display: flex;
		align-items: center;
		justify-content: center;
		grid-area: flow;
		color: var(--text-weak);
	}

	.side-doc {
		position: relative;
		width: var(--side-doc-width);
		height: var(--main-height);
		grid-area: side-doc;
	}
</style>
