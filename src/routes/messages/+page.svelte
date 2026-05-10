<script lang="ts">
	import { onMount } from 'svelte';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Avatar, AvatarImage, AvatarFallback } from '$lib/components/ui/avatar';
	import { MessageCircle, Send } from 'lucide-svelte';

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
	}

	let conversations = $state<Conversation[]>([]);
	let selectedConversation = $state<Conversation | null>(null);
	let messages = $state<Message[]>([]);
	let newMessage = $state('');
	let isLoading = $state(false);
	let isSending = $state(false);
	let messagesContainer = $state<HTMLDivElement>();

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

	async function loadMessages(userId: string) {
		isLoading = true;
		try {
			const response = await fetch(`/api/messages/${userId}`);
			if (!response.ok) throw new Error('Failed to load messages');
			const body = await response.json();
			messages = (body.messages ?? []) as Message[];
			setTimeout(() => {
				if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;
			}, 100);
		} catch (err) {
			console.error('Load messages error:', err);
		} finally {
			isLoading = false;
		}
	}

	// Selecting a conversation mirrors the choice into the URL as
	// `?with=<userId>` so reload / share / back behaves naturally.
	// replaceState (not pushState) — we don't want each row click to
	// add a history entry.
	function selectConversation(conversation: Conversation) {
		selectedConversation = conversation;
		loadMessages(conversation.user_id);
		if (typeof window !== 'undefined') {
			const url = new URL(window.location.href);
			url.searchParams.set('with', conversation.user_id);
			url.searchParams.delete('to');
			url.searchParams.delete('name');
			url.searchParams.delete('handle');
			url.searchParams.delete('pic');
			history.replaceState({}, '', url.toString());
		}
	}

	async function sendMessage() {
		if (!newMessage.trim() || !selectedConversation || isSending) return;

		isSending = true;
		const messageText = newMessage.trim();
		newMessage = '';
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
			await loadMessages(selectedConversation.user_id);
		} catch (err) {
			console.error('Send message error:', err);
			alert(err instanceof Error ? err.message : 'Failed to send message. Try again.');
			newMessage = messageText;
		} finally {
			isSending = false;
		}
	}

	// On mount, look at the URL and auto-select.
	//   • `?with=<userId>` — canonical form written by selectConversation.
	//   • `?to=<userId>&name=…&handle=…&pic=…` — legacy "Message"
	//     button handoff from /[username]: splice in a stub if the
	//     conversations list doesn't have the user yet.
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
	});
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
			<!-- Conversations List -->
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
							{#each conversations as conversation}
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

			<!-- Messages View -->
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
						{#if isLoading}
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
							<div class="space-y-4">
								{#each messages as message}
									{@const isOwn = message.sender_id === data.user?.id}
									<div class="flex {isOwn ? 'justify-end' : 'justify-start'}">
										<div class="max-w-[70%]">
											{#if !isOwn}
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
												class="rounded-lg px-4 py-2 {isOwn
													? 'bg-blue-600 text-white'
													: 'bg-muted text-foreground'}"
											>
												<p class="text-sm whitespace-pre-wrap break-words">{message.content}</p>
											</div>
											<p class="text-xs text-muted-foreground mt-1 {isOwn ? 'text-right' : 'text-left'}">
												{new Date(message.created_at * 1000).toLocaleTimeString()}
											</p>
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</CardContent>

					<div class="border-t p-4">
						<form
							onsubmit={(e) => {
								e.preventDefault();
								sendMessage();
							}}
							class="flex gap-2"
						>
							<Input
								bind:value={newMessage}
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
	/* Force the messages page to use Sehyo's black background instead
	   of the shadcn card-on-muted look. */
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
</style>
