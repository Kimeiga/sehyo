<script lang="ts">
	import { onMount } from 'svelte';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Avatar, AvatarImage, AvatarFallback } from '$lib/components/ui/avatar';
	import { MessageCircle, Send, Lock, CircleAlert } from 'lucide-svelte';
	import {
		storePrivateKey,
		storePublicKey,
		getStoredPrivateKey,
		getStoredPublicKey,
		hasEncryptionKeys,
		encryptMessage,
		decryptMessage,
		type EncryptedMessage
	} from '$lib/crypto';

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
		cipher_text: string;
		aes_key: string;
		iv: string;
		// Sender-side copy: present on messages sent AFTER the
		// dual-encryption rollout. Lets the sender decrypt their
		// own outgoing messages on reload.
		sender_cipher_text: string | null;
		sender_aes_key: string | null;
		sender_iv: string | null;
		created_at: number;
		read_at: number | null;
		sender_username: string;
		sender_display_name: string;
		sender_profile_picture: string | null;
		decrypted_text?: string;
		decryption_error?: boolean;
	}

	let conversations = $state<Conversation[]>([]);
	let selectedConversation = $state<Conversation | null>(null);
	let messages = $state<Message[]>([]);
	let newMessage = $state('');
	let isLoading = $state(false);
	let isSending = $state(false);
	let isSettingUpEncryption = $state(false);
	let encryptionSetup = $state(hasEncryptionKeys());
	let messagesContainer = $state<HTMLDivElement>();

	// Initialize encryption keys if not already set up
	async function setupEncryption() {
		if (hasEncryptionKeys()) {
			encryptionSetup = true;
			return;
		}

		isSettingUpEncryption = true;
		try {
			// For anonymous users or users without keys, generate keys server-side
			// This ensures they can use messaging even if they're temporary accounts
			const response = await fetch('/api/user/generate-keys', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			});

			if (!response.ok) {
				throw new Error('Failed to generate encryption keys');
			}

			const keys = await response.json();

			// Store keys locally (private key NEVER sent to server, only returned once!)
			storePrivateKey(keys.private_key);
			storePublicKey(keys.public_key);

			encryptionSetup = true;
		} catch (error) {
			console.error('Encryption setup error:', error);
			alert('Failed to set up encryption. Please try again.');
		} finally {
			isSettingUpEncryption = false;
		}
	}

	// Load conversations
	async function loadConversations() {
		try {
			const response = await fetch('/api/messages/conversations');
			if (!response.ok) throw new Error('Failed to load conversations');

			const data = await response.json();
			conversations = data.conversations;
		} catch (error) {
			console.error('Load conversations error:', error);
		}
	}

	// Load messages for a conversation
	async function loadMessages(userId: string) {
		isLoading = true;
		try {
			const response = await fetch(`/api/messages/${userId}`);
			if (!response.ok) throw new Error('Failed to load messages');

			// IMPORTANT: do NOT name this `data` — that shadows the
			// component-level `data` prop, and the sender-id check
			// below reads .user.id off this response object instead
			// of off the actual session, leaving every outgoing
			// message looking "not mine" and falling back to the
			// recipient cipher (which the sender can't decrypt).
			const responseBody = await response.json();
			const allMessages = responseBody.messages as Message[];

			// Decrypt messages. We swallow per-message decrypt errors
			// silently — they happen when an older message was
			// encrypted to a public key the viewer no longer holds the
			// matching private key for (e.g. they cleared
			// localStorage, signed in on a new device, or regenerated
			// keys). These messages are unrecoverable from the
			// viewer's side, so we drop them from the displayed list
			// rather than littering the console with per-message
			// stack traces.
			const privateKey = getStoredPrivateKey();
			let undecryptableCount = 0;
			const decrypted: Message[] = [];
			if (privateKey) {
				for (const message of allMessages) {
					// Pick the cipher copy that was encrypted to the
					// viewer's pubkey. If we're the SENDER and a
					// sender-side copy exists, use that; otherwise
					// fall back to the recipient copy. (Old messages
					// from before the dual-encryption rollout only
					// have the recipient copy, so they remain
					// undecryptable from the sender's side and get
					// hidden as before.)
					const isOwn = message.sender_id === data.user?.id;
					const useSenderCopy =
						isOwn &&
						message.sender_cipher_text &&
						message.sender_aes_key &&
						message.sender_iv;
					const encrypted: EncryptedMessage = useSenderCopy
						? {
							cipher_text: message.sender_cipher_text!,
							aes_key: message.sender_aes_key!,
							iv: message.sender_iv!
						}
						: {
							cipher_text: message.cipher_text,
							aes_key: message.aes_key,
							iv: message.iv
						};
					try {
						message.decrypted_text = await decryptMessage(encrypted, privateKey);
						decrypted.push(message);
					} catch {
						undecryptableCount++;
					}
				}
			} else {
				decrypted.push(...allMessages);
			}
			if (undecryptableCount > 0) {
				console.warn(
					`messages: ${undecryptableCount} older message(s) couldn't be decrypted with the current key — hiding them.`
				);
			}
			messages = decrypted;

			// Scroll to bottom
			setTimeout(() => {
				if (messagesContainer) {
					messagesContainer.scrollTop = messagesContainer.scrollHeight;
				}
			}, 100);
		} catch (error) {
			console.error('Load messages error:', error);
		} finally {
			isLoading = false;
		}
	}

	// Select a conversation
	function selectConversation(conversation: Conversation) {
		selectedConversation = conversation;
		loadMessages(conversation.user_id);
	}

	// Send a message
	async function sendMessage() {
		if (!newMessage.trim() || !selectedConversation || isSending) return;

		isSending = true;
		const messageText = newMessage.trim();
		newMessage = '';

		try {
			// Get recipient's public key
			const recipientPublicKey = await fetch(`/api/user/${selectedConversation.user_id}/public-key`)
				.then((r) => r.json())
				.then((d) => d.public_key);

			if (!recipientPublicKey) {
				throw new Error(
					`${selectedConversation.display_name ?? 'This user'} hasn't set up messages yet — they need to open /messages once before they can receive your message.`
				);
			}

			// Encrypt the message twice — once to the recipient and
			// once to the sender — so the sender can later decrypt
			// their own outgoing message on reload. Without the
			// second copy, the sender's loadMessages() can't open
			// the cipher (it was sealed with the recipient's
			// pubkey) and the message appears to vanish.
			const encrypted = await encryptMessage(messageText, recipientPublicKey);
			const senderPublicKey = getStoredPublicKey();
			let senderEncrypted: EncryptedMessage | null = null;
			if (senderPublicKey) {
				try {
					senderEncrypted = await encryptMessage(messageText, senderPublicKey);
				} catch (err) {
					console.warn('Sender-side encryption failed; outgoing copy will be unrecoverable on reload.', err);
				}
			}

			// Send encrypted message
			const response = await fetch('/api/messages/send', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					recipient_id: selectedConversation.user_id,
					cipher_text: encrypted.cipher_text,
					aes_key: encrypted.aes_key,
					iv: encrypted.iv,
					sender_cipher_text: senderEncrypted?.cipher_text ?? null,
					sender_aes_key: senderEncrypted?.aes_key ?? null,
					sender_iv: senderEncrypted?.iv ?? null
				})
			});

			if (!response.ok) throw new Error('Failed to send message');

			// Reload messages
			await loadMessages(selectedConversation.user_id);
		} catch (err) {
			console.error('Send message error:', err);
			const msg = err instanceof Error ? err.message : 'Failed to send message. Please try again.';
			alert(msg);
			newMessage = messageText; // Restore message
		} finally {
			isSending = false;
		}
	}

	// If we arrive here with `?to=<userId>&name=…&handle=…&pic=…` (e.g.
	// from the "Message" button on a profile page), splice that user
	// in as a stub conversation at the top of the list and auto-select
	// it so the user can immediately type. The actual conversation row
	// is created server-side once the first message is sent.
	async function consumeProfileHandoff() {
		if (typeof window === 'undefined') return;
		const params = new URLSearchParams(window.location.search);
		const to = params.get('to');
		if (!to) return;
		const stub: Conversation = {
			user_id: to,
			username: params.get('handle') ?? '',
			display_name: params.get('name') ?? params.get('handle') ?? 'New conversation',
			profile_picture_url: params.get('pic') || null,
			last_message_at: Date.now(),
			unread_count: 0
		};
		const existing = conversations.find((c) => c.user_id === to);
		if (existing) {
			selectConversation(existing);
		} else {
			conversations = [stub, ...conversations];
			selectConversation(stub);
		}
		// Strip the params so a refresh doesn't keep re-handing-off.
		const url = new URL(window.location.href);
		url.search = '';
		history.replaceState({}, '', url.toString());
	}

	onMount(async () => {
		await setupEncryption();
		await loadConversations();
		await consumeProfileHandoff();
	});
