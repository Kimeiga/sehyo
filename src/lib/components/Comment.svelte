<script lang="ts">
	import type { Comment as CommentType } from '$lib/types';
	import { invalidateAll } from '$app/navigation';
	import ReactionPicker from './ReactionPicker.svelte';
	import Self from './Comment.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Avatar, AvatarImage, AvatarFallback } from '$lib/components/ui/avatar';
	import { Heart } from 'lucide-svelte';

	interface Props {
		comment: CommentType & {
			user?: {
				id: string;
				display_name: string;
				profile_picture_url?: string | null;
				sprite_id?: number | null;
			};
			reaction_counts?: {
				total: number;
				like?: number;
				love?: number;
				haha?: number;
				wow?: number;
				sad?: number;
				angry?: number;
			};
		};
		currentUserId?: string;
		postId: string;
		depth?: number;
	}

	let { comment, currentUserId, postId, depth = 0 }: Props = $props();

	let showReplyForm = $state(false);
	let replyContent = $state('');
	let isSubmitting = $state(false);
	let isDeleting = $state(false);
	let showReplies = $state(false);
	let replies = $state<any[]>([]);
	let loadingReplies = $state(false);
	let hasLoadedReplies = $state(false); // Track if we've checked for replies
	let replyInputRef = $state<HTMLInputElement | null>(null);

	// Focus reply input when reply form is shown
	$effect(() => {
		if (showReplyForm && replyInputRef) {
			setTimeout(() => replyInputRef?.focus(), 0);
		}
	});

	function formatDate(timestamp: number): string {
		const date = new Date(timestamp * 1000);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMins < 1) return 'Just now';
		if (diffMins < 60) return `${diffMins}m`;
		if (diffHours < 24) return `${diffHours}h`;
		if (diffDays < 7) return `${diffDays}d`;

		return date.toLocaleDateString();
	}

	async function handleReply() {
		if (!replyContent.trim()) return;

		isSubmitting = true;

		try {
			const response = await fetch(`/api/posts/${postId}/comments`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					content: replyContent.trim(),
					parent_comment_id: comment.id
				})
			});

			if (!response.ok) throw new Error('Failed to post reply');

			replyContent = '';
			showReplyForm = false;

			// Load replies to show the new one
			await loadReplies();
			showReplies = true;
		} catch (err) {
			alert('Failed to post reply');
		} finally {
			isSubmitting = false;
		}
	}

	async function handleDelete() {
		if (!confirm('Delete this comment?')) return;

		isDeleting = true;

		try {
			const response = await fetch(`/api/comments/${comment.id}`, {
				method: 'DELETE'
			});

			if (!response.ok) throw new Error('Failed to delete comment');

			await invalidateAll();
		} catch (err) {
			alert('Failed to delete comment');
			isDeleting = false;
		}
	}

	async function loadReplies() {
		if (loadingReplies) return;

		loadingReplies = true;

		try {
			const response = await fetch(`/api/comments/${comment.id}`);
			if (!response.ok) throw new Error('Failed to load replies');

			const data = await response.json();
			replies = data.replies || [];
			hasLoadedReplies = true;
		} catch (err) {
			console.error('Failed to load replies:', err);
		} finally {
			loadingReplies = false;
		}
	}

	async function toggleReplies() {
		showReplies = !showReplies;
		if (showReplies && !hasLoadedReplies) {
			await loadReplies();
		}
	}
</script>

<div class="flex gap-2" style="margin-left: {depth * 2}rem">
	<!-- Avatar -->
	<a href="/profile/{comment.user_id}" class="flex-shrink-0">
		{#if comment.user?.display_name === 'Anonymous' && comment.user?.sprite_id}
			<!-- For anonymous users, show sprite as profile picture -->
			<div class="flex size-8 items-center justify-center">
				<img
					src="/sprites/{comment.user.sprite_id}.png"
					alt="Sprite"
					class="h-full w-auto"
					style="image-rendering: pixelated; image-rendering: -moz-crisp-edges; image-rendering: crisp-edges;"
				/>
			</div>
		{:else}
			<!-- For logged-in users, show regular avatar -->
			<Avatar class="size-8">
				<AvatarImage src={comment.user?.profile_picture_url} alt={comment.user?.display_name} />
				<AvatarFallback class="text-xs">
					{comment.user?.display_name?.charAt(0).toUpperCase() || '?'}
				</AvatarFallback>
			</Avatar>
		{/if}
	</a>

	<div class="min-w-0 flex-1">
		<!-- Comment Content -->
		<div class="inline-block max-w-full rounded-2xl bg-muted px-3 py-2">
			<a href="/profile/{comment.user_id}" class="text-sm font-semibold hover:underline">
				{comment.user?.display_name || 'Unknown User'}
			</a>
			<p class="text-sm break-words whitespace-pre-wrap">{comment.content}</p>
		</div>

		<!-- Actions -->
		<div class="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
			{#if currentUserId}
				<ReactionPicker
					targetType="comment"
					targetId={comment.id}
					reactionCounts={comment.reaction_counts}
				/>
				<Button
					variant="ghost"
					size="sm"
					onclick={() => (showReplyForm = !showReplyForm)}
					class="h-auto p-0 font-semibold hover:underline"
				>
					Reply
				</Button>
			{:else}
				<Button variant="ghost" size="sm" disabled class="h-auto gap-1 p-0 font-semibold">
					<Heart class="size-3" />
					Like
				</Button>
				<Button variant="ghost" size="sm" disabled class="h-auto p-0 font-semibold">Reply</Button>
			{/if}
			<span>{formatDate(comment.created_at)}</span>
			{#if currentUserId === comment.user_id}
				<Button
					variant="ghost"
					size="sm"
					onclick={handleDelete}
					disabled={isDeleting}
					class="h-auto p-0 text-destructive hover:underline"
				>
					Delete
				</Button>
			{/if}
		</div>

		<!-- Reply Form -->
		{#if showReplyForm && currentUserId}
			<div class="mt-2 flex gap-2">
				<input
					type="text"
					bind:value={replyContent}
					bind:this={replyInputRef}
					placeholder="Write a reply..."
					disabled={isSubmitting}
					onkeydown={(e) => e.key === 'Enter' && handleReply()}
					class="flex h-8 w-full min-w-0 rounded-full border border-input bg-background px-3 py-1 text-sm shadow-xs ring-offset-background transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
				/>
				<Button
					size="sm"
					onclick={handleReply}
					disabled={isSubmitting || !replyContent.trim()}
					class="h-8 rounded-full"
				>
					{isSubmitting ? '...' : 'Send'}
				</Button>
			</div>
		{/if}

		<!-- Show Replies Button - Only show if there are replies -->
		{#if comment.parent_comment_id === null && depth < 3 && (replies.length > 0 || (hasLoadedReplies && replies.length === 0 && showReplies))}
			<Button
				variant="ghost"
				size="sm"
				onclick={toggleReplies}
				class="mt-2 h-auto p-0 text-xs font-semibold hover:underline"
			>
				{showReplies
					? `Hide ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`
					: `Show ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`}
			</Button>
		{/if}

		<!-- Replies -->
		{#if showReplies && depth < 3}
			<div class="mt-2 space-y-2">
				{#if loadingReplies}
					<p class="text-xs text-muted-foreground">Loading replies...</p>
				{:else if replies.length > 0}
					{#each replies as reply}
						<Self comment={reply} {currentUserId} {postId} depth={depth + 1} />
					{/each}
				{/if}
			</div>
		{/if}
	</div>
</div>
