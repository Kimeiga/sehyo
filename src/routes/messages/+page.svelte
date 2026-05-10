<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Avatar, AvatarImage, AvatarFallback } from '$lib/components/ui/avatar';
	import { MessageCircle, Send, Check, CheckCheck } from 'lucide-svelte';

	interface Props {
		data: {
			user: {
				id: string;
				username: string;
				display_name: string;
			} | null;
		};
	}

	const { data }: Props = $props();

	interface Conversation {
		user_id: string;
		username: string;
		display_name: string;
		profile_picture_url: string | null;
		last_message_at: number;
		unread_count: number;
	}

	interface Message {
		id: string;
		sender_id: string;
		recipient_id: string;
		content: string;
		created_at: number;
		read_at: number | null;
		sender_username: string;
		sender_display_name: string;
		sender_profile_picture: string | null;
		// Optimistic flag: client-side only, not persisted. Lets us
		// render a pending/just-sent message with a "Sending…" tick
		// before the server's INSERT response comes back.
		_pending?: boolean;
	}

	let conversations = $state<Conversation[]>([]);
	let selectedConversation = $state<Conversation | null>(null);
	let messages = $state<Message[]>([]);
	let newMessage = $state('');
	let isSending = $state(false);
	let isLoadingInitial = $state(false);
	let messagesContainer = $state<HTMLDivElement>();
	let otherTyping = $state(false);

	// ── Polling cadence ─────────────────────────────────────────────
	// 2s while the page is visible, paused while hidden, plus an
	// immediate refresh on visibilitychange so coming back from a
	// background tab feels live.
	const ACTIVE_POLL_MS = 2000;
	const CONVOS_POLL_MS = 8000;
	let activePollTimer: ReturnType<typeof setInterval> | null = null;
	let convosPollTimer: ReturnType<typeof setInterval> | null = null;

	function startActivePoll() {
		stopActivePoll();
		activePollTimer = setInterval(() => {
			if (typeof document !== 'undefined' && document.hidden) return;
			if (!selectedConversation) return;
			pollNewMessages(selectedConversation.user_id);
		}, ACTIVE_POLL_MS);
	}
	function stopActivePoll() {
		if (activePollTimer) {
			clearInterval(activePollTimer);
			activePollTimer = null;
		}
	}

	function startConversationsPoll() {
		stopConversationsPoll();
		convosPollTimer = setInterval(() => {
			if (typeof document !== 'undefined' && document.hidden) return;
			loadConversations();
		}, CONVOS_POLL_MS);
	}
	function stopConversationsPoll() {
		if (convosPollTimer) {
			clearInterval(convosPollTimer);
			convosPollTimer = null;
		}
	}

	function onVisibilityChange() {
		if (document.hidden) return;
		// Tab came back to foreground — refresh both immediately.
		loadConversations();
		if (selectedConversation) pollNewMessages(selectedConversation.user_id);
	}

	async function loadConversations() {
		try {
			const response = await fetch('/api/messages/conversations');
			if (!response.ok) throw new Error('Failed to load conversations');
			const body = await response.json();
			conversations = body.conversations ?? [];
		} catch (err) {
			console.error('Load conversations error:', err);
		}
	}

	async function loadMessagesInitial(userId: string) {
		isLoadingInitial = true;
		try {
			const response = await fetch(`/api/messages/${userId}`);
			if (!response.ok) throw new Error('Failed to load messages');
			const body = await response.json();
			messages = (body.messages ?? []) as Message[];
			otherTyping = !!body.other_typing;
			scrollToBottomSoon();
		} catch (err) {
			console.error('Load messages error:', err);
		} finally {
			isLoadingInitial = false;
		}
	}

	// Delta poll: ?since=<latestServerTimestamp> returns just the new
	// messages. We append them, refresh read receipts on existing
	// messages by patching read_at fields, and sync typing state.
	async function pollNewMessages(userId: string) {
		try {
			const latest = lastServerTimestamp();
			const url = latest
				? `/api/messages/${userId}?since=${latest}`
				: `/api/messages/${userId}`;
			const response = await fetch(url);
			if (!response.ok) return;
			const body = await response.json();
			const incoming = (body.messages ?? []) as Message[];
			otherTyping = !!body.other_typing;

			if (incoming.length > 0) {
				// Drop any optimistic placeholders the server has now
				// echoed back (matched by content+sender within ~2s).
				// Then append the new server messages.
				const incomingIds = new Set(incoming.map((m) => m.id));
				messages = [
					...messages.filter((m) => !m._pending && !incomingIds.has(m.id)),
					...messages.filter(
						(m) =>
							m._pending &&
							!incoming.some(
								(s) =>
									s.sender_id === m.sender_id &&
									s.content === m.content &&
									Math.abs(s.created_at - m.created_at) < 5
							)
					),
					...incoming
				].sort((a, b) => a.created_at - b.created_at);
				scrollToBottomSoon();
			}

			// Always refresh read_at for our outgoing messages so the
			// "Sent → Seen" tick can update without a full reload. We
			// pull these in a separate cheap query: latest read_at for
			// our recent outgoing messages. Doing it inline here by
			// fetching a tiny window of recent messages without
			// `since`.
			await refreshOwnReadReceipts(userId);
		} catch (err) {
			console.error('Poll messages error:', err);
		}
	}

	async function refreshOwnReadReceipts(userId: string) {
		// Cheap heuristic: if we have any unread outgoing messages
		// in the visible list, hit the messages endpoint with
		// ?peek=1 (no read marking) and patch read_at fields onto
		// matching ids. Throttle to once per ~6s.
		const ownUnread = messages.some((m) => m.sender_id === data.user?.id && !m.read_at);
		if (!ownUnread) return;
		const now = Date.now();
		if (now - lastReadReceiptCheckAt < 6000) return;
		lastReadReceiptCheckAt = now;
		try {
			const response = await fetch(`/api/messages/${userId}?peek=1`);
			if (!response.ok) return;
			const body = await response.json();
			const fresh = (body.messages ?? []) as Message[];
			const readMap = new Map<string, number | null>();
			for (const m of fresh) readMap.set(m.id, m.read_at);
			messages = messages.map((m) => {
				if (readMap.has(m.id) && readMap.get(m.id) !== m.read_at) {
					return { ...m, read_at: readMap.get(m.id) ?? null };
				}
				return m;
			});
		} catch (err) {
			console.error('Read-receipt refresh error:', err);
		}
	}

	let lastReadReceiptCheckAt = 0;

	function lastServerTimestamp(): number {
		// Use the highest non-pending created_at as the watermark.
		let max = 0;
		for (const m of messages) {
			if (!m._pending && m.created_at > max) max = m.created_at;
		}
		return max;
	}

	function scrollToBottomSoon() {
		setTimeout(() => {
			if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}, 50);
	}

	function selectConversation(conversation: Conversation) {
		if (selectedConversation?.user_id === conversation.user_id) return;
		selectedConversation = conversation;
		messages = [];
		otherTyping = false;
		loadMessagesInitial(conversation.user_id);

		if (typeof window !== 'undefined') {
			const url = new URL(window.location.href);
			url.searchParams.set('with', conversation.user_id);
			url.searchParams.delete('to');
			url.searchParams.delete('name');
			url.searchParams.delete('handle');
			url.searchParams.delete('pic');
			history.replaceState({}, '', url.toString());
		}
		startActivePoll();
	}

	// ── Typing indicator (outgoing) ─────────────────────────────────
	// Throttled to once every 2s so we don't hammer D1 per keystroke.
	let lastTypingPingAt = 0;
	function pingTyping() {
		if (!selectedConversation || !data.user) return;
		const now = Date.now();
		if (now - lastTypingPingAt < 2000) return;
		lastTypingPingAt = now;
		fetch('/api/messages/typing', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({ recipient_id: selectedConversation.user_id })
		}).catch(() => {
			/* swallow */
		});
	}

	async function sendMessage() {
		if (!newMessage.trim() || !selectedConversation || isSending || !data.user) return;

		const messageText = newMessage.trim();
		newMessage = '';
		isSending = true;

		// Optimistic append: render immediately with _pending=true.
		const optimisticId = `pending-${crypto.randomUUID()}`;
		const optimisticTs = Math.floor(Date.now() / 1000);
		const optimistic: Message = {
			id: optimisticId,
			sender_id: data.user.id,
			recipient_id: selectedConversation.user_id,
			content: messageText,
			created_at: optimisticTs,
			read_at: null,
			sender_username: data.user.username,
			sender_display_name: data.user.display_name,
			sender_profile_picture: null,
			_pending: true
		};
		messages = [...messages, optimistic];
		scrollToBottomSoon();

		try {
			const response = await fetch('/api/messages/send', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({
					recipient_id: selectedConversation.user_id,
					content: messageText
				})
			});
			if (!response.ok) {
				const body = await response.json().catch(() => ({}));
				throw new Error(body?.message ?? 'Failed to send message');
			}
			const body = await response.json();
			const sent = body.message as Message | null;
			if (sent) {
				messages = messages.map((m) => (m.id === optimisticId ? sent : m));
			} else {
				// Server didn't return the row — just drop the pending
				// flag, the next poll will reconcile.
				messages = messages.map((m) =>
					m.id === optimisticId ? { ...m, _pending: false } : m
				);
			}
		} catch (err) {
			console.error('Send message error:', err);
			// Roll back the optimistic message and restore the input.
			messages = messages.filter((m) => m.id !== optimisticId);
			newMessage = messageText;
			alert(err instanceof Error ? err.message : 'Failed to send message. Try again.');
		} finally {
			isSending = false;
		}
	}

	async function applyUrlSelection() {
		if (typeof window === 'undefined') return;
		const params = new URLSearchParams(window.location.search);
		const target = params.get('with') ?? params.get('to');
		if (!target) return;

		const existing = conversations.find((c) => c.user_id === target);
		if (existing) {
			selectConversation(existing);
			return;
		}
		const stub: Conversation = {
			user_id: target,
			username: params.get('handle') ?? '',
			display_name: params.get('name') ?? params.get('handle') ?? 'New conversation',
			profile_picture_url: params.get('pic') || null,
			last_message_at: Date.now(),
			unread_count: 0
		};
		conversations = [stub, ...conversations];
		selectConversation(stub);
	}

	onMount(async () => {
		await loadConversations();
		await applyUrlSelection();
		startConversationsPoll();
		if (typeof document !== 'undefined') {
			document.addEventListener('visibilitychange', onVisibilityChange);
		}
	});

	onDestroy(() => {
		stopActivePoll();
		stopConversationsPoll();
		if (typeof document !== 'undefined') {
			document.removeEventListener('visibilitychange', onVisibilityChange);
		}
	});

	function formatTime(unixSeconds: number): string {
		return new Date(unixSeconds * 1000).toLocaleTimeString([], {
			hour: 'numeric',
			minute: '2-digit'
		});
	}