</script>

<div class="messages-root container mx-auto px-4 py-8 max-w-6xl">
	{#if !data.user}
		<!-- Sign in prompt for non-authenticated users -->
		<Card>
			<CardHeader>
				<CardTitle class="flex items-center gap-2">
					<MessageCircle class="size-6" />
					Messages
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div class="text-center py-12">
					<Lock class="size-16 mx-auto text-muted-foreground mb-4" />
					<h3 class="text-xl font-semibold mb-2">Sign in to view messages</h3>
					<p class="text-muted-foreground mb-6">
						Access your end-to-end encrypted messages by signing in.
					</p>
					<a href="/auth/login">
						<Button>Sign In</Button>
					</a>
				</div>
			</CardContent>
		</Card>
	{:else if !encryptionSetup}
		<Card>
			<CardHeader>
				<CardTitle class="flex items-center gap-2">
					<Lock class="size-6" />
					Setting Up Encryption
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div class="text-center py-12">
					<Lock class="size-16 mx-auto text-blue-600 mb-4" />
					<h3 class="text-xl font-semibold mb-2">Generating Encryption Keys...</h3>
					<p class="text-muted-foreground mb-4">
						We're setting up end-to-end encryption for your messages. This will only take a moment.
					</p>
					{#if isSettingUpEncryption}
						<div class="animate-spin size-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
					{/if}
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
						<Lock class="size-4 ml-auto text-green-600" title="End-to-end encrypted" />
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
						<p
							class="mt-3 text-xs text-muted-foreground flex items-center justify-center gap-1.5"
						>
							<Lock class="size-3" />
							Messages are end-to-end encrypted. Only you and {selectedConversation.display_name} can read them.
						</p>
					</CardHeader>

					<!-- Messages -->
					<CardContent class="flex-1 overflow-y-auto p-4" bind:this={messagesContainer}>
						{#if isLoading}
							<div class="flex justify-center items-center h-full">
								<div class="animate-spin size-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
							</div>
						{:else if messages.length === 0}
							<div class="flex flex-col items-center justify-center h-full text-center">
								<Lock class="size-16 text-muted-foreground mb-4" />
								<h3 class="text-lg font-semibold mb-2">Start a conversation</h3>
								<p class="text-sm text-muted-foreground">
									Send your first end-to-end encrypted message!
								</p>
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
												{#if message.decryption_error}
													<div class="flex items-center gap-2 text-red-500">
														<CircleAlert class="size-4" />
														<span class="text-sm">Failed to decrypt message</span>
													</div>
												{:else if message.decrypted_text}
													<p class="text-sm whitespace-pre-wrap break-words">{message.decrypted_text}</p>
												{:else}
													<div class="flex items-center gap-2">
														<Lock class="size-4" />
														<span class="text-sm italic">Decrypting...</span>
													</div>
												{/if}
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

					<!-- Message Input — no E2EE notice here; that lives at
					     the top of the conversation now. No bottom padding;
					     the form sits flush against the bottom edge of the
					     card. -->
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
	   of the shadcn card-on-muted look. We override the CSS custom
	   property locally so every Card / Input / button-bg-card-muted
	   inside this page renders flat against --background, matching
	   the rest of the app. */
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

