<script lang="ts">
	import type { Comment as CommentType } from '$lib/types';
	import { invalidateAll } from '$app/navigation';
	import ReactionPicker from './ReactionPicker.svelte';
	import Self from './Comment.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Avatar, AvatarImage, AvatarFallback } from '$lib/components/ui/avatar';
	import { Input } from '$lib/components/ui/input';

	interface Props {
		comment: CommentType & {
			user?: {
				id: string;
				display_name: string;
				profile_picture_url?: string | null;
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
		<Avatar class="size-8">
			<AvatarImage src={comment.user?.profile_picture_url} alt={comment.user?.display_name} />
			<AvatarFallback class="text-xs">
				{comment.user?.display_name?.charAt(0).toUpperCase() || '?'}
			</AvatarFallback>
		</Avatar>
	</a>

	<div class="flex-1 min-w-0">
		<!-- Comment Content -->
		<div class="bg-muted rounded-2xl px-3 py-2 inline-block max-w-full">
			<a href="/profile/{comment.user_id}" class="font-semibold text-sm hover:underline">
				{comment.user?.display_name || 'Unknown User'}
			</a>
			<p class="text-sm whitespace-pre-wrap break-words">{comment.content}</p>
		</div>

		<!-- Actions -->
		<div class="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
			<ReactionPicker targetType="comment" targetId={comment.id} reactionCounts={comment.reaction_counts} />
			<Button
				variant="ghost"
				size="sm"
				onclick={() => (showReplyForm = !showReplyForm)}
				class="h-auto p-0 hover:underline font-semibold"
			>
				Reply
			</Button>
			<span>{formatDate(comment.created_at)}</span>
			{#if currentUserId === comment.user_id}
				<Button
					variant="ghost"
					size="sm"
					onclick={handleDelete}
					disabled={isDeleting}
					class="h-auto p-0 hover:underline text-destructive"
				>
					Delete
				</Button>
			{/if}
		</div>

		<!-- Reply Form -->
		{#if showReplyForm}
			<div class="mt-2 flex gap-2">
				<Input
					type="text"
					bind:value={replyContent}
					placeholder="Write a reply..."
					disabled={isSubmitting}
					onkeydown={(e) => e.key === 'Enter' && handleReply()}
					class="h-8 text-sm rounded-full"
				/>
				<Button
					size="sm"
					onclick={handleReply}
					disabled={isSubmitting || !replyContent.trim()}
					class="rounded-full h-8"
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
				class="mt-2 h-auto p-0 text-xs hover:underline font-semibold"
			>
				{showReplies ? `Hide ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}` : `Show ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`}
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