</script>

<div class="messages-root container mx-auto px-4 py-8 max-w-6xl">
	{#if !data.user}
		<Card>
			<CardHeader>
				<CardTitle class="flex items-center gap-2">
					<MessageCircle class="size-6" />
					Messages
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div class="text-center py-12">
					<MessageCircle class="size-16 mx-auto text-muted-foreground mb-4" />
					<h3 class="text-xl font-semibold mb-2">Sign in to view messages</h3>
					<p class="text-muted-foreground mb-6">Sign in to start a conversation.</p>
					<a href="/auth/login">
						<Button>Sign In</Button>
					</a>
				</div>
			</CardContent>
		</Card>
	{:else}
		<div class="grid grid-cols-1 md:grid-cols-3 gap-4 h-[calc(100vh-12rem)]">
			<Card class="md:col-span-1">
				<CardHeader>
					<CardTitle class="flex items-center gap-2">
						<MessageCircle class="size-5" />
						Messages
					</CardTitle>
				</CardHeader>
				<CardContent class="p-0">
					<div class="overflow-y-auto max-h-[calc(100vh-16rem)]">
						{#if conversations.length === 0}
							<div class="text-center py-8 px-4">
								<MessageCircle class="size-12 mx-auto text-muted-foreground mb-2" />
								<p class="text-sm text-muted-foreground">No conversations yet</p>
								<p class="text-xs text-muted-foreground mt-1">
									Start a conversation from a user's profile
								</p>
							</div>
						{:else}
							{#each conversations as conversation (conversation.user_id)}
								<button
									onclick={() => selectConversation(conversation)}
									class="w-full p-4 hover:bg-accent transition-colors border-b border-border text-left {selectedConversation?.user_id ===
									conversation.user_id
										? 'bg-accent'
										: ''}"
								>
									<div class="flex items-center gap-3">
										<Avatar>
											<AvatarImage src={conversation.profile_picture_url} alt={conversation.display_name} />
											<AvatarFallback>{conversation.display_name[0]}</AvatarFallback>
										</Avatar>
										<div class="flex-1 min-w-0">
											<div class="flex items-center justify-between">
												<p class="font-semibold truncate">{conversation.display_name}</p>
												{#if conversation.unread_count > 0}
													<span class="bg-blue-600 text-white text-xs rounded-full px-2 py-0.5">
														{conversation.unread_count}
													</span>
												{/if}
											</div>
											<p class="text-sm text-muted-foreground truncate">@{conversation.username}</p>
										</div>
									</div>
								</button>
							{/each}
						{/if}
					</div>
				</CardContent>
			</Card>

			<Card class="md:col-span-2 flex flex-col">
				{#if selectedConversation}
					<CardHeader class="border-b">
						<div class="flex items-center gap-3">
							<Avatar>
								<AvatarImage
									src={selectedConversation.profile_picture_url}
									alt={selectedConversation.display_name}
								/>
								<AvatarFallback>{selectedConversation.display_name[0]}</AvatarFallback>
							</Avatar>
							<div class="flex-1">
								<CardTitle class="text-lg">{selectedConversation.display_name}</CardTitle>
								<p class="text-sm text-muted-foreground">@{selectedConversation.username}</p>
							</div>
						</div>
					</CardHeader>

					<CardContent class="flex-1 overflow-y-auto p-4" bind:this={messagesContainer}>
						{#if isLoadingInitial}
							<div class="flex justify-center items-center h-full">
								<div class="animate-spin size-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
							</div>
						{:else if messages.length === 0}
							<div class="flex flex-col items-center justify-center h-full text-center">
								<MessageCircle class="size-16 text-muted-foreground mb-4" />
								<h3 class="text-lg font-semibold mb-2">Start a conversation</h3>
								<p class="text-sm text-muted-foreground">Send your first message.</p>
							</div>
						{:else}
							<div class="space-y-3">
								{#each messages as message, idx (message.id)}
									{@const isOwn = message.sender_id === data.user?.id}
									{@const prev = messages[idx - 1]}
									{@const showAvatar = !isOwn && (!prev || prev.sender_id !== message.sender_id)}
									{@const isLatestOwn =
										isOwn &&
										idx === messages.length - 1}
									<div class="flex {isOwn ? 'justify-end' : 'justify-start'}">
										<div class="max-w-[70%] flex flex-col {isOwn ? 'items-end' : 'items-start'}">
											{#if showAvatar}
												<div class="flex items-center gap-2 mb-1">
													<Avatar class="size-6">
														<AvatarImage
															src={message.sender_profile_picture}
															alt={message.sender_display_name}
														/>
														<AvatarFallback>{message.sender_display_name[0]}</AvatarFallback>
													</Avatar>
													<span class="text-xs text-muted-foreground">{message.sender_display_name}</span>
												</div>
											{/if}
											<div
												class="rounded-2xl px-4 py-2 {isOwn
													? 'bg-blue-600 text-white'
													: 'bg-muted text-foreground'} {message._pending ? 'opacity-70' : ''}"
											>
												<p class="text-sm whitespace-pre-wrap break-words">{message.content}</p>
											</div>
											<p
												class="text-[11px] text-muted-foreground mt-1 flex items-center gap-1 {isOwn
													? 'self-end'
													: 'self-start'}"
											>
												<span>{formatTime(message.created_at)}</span>
												{#if isOwn}
													{#if message._pending}
														<span class="italic">Sending…</span>
													{:else if message.read_at && isLatestOwn}
														<CheckCheck class="size-3 text-blue-500" />
														<span>Seen</span>
													{:else if message.read_at}
														<CheckCheck class="size-3 text-blue-500" />
													{:else if isLatestOwn}
														<Check class="size-3" />
														<span>Sent</span>
													{:else}
														<Check class="size-3" />
													{/if}
												{/if}
											</p>
										</div>
									</div>
								{/each}

								{#if otherTyping}
									<div class="flex justify-start">
										<div class="max-w-[70%]">
											<div class="rounded-2xl px-4 py-2 bg-muted text-foreground inline-flex items-center gap-1">
												<span class="typing-dot"></span>
												<span class="typing-dot"></span>
												<span class="typing-dot"></span>
											</div>
											<p class="text-[11px] text-muted-foreground mt-1">
												{selectedConversation.display_name} is typing…
											</p>
										</div>
									</div>
								{/if}
							</div>
						{/if}
					</CardContent>

					<div class="border-t p-3">
						<form
							onsubmit={(e) => {
								e.preventDefault();
								sendMessage();
							}}
							class="flex gap-2"
						>
							<Input
								bind:value={newMessage}
								oninput={pingTyping}
								placeholder="Type a message…"
								disabled={isSending}
								class="flex-1"
							/>
							<Button type="submit" disabled={!newMessage.trim() || isSending}>
								{#if isSending}
									<div class="animate-spin size-4 border-2 border-white border-t-transparent rounded-full"></div>
								{:else}
									<Send class="size-4" />
								{/if}
							</Button>
						</form>
					</div>
				{:else}
					<CardContent class="flex-1 flex items-center justify-center">
						<div class="text-center">
							<MessageCircle class="size-16 mx-auto text-muted-foreground mb-4" />
							<h3 class="text-lg font-semibold mb-2">Select a conversation</h3>
							<p class="text-sm text-muted-foreground">
								Choose a conversation from the list to start messaging
							</p>
						</div>
					</CardContent>
				{/if}
			</Card>
		</div>
	{/if}
</div>

<style>
	.messages-root {
		--card: var(--background);
		--popover: var(--background);
		--muted: oklch(0.16 0 0);
	}
	.messages-root :global(.bg-card) {
		background-color: var(--background) !important;
	}
	.messages-root :global(.bg-muted) {
		background-color: oklch(0.16 0 0) !important;
	}

	.typing-dot {
		display: inline-block;
		width: 6px;
		height: 6px;
		border-radius: 999px;
		background: var(--muted-foreground);
		opacity: 0.5;
		animation: typing 1.2s infinite ease-in-out;
	}
	.typing-dot:nth-child(2) { animation-delay: 0.15s; }
	.typing-dot:nth-child(3) { animation-delay: 0.3s; }

	@keyframes typing {
		0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
		40% { transform: translateY(-3px); opacity: 1; }
	}
</style>
